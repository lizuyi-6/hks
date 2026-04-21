"""Real matching adapter —— 规则分 + 向量相似度加权融合。

召回（`matching_engine._recall_candidates`）已经做了 tag + embedding 双路
RRF 合并，这里在 **rerank** 阶段继续沿用"双信号"思路：

* 规则分 —— 对 intent/region/practice_areas 的命中、评分、订单量、SLA 给出
  解释性的打分。
* 向量分（`EmbeddingMatchingAdapter`）—— 对"需求-服务"标签空间的余弦相似
  度打分，能捕捉 practice_areas 与 intent_category 不完全一致但语义相近
  的候选。

最终得分 = 0.6 * 规则分(归一化) + 0.4 * 向量分(归一化)，并且把两边的
`reasons` 合并，让用户看到"为什么推荐你"既有规则解释也有相似度解释。
"""
from __future__ import annotations

from typing import Any

from apps.api.app.adapters.base import make_envelope
from apps.api.app.adapters.real.matching_embedding import EmbeddingMatchingAdapter
from apps.api.app.ports.interfaces import MatchingPort
from apps.api.app.schemas.common import SourceRef

_RULE_WEIGHT = 0.6
_EMBED_WEIGHT = 0.4


def _rule_rank(intent, profile_vector, candidates) -> list[dict[str, Any]]:
    """Deterministic rule-based scoring (practice_areas / region / rating / orders / SLA)."""
    intent_cat = (intent or {}).get("category", "")
    region = (intent or {}).get("region", "")
    want_tags = set((profile_vector or {}).get("tags", []))

    ranked: list[dict[str, Any]] = []
    for cand in candidates:
        score = 0.0
        reasons: list[str] = []

        areas = set(cand.get("practice_areas", []))
        if intent_cat and intent_cat in areas:
            score += 40
            reasons.append(f"擅长「{intent_cat}」领域")
        tag_overlap = want_tags & areas
        if tag_overlap:
            score += 5 * len(tag_overlap)
            reasons.append(f"命中 {len(tag_overlap)} 条需求标签")

        regions = set(cand.get("regions", []))
        if region and (region in regions or "全国" in regions):
            score += 15
            reasons.append(f"覆盖{region}服务")

        rating = float(cand.get("rating_avg", 0) or 0)
        score += rating * 4
        if rating >= 4.6:
            reasons.append(f"评分 {rating:.1f} / 5")

        orders = int(cand.get("orders_count", 0) or 0)
        score += min(orders * 0.3, 10)
        if orders >= 30:
            reasons.append(f"已交付 {orders} 单")

        sla = int(cand.get("response_sla_minutes", 999) or 999)
        if sla <= 60:
            score += 6
            reasons.append("1 小时内响应")

        ranked.append({
            "provider_id": cand.get("provider_id"),
            "product_id": cand.get("product_id"),
            "score": round(score, 2),
            "reasons": reasons,
        })

    ranked.sort(key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(ranked):
        r["rank"] = i + 1
    return ranked


def _normalize(rows: list[dict[str, Any]]) -> dict[str, float]:
    """Return {provider_id: normalized_score in [0,1]}."""
    if not rows:
        return {}
    max_score = max((float(r.get("score") or 0) for r in rows), default=0.0)
    if max_score <= 0:
        return {r["provider_id"]: 0.0 for r in rows if r.get("provider_id")}
    return {
        r["provider_id"]: float(r.get("score") or 0) / max_score
        for r in rows
        if r.get("provider_id")
    }


class RealMatchingAdapter(MatchingPort):
    port_name = "matching"
    provider_name = "a1plus-matching-v1"
    mode = "real"

    def __init__(self) -> None:
        self._embed = EmbeddingMatchingAdapter()

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def rank(self, intent, profile_vector, candidates, trace_id):
        if not candidates:
            return make_envelope(
                mode=self.mode,
                provider=self.provider_name,
                trace_id=trace_id,
                source_refs=[SourceRef(title="hybrid matching v1 (rule + embedding)")],
                disclaimer="匹配结果仅供参考，以实际沟通结果为准。",
                normalized_payload=[],
            )

        rule_rows = _rule_rank(intent, profile_vector, candidates)
        embed_env = self._embed.rank(intent, profile_vector, candidates, trace_id)
        embed_rows: list[dict[str, Any]] = list(embed_env.normalized_payload or [])

        rule_norm = _normalize(rule_rows)
        embed_norm = _normalize(embed_rows)

        rule_by_id = {r["provider_id"]: r for r in rule_rows if r.get("provider_id")}
        embed_by_id = {r["provider_id"]: r for r in embed_rows if r.get("provider_id")}

        fused: list[dict[str, Any]] = []
        all_ids = set(rule_by_id) | set(embed_by_id)
        for pid in all_ids:
            rule_row = rule_by_id.get(pid, {})
            embed_row = embed_by_id.get(pid, {})

            r_score = rule_norm.get(pid, 0.0)
            e_score = embed_norm.get(pid, 0.0)
            fused_score = _RULE_WEIGHT * r_score + _EMBED_WEIGHT * e_score

            # Merge reasons: 保留顺序、去重。规则分在前，向量分的"相似度"在最后补充。
            reasons: list[str] = []
            seen: set[str] = set()
            for src in (rule_row.get("reasons") or []):
                if src and src not in seen:
                    reasons.append(src)
                    seen.add(src)
            for src in (embed_row.get("reasons") or []):
                if src and src not in seen:
                    reasons.append(src)
                    seen.add(src)

            fused.append({
                "provider_id": pid,
                "product_id": rule_row.get("product_id") or embed_row.get("product_id"),
                "score": round(fused_score * 100, 2),
                "rule_score": round(r_score * 100, 2),
                "embed_score": round(e_score * 100, 2),
                "similarity": embed_row.get("similarity"),
                "reasons": reasons,
            })

        fused.sort(key=lambda x: x["score"], reverse=True)
        for i, r in enumerate(fused):
            r["rank"] = i + 1

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[
                SourceRef(title="hybrid matching v1 (rule 0.6 + embedding 0.4)"),
                SourceRef(title="rule-based reranker (practice_areas / rating / orders / SLA)"),
                SourceRef(title="embedding reranker (cosine over weighted tag vectors)"),
            ],
            disclaimer="匹配结果仅供参考，以实际沟通结果为准。",
            normalized_payload=fused,
        )
