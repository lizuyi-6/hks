"""MatchingEngine — 智能匹配引擎.

Two-stage:
  1. Rule-based recall — filter providers whose practice_areas intersect the
     intent category, whose regions cover the request region, and whose
     rating / verification is above a floor.
  2. Port-based rerank — delegate to `MatchingPort` (default rule reranker;
     swappable for a real ML reranker in production).

Results are persisted as `MatchingRequest` + `MatchingCandidate` rows and
also fan out to the provider side as `ProviderLead` entries so the supply
side sees fresh, scored leads immediately (精准获客 loop).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.db.models import (
    LegalServiceProvider,
    MatchingCandidate,
    MatchingRequest,
    ProviderLead,
    ServiceProduct,
    User,
)
from apps.api.app.services import event_types
from apps.api.app.services.event_bus import emit_event
from apps.api.app.services.profile_engine import build_profile_fingerprint

logger = logging.getLogger(__name__)


# Categories whose matching results should also push leads to providers.
LEAD_CATEGORIES = {"trademark", "patent", "copyright", "contract", "litigation", "dueDiligence", "compliance"}


def _provider_to_candidate(db: Session, p: LegalServiceProvider, intent: str | None) -> dict[str, Any]:
    """Hydrate a provider row into the flat candidate dict used downstream."""
    best_product = None
    if intent:
        best_product = (
            db.query(ServiceProduct)
            .filter(ServiceProduct.provider_id == p.id)
            .filter(ServiceProduct.status == "active")
            .filter(or_(
                ServiceProduct.category == intent,
                ServiceProduct.category == "general",
            ))
            .order_by(ServiceProduct.sold_count.desc())
            .first()
        )
    if best_product is None:
        best_product = (
            db.query(ServiceProduct)
            .filter(ServiceProduct.provider_id == p.id)
            .filter(ServiceProduct.status == "active")
            .order_by(ServiceProduct.sold_count.desc())
            .first()
        )

    return {
        "provider_id": p.id,
        "product_id": best_product.id if best_product else None,
        "name": p.name,
        "short_intro": p.short_intro,
        "practice_areas": list(p.practice_areas or []),
        "regions": list(p.regions or []),
        "featured_tags": list(p.featured_tags or []),
        "rating_avg": p.rating_avg,
        "orders_count": p.orders_count,
        "win_rate": p.win_rate,
        "response_sla_minutes": p.response_sla_minutes,
        "product_name": best_product.name if best_product else None,
        "product_price": best_product.price if best_product else None,
        "product_delivery_days": best_product.delivery_days if best_product else None,
    }


def _recall_by_tags(
    db: Session,
    fingerprint: dict[str, Any],
    top_n: int = 30,
) -> list[dict[str, Any]]:
    """召回路径 1 — 标签硬过滤 + 评分*交付量排序。

    严格按 intent / region 过滤，再按 rating*10+orders 取 top_n，保证
    明显相关的候选不会被丢掉。
    """
    intent = fingerprint.get("intent_category")
    region = fingerprint.get("region") or ""

    providers = (
        db.query(LegalServiceProvider)
        .filter(LegalServiceProvider.status == "active")
        .all()
    )

    out: list[dict[str, Any]] = []
    for p in providers:
        if region and region != "全国":
            if p.regions and region not in p.regions and "全国" not in p.regions:
                continue
        # 硬过滤：intent 命中 practice_areas（若 intent 为空则跳过此过滤）
        if intent:
            practice_areas = set(p.practice_areas or [])
            if intent not in practice_areas and "general" not in practice_areas:
                continue
        out.append(_provider_to_candidate(db, p, intent))

    out.sort(
        key=lambda x: (x["rating_avg"] or 0) * 10 + (x["orders_count"] or 0),
        reverse=True,
    )
    return out[:top_n]


def build_provider_tag_vec(provider: LegalServiceProvider) -> dict[str, float]:
    """Return the canonical bag-of-tags vector for a provider.

    Isolated helper so the embedding recall path, the provider upsert route,
    and any offline backfill script share the exact same tokenization rules.
    Output is a plain ``dict[str, float]`` so it can be JSON-persisted into
    ``legal_service_providers.tag_vec`` directly.
    """
    from apps.api.app.adapters.real.matching_embedding import _build_vec, _tokens

    tokens = _tokens(
        list(provider.practice_areas or []) + list(provider.featured_tags or [])
    )
    vec = _build_vec(tokens)
    return {k: float(v) for k, v in vec.items()}


def recompute_provider_tag_vec(
    db: Session, provider: LegalServiceProvider, *, commit: bool = True
) -> None:
    """(Re)materialize ``provider.tag_vec`` on disk."""
    from datetime import datetime, timezone

    provider.tag_vec = build_provider_tag_vec(provider)
    provider.tag_vec_updated_at = datetime.now(timezone.utc)
    if commit:
        db.commit()


def _recall_by_embedding(
    db: Session,
    fingerprint: dict[str, Any],
    top_n: int = 30,
) -> list[dict[str, Any]]:
    """召回路径 2 — 向量召回（bag-of-tags 余弦相似度）。

    不做 intent/region 硬过滤，只用语义相似度排序，作为"跨领域可能匹配"
    的补集。provider.tag_vec 由 `recompute_provider_tag_vec` 落盘，读路径
    直接使用；若列为空（历史数据 / 未回填）则退化为即时构建，保持向后
    兼容，不在读路径写回以避免写放大。
    """
    from collections import Counter

    from apps.api.app.adapters.real.matching_embedding import (
        _build_vec,
        _cosine,
        _tokens,
    )

    intent_cat = fingerprint.get("intent_category") or ""
    user_tokens = _tokens(fingerprint.get("tags") or [])
    if intent_cat:
        user_tokens.append(str(intent_cat).lower())
    user_vec = _build_vec(user_tokens)

    providers = (
        db.query(LegalServiceProvider)
        .filter(LegalServiceProvider.status == "active")
        .all()
    )

    scored: list[tuple[float, dict[str, Any]]] = []
    for p in providers:
        persisted = p.tag_vec or {}
        if persisted:
            cand_vec: Counter[str] = Counter()
            for k, v in persisted.items():
                cand_vec[k] = float(v)
        else:
            cand_tokens = _tokens(
                list(p.practice_areas or []) + list(p.featured_tags or [])
            )
            cand_vec = _build_vec(cand_tokens)
        sim = _cosine(user_vec, cand_vec)
        if sim <= 0:
            continue
        cand = _provider_to_candidate(db, p, intent_cat or None)
        cand["_similarity"] = round(sim, 4)
        scored.append((sim, cand))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:top_n]]


def _rrf_merge(
    rankings: list[list[dict[str, Any]]],
    top_n: int = 20,
    k: int = 60,
) -> list[dict[str, Any]]:
    """Reciprocal Rank Fusion —— 将多路召回按 1/(k+rank) 求和合并。

    参考 Cormack et al. 2009. `k=60` 是业界常用默认值。同一 provider 出现
    在多路中时，累加其贡献；`source_paths` 记录它从哪条路径来，方便在
    envelope 的 sourceRefs 里展示"双路召回"信息。
    """
    aggregated: dict[str, dict[str, Any]] = {}
    for path_idx, ranking in enumerate(rankings):
        path_label = ("tag", "embedding")[path_idx] if path_idx < 2 else f"path{path_idx}"
        for rank_idx, cand in enumerate(ranking):
            pid = cand.get("provider_id")
            if not pid:
                continue
            contribution = 1.0 / (k + rank_idx + 1)
            entry = aggregated.get(pid)
            if entry is None:
                cand_copy = dict(cand)
                cand_copy["_rrf_score"] = contribution
                cand_copy["_source_paths"] = [path_label]
                aggregated[pid] = cand_copy
            else:
                entry["_rrf_score"] += contribution
                if path_label not in entry["_source_paths"]:
                    entry["_source_paths"].append(path_label)

    merged = sorted(
        aggregated.values(),
        key=lambda x: x.get("_rrf_score", 0.0),
        reverse=True,
    )
    return merged[:top_n]


def _recall_candidates(
    db: Session,
    fingerprint: dict[str, Any],
    top_n: int = 15,
) -> list[dict[str, Any]]:
    """双路召回 + RRF 合并。

    路径 1：tag 召回（硬过滤 + 评分排序）——保证"领域相关"候选
    路径 2：embedding 召回（向量相似度）——覆盖跨领域/弱 intent 场景
    然后用 Reciprocal Rank Fusion 合并，取 top_n。若只有一路有结果（例
    如 intent 为空时 tag 路径无法过滤，或语料极稀疏时 embedding 路径全
    为 0），merge 会退化为单路，不影响流水。
    """
    tag_candidates = _recall_by_tags(db, fingerprint, top_n=30)
    vec_candidates = _recall_by_embedding(db, fingerprint, top_n=30)

    # 都没命中 → 退化到不做 intent 硬过滤，兜底返回评分最高的几条。
    if not tag_candidates and not vec_candidates:
        fallback = (
            db.query(LegalServiceProvider)
            .filter(LegalServiceProvider.status == "active")
            .order_by(
                LegalServiceProvider.rating_avg.desc(),
                LegalServiceProvider.orders_count.desc(),
            )
            .limit(top_n)
            .all()
        )
        return [
            _provider_to_candidate(db, p, fingerprint.get("intent_category"))
            for p in fallback
        ]

    merged = _rrf_merge([tag_candidates, vec_candidates], top_n=top_n)

    logger.info(
        "matching recall: tag=%d vec=%d merged=%d (intent=%s region=%s)",
        len(tag_candidates),
        len(vec_candidates),
        len(merged),
        fingerprint.get("intent_category"),
        fingerprint.get("region"),
    )
    return merged


def run_matching(
    db: Session,
    user: User,
    raw_query: str,
    top_k: int = 5,
    trace_id: str | None = None,
) -> tuple[MatchingRequest, list[dict[str, Any]]]:
    """Build fingerprint → recall → rerank → persist → fan out leads."""
    fingerprint = build_profile_fingerprint(db, user, raw_query, persist=True)

    # Persist the matching request
    request = MatchingRequest(
        user_id=user.id,
        intent_category=fingerprint["intent_category"],
        raw_query=raw_query,
        budget_range=fingerprint.get("budget"),
        urgency=fingerprint.get("urgency", "normal"),
        region=fingerprint.get("region"),
        profile_snapshot={
            "industry": user.industry,
            "stage": user.stage,
            "business_name": user.business_name,
        },
        profile_vector={"tags": fingerprint["tags"]},
        status="matching",
    )
    db.add(request)
    db.flush()

    # Recall
    candidates = _recall_candidates(db, fingerprint, top_n=15)
    if not candidates:
        request.status = "no_match"
        db.commit()
        return request, []

    # Rerank via port
    matcher = provider_registry.get("matching")
    intent_payload = {
        "category": fingerprint["intent_category"],
        "region": fingerprint["region"],
        "budget": fingerprint.get("budget"),
        "urgency": fingerprint["urgency"],
    }
    envelope = matcher.rank(intent_payload, fingerprint, candidates, trace_id or request.id)
    ranked = envelope.normalized_payload[:top_k]

    by_id = {c["provider_id"]: c for c in candidates}
    result: list[dict[str, Any]] = []
    for r in ranked:
        cand_row = MatchingCandidate(
            request_id=request.id,
            provider_id=r["provider_id"],
            product_id=r.get("product_id"),
            score=r.get("score", 0),
            rank=r.get("rank", 0),
            reasons=r.get("reasons", []),
        )
        db.add(cand_row)

        # Push lead to provider (精准获客)
        if fingerprint["intent_category"] in LEAD_CATEGORIES and r.get("score", 0) >= 30:
            lead = ProviderLead(
                provider_id=r["provider_id"],
                user_id=user.id,
                matching_request_id=request.id,
                score=r.get("score", 0),
                temperature="warm",  # placeholder, overwritten below
                status="new",
                snapshot={
                    "industry": user.industry,
                    "stage": user.stage,
                    "intent": fingerprint["intent_category"],
                    "urgency": fingerprint["urgency"],
                    "budget": fingerprint.get("budget"),
                    "region": fingerprint.get("region"),
                    "tags": fingerprint["tags"][:10],
                    "query_excerpt": raw_query[:160],
                    "reasons": r.get("reasons", []),
                },
                expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            )
            db.add(lead)
            db.flush()

            # Blend score with urgency / budget / recency / client activity so
            # the provider pool shows a meaningful distribution even when raw
            # match scores cluster. See `provider_crm.compute_lead_temperature`.
            from apps.api.app.services.provider_crm import recompute_lead_temperature

            temperature, _ = recompute_lead_temperature(db, lead, commit=False)

            # 高分线索 → 发事件给场景推送规则 scenario.provider_fresh_lead
            # 接收方是律师账号本人（LegalServiceProvider.user_id）
            try:
                provider_row = (
                    db.query(LegalServiceProvider)
                    .filter(LegalServiceProvider.id == r["provider_id"])
                    .first()
                )
                provider_user_id = provider_row.user_id if provider_row else None
                if provider_user_id:
                    emit_event(
                        db,
                        event_type=event_types.PROVIDER_LEAD_CREATED,
                        user_id=provider_user_id,
                        tenant_id=None,
                        source_entity_type="provider_lead",
                        source_entity_id=lead.id,
                        payload={
                            "lead_id": lead.id,
                            "provider_id": r["provider_id"],
                            "client_user_id": user.id,
                            "score": float(r.get("score", 0)),
                            "temperature": temperature,
                            "intent": fingerprint["intent_category"],
                            "urgency": fingerprint["urgency"],
                            "region": fingerprint.get("region"),
                        },
                    )
            except Exception:
                logger.exception(
                    "emit provider.lead_created failed for lead %s", lead.id
                )

        original = by_id.get(r["provider_id"], {})
        merged = {**original, **r}
        result.append(merged)

    request.status = "matched"
    db.commit()
    return request, result


def list_matching_requests(db: Session, user_id: str, limit: int = 10) -> list[MatchingRequest]:
    return (
        db.query(MatchingRequest)
        .filter(MatchingRequest.user_id == user_id)
        .order_by(MatchingRequest.created_at.desc())
        .limit(limit)
        .all()
    )


def get_matching_detail(db: Session, user_id: str, request_id: str) -> dict[str, Any] | None:
    request = (
        db.query(MatchingRequest)
        .filter(MatchingRequest.id == request_id, MatchingRequest.user_id == user_id)
        .first()
    )
    if not request:
        return None

    candidates = (
        db.query(MatchingCandidate)
        .filter(MatchingCandidate.request_id == request.id)
        .order_by(MatchingCandidate.rank.asc())
        .all()
    )
    items: list[dict[str, Any]] = []
    for c in candidates:
        provider = db.query(LegalServiceProvider).filter(LegalServiceProvider.id == c.provider_id).first()
        product = db.query(ServiceProduct).filter(ServiceProduct.id == c.product_id).first() if c.product_id else None
        if not provider:
            continue
        items.append({
            "candidate_id": c.id,
            "rank": c.rank,
            "score": c.score,
            "reasons": c.reasons,
            "provider": {
                "id": provider.id,
                "name": provider.name,
                "providerType": provider.provider_type,
                "shortIntro": provider.short_intro,
                "avatarUrl": provider.avatar_url,
                "ratingAvg": float(provider.rating_avg or 0),
                "ordersCount": provider.orders_count or 0,
                "responseSlaMinutes": provider.response_sla_minutes or 0,
                "regions": provider.regions or [],
                "practiceAreas": provider.practice_areas or [],
                "featuredTags": provider.featured_tags or [],
                "hourlyRateRange": provider.hourly_rate_range,
            },
            "product": {
                "id": product.id,
                "providerId": product.provider_id,
                "name": product.name,
                "summary": product.summary,
                "category": product.category,
                "price": product.price,
                "priceMode": product.price_mode,
                "deliveryDays": product.delivery_days,
            } if product else None,
        })

    return {
        "request": {
            "id": request.id,
            "intent_category": request.intent_category,
            "raw_query": request.raw_query,
            "urgency": request.urgency,
            "budget_range": request.budget_range,
            "region": request.region,
            "status": request.status,
            "profile_vector": request.profile_vector,
            "profile_snapshot": request.profile_snapshot,
            "created_at": request.created_at.isoformat(),
        },
        "candidates": items,
    }
