"""Embedding-based matching reranker.

Builds a sparse "bag-of-tags" vector for both the user profile fingerprint
and each provider candidate, then ranks by cosine similarity, with small
boosts from rating / orders / SLA / regional coverage.

We deliberately avoid a heavyweight vector-DB dependency: the reranker works
offline using Python's `math` module, so it can be the default in production
when `PROFILE_MATCHING_MODE=embedding` is set.

Inputs mirror `MatchingPort.rank(intent, profile_vector, candidates, trace_id)`:

* `intent.category` / `intent.region` / `intent.budget`
* `profile_vector.tags` — tag names from profile_engine
* each candidate has `practice_areas`, `featured_tags`, `regions`,
  `rating_avg`, `orders_count`, `response_sla_minutes`

Output is compatible with the existing rule-based reranker (list of
`{provider_id, product_id, score, reasons, rank}`) so downstream consumers
in `matching_engine.py` do not need to change.
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Iterable

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import MatchingPort
from apps.api.app.schemas.common import SourceRef


def _tokens(items: Iterable[str] | None) -> list[str]:
    if not items:
        return []
    return [str(t).strip().lower() for t in items if t]


def _tag_weight(tag: str) -> float:
    """Give higher weight to primary categories vs ancillary tags."""
    primary = {"trademark", "patent", "copyright", "contract",
               "litigation", "compliance", "dueDiligence",
               "duediligence", "m&a", "brand", "invention"}
    return 2.0 if tag.lower() in primary else 1.0


def _build_vec(tokens: Iterable[str]) -> Counter[str]:
    vec: Counter[str] = Counter()
    for t in tokens:
        if not t:
            continue
        vec[t] += _tag_weight(t)
    return vec


def _cosine(a: Counter[str], b: Counter[str]) -> float:
    if not a or not b:
        return 0.0
    common = set(a) & set(b)
    dot = sum(a[k] * b[k] for k in common)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


class EmbeddingMatchingAdapter(MatchingPort):
    """Cosine-similarity reranker on bag-of-tags vectors.

    Not a neural embedding (avoids dependency bloat) but close enough in
    behavior to demo a meaningful similarity story; swap `_build_vec` for a
    real embedding call later if desired.
    """

    port_name = "matching"
    provider_name = "a1plus-matching-embedding-v1"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def rank(self, intent, profile_vector, candidates, trace_id):
        intent_cat = str((intent or {}).get("category") or "").strip()
        region = str((intent or {}).get("region") or "").strip()

        # User side: intent + profile tags (weighted).
        user_tokens = _tokens((profile_vector or {}).get("tags", []))
        if intent_cat:
            user_tokens.append(intent_cat.lower())
        user_vec = _build_vec(user_tokens)

        ranked = []
        for cand in candidates:
            areas = _tokens(cand.get("practice_areas", []))
            featured = _tokens(cand.get("featured_tags", []))
            cand_vec = _build_vec(areas + featured)

            sim = _cosine(user_vec, cand_vec)
            base = round(sim * 100, 2)
            reasons: list[str] = []
            if sim >= 0.7:
                reasons.append(f"需求-服务相似度 {sim:.2f}（高）")
            elif sim >= 0.4:
                reasons.append(f"需求-服务相似度 {sim:.2f}（中）")
            elif sim > 0:
                reasons.append(f"需求-服务相似度 {sim:.2f}")

            overlap = set(user_tokens) & set(areas + featured)
            if overlap:
                reasons.append(f"命中 {len(overlap)} 项标签：{', '.join(sorted(overlap)[:3])}")

            regions = set(cand.get("regions", []) or [])
            region_boost = 0.0
            if region and (region in regions or "全国" in regions):
                region_boost = 12.0
                reasons.append(f"覆盖{region}服务")

            rating = float(cand.get("rating_avg", 0) or 0)
            rating_boost = rating * 3
            if rating >= 4.6:
                reasons.append(f"评分 {rating:.1f} / 5")

            orders = int(cand.get("orders_count", 0) or 0)
            orders_boost = min(orders * 0.25, 8)
            if orders >= 30:
                reasons.append(f"已交付 {orders} 单")

            sla = int(cand.get("response_sla_minutes", 999) or 999)
            sla_boost = 0.0
            if sla <= 60:
                sla_boost = 5
                reasons.append("1 小时内响应")

            score = round(base + region_boost + rating_boost + orders_boost + sla_boost, 2)

            ranked.append({
                "provider_id": cand.get("provider_id"),
                "product_id": cand.get("product_id"),
                "score": score,
                "reasons": reasons,
                "similarity": round(sim, 4),
            })

        ranked.sort(key=lambda x: x["score"], reverse=True)
        for i, r in enumerate(ranked):
            r["rank"] = i + 1

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="embedding-based matching v1 (cosine over tag vectors)")],
            disclaimer="匹配结果仅供参考，以实际沟通结果为准。",
            normalized_payload=ranked,
        )
