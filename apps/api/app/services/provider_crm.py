"""ProviderCRM — 律师端线索池 / 客户画像 / ROI 报表.

Core loop:
    User sends query → MatchingEngine writes ProviderLead per top candidate
    → Lawyer sees leads in pool → claim → convert to ServiceOrder → deliver.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from apps.api.app.db.models import (
    LegalServiceProvider,
    MatchingRequest,
    ProviderLead,
    ServiceOrder,
    ServiceProduct,
    User,
    UserProfileTag,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lead temperature scoring (D1) — blends multiple demand signals instead of
# bucketing purely on the match score. Keeps the storage column compatible
# (hot/warm/cool/cold) so legacy consumers don't break, but writes the full
# breakdown into ``lead.snapshot['temperature_signals']`` for UI transparency.
# ---------------------------------------------------------------------------
_TEMP_THRESHOLDS = (
    (0.75, "hot"),
    (0.50, "warm"),
    (0.25, "cool"),
)


def _temp_from_composite(composite: float) -> str:
    for threshold, label in _TEMP_THRESHOLDS:
        if composite >= threshold:
            return label
    return "cold"


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def _budget_signal(budget_range: str | None) -> float:
    """Map free-form budget buckets onto a 0-1 scale.

    Accepted strings include: ``'<1000'``, ``'1000-5000'``, ``'5000-20000'``,
    ``'>20000'`` or raw numbers. Missing budget → 0.35 (mid-weight) so we
    don't unfairly penalize fresh leads that haven't pinned a number yet.
    """
    if not budget_range:
        return 0.35
    s = str(budget_range).lower()
    if ">" in s or "20000" in s or "high" in s:
        return 1.0
    if "5000" in s or "mid" in s:
        return 0.7
    if "1000" in s:
        return 0.4
    if "<" in s or "low" in s:
        return 0.2
    # Raw number path, e.g. "15000".
    n = _safe_float(s)
    if n >= 20000:
        return 1.0
    if n >= 5000:
        return 0.7
    if n >= 1000:
        return 0.4
    if n > 0:
        return 0.2
    return 0.35


def _urgency_signal(urgency: str | None) -> float:
    return {"urgent": 1.0, "normal": 0.6, "low": 0.3}.get(
        (urgency or "normal").lower(), 0.6
    )


def _recency_signal(created_at: datetime | None, now: datetime) -> float:
    if not created_at:
        return 0.5
    # SQLite reads back datetimes as naive UTC; normalize so arithmetic with
    # the tz-aware ``now`` doesn't blow up.
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    delta = now - created_at
    hours = max(0.0, delta.total_seconds() / 3600.0)
    if hours <= 24:
        return 1.0
    if hours <= 72:
        return 0.7
    if hours <= 168:  # 1 week
        return 0.4
    return 0.2


def _activity_signal(
    db: Session, lead: ProviderLead, now: datetime
) -> float:
    """Secondary pulse: has the client kept engaging after the initial match?

    Counts fresh matching requests + consultation sessions opened by the same
    user within the last 7 days. Saturation at 3 events → 1.0.
    """
    cutoff = now - timedelta(days=7)
    match_count = (
        db.query(func.count(MatchingRequest.id))
        .filter(
            MatchingRequest.user_id == lead.user_id,
            MatchingRequest.created_at >= cutoff,
        )
        .scalar()
        or 0
    )
    order_count = (
        db.query(func.count(ServiceOrder.id))
        .filter(
            ServiceOrder.user_id == lead.user_id,
            ServiceOrder.created_at >= cutoff,
        )
        .scalar()
        or 0
    )
    events = int(match_count) + int(order_count)
    return min(1.0, events / 3.0)


def compute_lead_temperature(
    db: Session, lead: ProviderLead, *, now: datetime | None = None
) -> tuple[str, float, dict[str, float]]:
    """Return ``(temperature, composite_score, signals)`` for ``lead``.

    The composite lives on [0, 1]. Signals are also returned so the caller
    can stash them on ``lead.snapshot['temperature_signals']`` to power the
    lawyer workbench tooltip ("热度为何是 hot").
    """

    now = now or datetime.now(timezone.utc)
    matching = (
        db.query(MatchingRequest)
        .filter(MatchingRequest.id == lead.matching_request_id)
        .first()
        if lead.matching_request_id
        else None
    )

    score_signal = max(0.0, min(1.0, _safe_float(lead.score) / 100.0))
    urgency = matching.urgency if matching else "normal"
    budget = matching.budget_range if matching else None

    signals = {
        "score": round(score_signal, 3),
        "urgency": round(_urgency_signal(urgency), 3),
        "budget": round(_budget_signal(budget), 3),
        "recency": round(_recency_signal(lead.created_at, now), 3),
        "activity": round(_activity_signal(db, lead, now), 3),
    }

    weights = {
        "score": 0.40,
        "urgency": 0.20,
        "budget": 0.15,
        "recency": 0.15,
        "activity": 0.10,
    }
    composite = sum(signals[k] * weights[k] for k in weights)
    composite = round(max(0.0, min(1.0, composite)), 3)
    return _temp_from_composite(composite), composite, signals


def recompute_lead_temperature(
    db: Session, lead: ProviderLead, *, commit: bool = True
) -> tuple[str, float]:
    """Recompute + persist temperature on ``lead``; returns new state.

    Writes the signal breakdown into ``snapshot['temperature_signals']`` so
    the UI can explain the score. Safe to call idempotently from the D5
    daily batch or on-demand from the provider workbench.
    """
    temperature, composite, signals = compute_lead_temperature(db, lead)
    lead.temperature = temperature
    snapshot = dict(lead.snapshot or {})
    snapshot["temperature_signals"] = {
        "composite": composite,
        "components": signals,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    lead.snapshot = snapshot
    if commit:
        db.commit()
    return temperature, composite


def get_providers_for_user(db: Session, user: User) -> list[LegalServiceProvider]:
    return db.query(LegalServiceProvider).filter(LegalServiceProvider.user_id == user.id).all()


def require_provider(db: Session, user: User, provider_id: str | None = None) -> LegalServiceProvider:
    q = db.query(LegalServiceProvider).filter(LegalServiceProvider.user_id == user.id)
    if provider_id:
        q = q.filter(LegalServiceProvider.id == provider_id)
    provider = q.first()
    if not provider:
        raise ValueError("未找到匹配的律师档案")
    return provider


def list_leads(
    db: Session,
    provider_id: str,
    status: str | None = None,
    temperature: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    q = db.query(ProviderLead).filter(ProviderLead.provider_id == provider_id)
    if status:
        q = q.filter(ProviderLead.status == status)
    if temperature:
        q = q.filter(ProviderLead.temperature == temperature)
    rows = q.order_by(ProviderLead.score.desc(), ProviderLead.created_at.desc()).limit(limit).all()
    return [lead_to_dict(db, r) for r in rows]


def lead_to_dict(db: Session, lead: ProviderLead) -> dict[str, Any]:
    user = db.query(User).filter(User.id == lead.user_id).first()
    matching = (
        db.query(MatchingRequest).filter(MatchingRequest.id == lead.matching_request_id).first()
        if lead.matching_request_id
        else None
    )
    snapshot = lead.snapshot or {}
    temp_signals = snapshot.get("temperature_signals") if isinstance(snapshot, dict) else None
    return {
        "id": lead.id,
        "providerId": lead.provider_id,
        "score": lead.score,
        "temperature": lead.temperature,
        "temperatureSignals": temp_signals,
        "status": lead.status,
        "snapshot": snapshot,
        "user": {
            "id": user.id if user else None,
            "name": user.full_name if user else None,
            "industry": user.industry if user else None,
            "stage": user.stage if user else None,
            "businessName": user.business_name if user else None,
        } if user else None,
        "matching": {
            "id": matching.id,
            "intentCategory": matching.intent_category,
            "rawQuery": matching.raw_query,
            "urgency": matching.urgency,
            "region": matching.region,
        } if matching else None,
        "claimedAt": lead.claimed_at.isoformat() if lead.claimed_at else None,
        "expiresAt": lead.expires_at.isoformat() if lead.expires_at else None,
        "assigneeId": lead.assignee_id,
        "assignedAt": lead.assigned_at.isoformat() if lead.assigned_at else None,
        "createdAt": lead.created_at.isoformat(),
    }


def claim_lead(db: Session, provider_id: str, lead_id: str) -> ProviderLead:
    lead = db.query(ProviderLead).filter(
        ProviderLead.id == lead_id, ProviderLead.provider_id == provider_id
    ).first()
    if not lead:
        raise ValueError("线索不存在")
    lead.status = "claimed"
    lead.claimed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lead)
    return lead


def mark_lead_status(db: Session, provider_id: str, lead_id: str, status: str) -> ProviderLead:
    lead = db.query(ProviderLead).filter(
        ProviderLead.id == lead_id, ProviderLead.provider_id == provider_id
    ).first()
    if not lead:
        raise ValueError("线索不存在")
    lead.status = status
    if status == "claimed":
        lead.claimed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lead)
    return lead


def client_profile(db: Session, provider_id: str, user_id: str) -> dict[str, Any]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("客户不存在")

    tags = (
        db.query(UserProfileTag)
        .filter(UserProfileTag.user_id == user.id)
        .order_by(UserProfileTag.confidence.desc())
        .limit(30)
        .all()
    )
    leads = (
        db.query(ProviderLead)
        .filter(ProviderLead.user_id == user.id, ProviderLead.provider_id == provider_id)
        .order_by(ProviderLead.created_at.desc())
        .all()
    )
    orders = (
        db.query(ServiceOrder)
        .filter(ServiceOrder.user_id == user.id, ServiceOrder.provider_id == provider_id)
        .order_by(ServiceOrder.created_at.desc())
        .all()
    )

    grouped_tags: dict[str, list[dict]] = defaultdict(list)
    for t in tags:
        grouped_tags[t.tag_type].append({
            "value": t.tag_value, "confidence": t.confidence, "source": t.source,
        })

    return {
        "user": {
            "id": user.id,
            "name": user.full_name,
            "email": user.email,
            "businessName": user.business_name,
            "industry": user.industry,
            "stage": user.stage,
            "ipFocus": user.ip_focus,
        },
        "tagsByCategory": grouped_tags,
        "leads": [lead_to_dict(db, l) for l in leads],
        "orders": [{
            "id": o.id,
            "orderNo": o.order_no,
            "status": o.status,
            "amount": o.amount,
            "createdAt": o.created_at.isoformat(),
        } for o in orders],
        "lifetimeValue": sum((o.amount or 0) for o in orders if o.status == "closed"),
        "intentCategories": sorted({
            (db.query(MatchingRequest).filter(MatchingRequest.id == l.matching_request_id).first().intent_category
             if l.matching_request_id and db.query(MatchingRequest).filter(MatchingRequest.id == l.matching_request_id).first() else None)
            for l in leads
            if l.matching_request_id
        } - {None}),
    }


def roi_report(db: Session, provider_id: str, days: int = 30) -> dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=days)

    leads_total = (
        db.query(func.count(ProviderLead.id))
        .filter(ProviderLead.provider_id == provider_id, ProviderLead.created_at >= since)
        .scalar()
        or 0
    )
    leads_claimed = (
        db.query(func.count(ProviderLead.id))
        .filter(
            ProviderLead.provider_id == provider_id,
            ProviderLead.status.in_(["claimed", "quoted", "won"]),
            ProviderLead.created_at >= since,
        )
        .scalar()
        or 0
    )
    leads_won = (
        db.query(func.count(ProviderLead.id))
        .filter(
            ProviderLead.provider_id == provider_id,
            ProviderLead.status == "won",
            ProviderLead.created_at >= since,
        )
        .scalar()
        or 0
    )

    orders = (
        db.query(ServiceOrder)
        .filter(ServiceOrder.provider_id == provider_id, ServiceOrder.created_at >= since)
        .all()
    )
    orders_total = len(orders)
    orders_closed = sum(1 for o in orders if o.status == "closed")
    revenue = sum((o.amount or 0) for o in orders if o.status == "closed")

    by_category: dict[str, dict[str, float]] = defaultdict(lambda: {"count": 0, "revenue": 0})
    for o in orders:
        product = db.query(ServiceProduct).filter(ServiceProduct.id == o.product_id).first() if o.product_id else None
        cat = (product.category if product else "other") or "other"
        by_category[cat]["count"] += 1
        if o.status == "closed":
            by_category[cat]["revenue"] += o.amount or 0

    rating_avg = (
        db.query(func.avg(ServiceOrder.user_rating))
        .filter(ServiceOrder.provider_id == provider_id, ServiceOrder.user_rating.isnot(None))
        .scalar()
    )

    return {
        "windowDays": days,
        "leads": {
            "total": leads_total,
            "claimed": leads_claimed,
            "won": leads_won,
            "claimRate": round((leads_claimed / leads_total) * 100, 1) if leads_total else 0,
            "winRate": round((leads_won / leads_claimed) * 100, 1) if leads_claimed else 0,
        },
        "orders": {
            "total": orders_total,
            "closed": orders_closed,
            "revenue": revenue,
        },
        "byCategory": dict(by_category),
        "ratingAvg": round(float(rating_avg or 0), 2),
    }


def roi_attribution(
    db: Session, provider_id: str, *, days: int = 30, top_clients: int = 5
) -> dict[str, Any]:
    """Attribution breakdown of closed revenue (D2).

    Unlike the coarse `roi_report` totals, this function answers "where did
    the revenue actually come from?" — grouped by demand intent, lead
    temperature, client region, and origin source. Useful for the lawyer
    workbench ROI tab and for internal analytics.
    """

    since = datetime.now(timezone.utc) - timedelta(days=days)

    orders = (
        db.query(ServiceOrder)
        .filter(
            ServiceOrder.provider_id == provider_id,
            ServiceOrder.created_at >= since,
        )
        .all()
    )
    closed_orders = [o for o in orders if o.status == "closed"]
    total_revenue = sum((o.amount or 0) for o in closed_orders)

    # Pre-fetch related leads / matching requests / products / users so the
    # per-order attribution doesn't degenerate into N+1.
    lead_ids = {
        (o.notes or {}).get("lead_id")
        for o in orders
        if isinstance(o.notes, dict) and (o.notes or {}).get("lead_id")
    }
    leads_by_id: dict[str, ProviderLead] = {}
    if lead_ids:
        for lead in (
            db.query(ProviderLead)
            .filter(ProviderLead.id.in_([lid for lid in lead_ids if lid]))
            .all()
        ):
            leads_by_id[lead.id] = lead

    match_ids = {o.matching_request_id for o in orders if o.matching_request_id}
    matches_by_id: dict[str, MatchingRequest] = {}
    if match_ids:
        for m in (
            db.query(MatchingRequest)
            .filter(MatchingRequest.id.in_(list(match_ids)))
            .all()
        ):
            matches_by_id[m.id] = m

    product_ids = {o.product_id for o in orders if o.product_id}
    products_by_id: dict[str, ServiceProduct] = {}
    if product_ids:
        for p in (
            db.query(ServiceProduct)
            .filter(ServiceProduct.id.in_(list(product_ids)))
            .all()
        ):
            products_by_id[p.id] = p

    user_ids = {o.user_id for o in orders}
    users_by_id: dict[str, User] = {}
    if user_ids:
        for u in (
            db.query(User).filter(User.id.in_(list(user_ids))).all()
        ):
            users_by_id[u.id] = u

    def _bucket() -> dict[str, Any]:
        return {"orders": 0, "closed": 0, "revenue": 0, "avgDealSize": 0.0, "closeRate": 0.0}

    by_intent: dict[str, dict[str, Any]] = defaultdict(_bucket)
    by_temperature: dict[str, dict[str, Any]] = defaultdict(_bucket)
    by_region: dict[str, dict[str, Any]] = defaultdict(_bucket)
    by_source: dict[str, dict[str, Any]] = defaultdict(_bucket)
    by_category: dict[str, dict[str, Any]] = defaultdict(_bucket)
    revenue_by_user: dict[str, int] = defaultdict(int)
    orders_by_user: dict[str, int] = defaultdict(int)

    for o in orders:
        notes = o.notes if isinstance(o.notes, dict) else {}
        lead = leads_by_id.get(notes.get("lead_id") or "") if notes else None
        matching = matches_by_id.get(o.matching_request_id) if o.matching_request_id else None
        product = products_by_id.get(o.product_id) if o.product_id else None
        is_closed = o.status == "closed"
        revenue_contrib = (o.amount or 0) if is_closed else 0

        intent = (
            (lead.snapshot or {}).get("intent") if lead else None
        ) or (matching.intent_category if matching else None) or "general"
        temperature = (lead.temperature if lead else None) or "unknown"
        region = (matching.region if matching else None) or (
            (lead.snapshot or {}).get("region") if lead else None
        ) or "全国"
        category = (product.category if product else None) or "other"
        # Source = explicit matching → "matching"; direct consult → "consult";
        # manual outbound seed → "manual". Inferred from available anchors.
        if o.matching_request_id:
            source = "matching"
        elif o.consultation_id:
            source = "consult"
        else:
            source = "direct"

        for bucket, key in (
            (by_intent, intent),
            (by_temperature, temperature),
            (by_region, region),
            (by_source, source),
            (by_category, category),
        ):
            slot = bucket[key]
            slot["orders"] += 1
            if is_closed:
                slot["closed"] += 1
                slot["revenue"] += revenue_contrib

        if is_closed:
            revenue_by_user[o.user_id] += revenue_contrib
            orders_by_user[o.user_id] += 1

    def _finalize(buckets: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
        for key, slot in buckets.items():
            closed = slot["closed"]
            orders_n = slot["orders"]
            slot["avgDealSize"] = round(slot["revenue"] / closed, 2) if closed else 0.0
            slot["closeRate"] = round((closed / orders_n) * 100, 1) if orders_n else 0.0
            slot["revenueShare"] = (
                round((slot["revenue"] / total_revenue) * 100, 1)
                if total_revenue
                else 0.0
            )
        return dict(buckets)

    top_client_rows = sorted(
        revenue_by_user.items(), key=lambda kv: kv[1], reverse=True
    )[:top_clients]
    top = []
    for user_id, revenue in top_client_rows:
        u = users_by_id.get(user_id)
        top.append(
            {
                "userId": user_id,
                "name": (u.full_name if u else None) or (u.email if u else None) or user_id,
                "businessName": (u.business_name if u else None),
                "orders": orders_by_user[user_id],
                "revenue": revenue,
                "revenueShare": (
                    round((revenue / total_revenue) * 100, 1) if total_revenue else 0.0
                ),
            }
        )

    def _top_key(buckets: dict[str, dict[str, Any]]) -> str | None:
        best_key = None
        best_rev = -1
        for k, slot in buckets.items():
            if slot["revenue"] > best_rev:
                best_rev = slot["revenue"]
                best_key = k
        return best_key

    by_intent_final = _finalize(by_intent)
    by_temperature_final = _finalize(by_temperature)
    by_region_final = _finalize(by_region)
    by_source_final = _finalize(by_source)
    by_category_final = _finalize(by_category)

    return {
        "windowDays": days,
        "totals": {
            "orders": len(orders),
            "closed": len(closed_orders),
            "revenue": total_revenue,
            "avgDealSize": round(total_revenue / len(closed_orders), 2) if closed_orders else 0.0,
        },
        "byIntent": by_intent_final,
        "byTemperature": by_temperature_final,
        "byRegion": by_region_final,
        "bySource": by_source_final,
        "byCategory": by_category_final,
        "topClients": top,
        "scorecard": {
            "topIntent": _top_key(by_intent_final),
            "topTemperature": _top_key(by_temperature_final),
            "topRegion": _top_key(by_region_final),
            "topSource": _top_key(by_source_final),
            "topCategory": _top_key(by_category_final),
        },
    }


def get_acquisition_funnel(db: Session, provider_id: str, window_days: int = 30) -> dict[str, Any]:
    """五段获客漏斗：匹配分发 → 律师查看 → 认领 → 报价 → 成交。

    Used by the Lawyer Workbench to visualize conversion from lead supply to
    revenue. Returns stage counts, drop-offs, temperature distribution, and
    average response SLAs.
    """

    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    base_q = db.query(ProviderLead).filter(
        ProviderLead.provider_id == provider_id,
        ProviderLead.created_at >= since,
    )
    leads = base_q.all()
    total = len(leads)

    viewed = sum(1 for lead in leads if lead.last_viewed_at is not None)
    claimed = sum(1 for lead in leads if lead.status in {"claimed", "quoted", "won"})
    quoted = sum(1 for lead in leads if lead.status in {"quoted", "won"})
    won = sum(1 for lead in leads if lead.status == "won")

    by_temp: dict[str, int] = defaultdict(int)
    for lead in leads:
        by_temp[lead.temperature or "unknown"] += 1

    intent_breakdown: dict[str, int] = defaultdict(int)
    match_ids = [lead.matching_request_id for lead in leads if lead.matching_request_id]
    if match_ids:
        matches = (
            db.query(MatchingRequest)
            .filter(MatchingRequest.id.in_(match_ids))
            .all()
        )
        intent_by_id = {m.id: m.intent_category for m in matches}
        for lead in leads:
            if lead.matching_request_id:
                intent = intent_by_id.get(lead.matching_request_id) or "general"
                intent_breakdown[intent] += 1

    claim_deltas: list[float] = []
    for lead in leads:
        if lead.claimed_at:
            created = lead.created_at
            delta = (lead.claimed_at - created).total_seconds() / 60.0
            if delta >= 0:
                claim_deltas.append(delta)

    avg_claim_minutes = round(sum(claim_deltas) / len(claim_deltas), 1) if claim_deltas else None

    # Revenue tied to won leads → orders in the same window
    revenue = 0
    orders = (
        db.query(ServiceOrder)
        .filter(
            ServiceOrder.provider_id == provider_id,
            ServiceOrder.created_at >= since,
            ServiceOrder.status == "closed",
        )
        .all()
    )
    revenue = sum((o.amount or 0) for o in orders)

    def _rate(numer: int, denom: int) -> float:
        return round((numer / denom) * 100, 1) if denom else 0.0

    stages = [
        {"key": "distributed", "label": "匹配分发", "count": total},
        {"key": "viewed", "label": "律师查看", "count": viewed},
        {"key": "claimed", "label": "线索认领", "count": claimed},
        {"key": "quoted", "label": "报价 / 签单", "count": quoted},
        {"key": "won", "label": "成交", "count": won},
    ]
    # Attach conversion % against previous stage (for nice funnel chart)
    prev = total
    for stage in stages:
        stage["vsTotal"] = _rate(stage["count"], total)
        stage["vsPrev"] = _rate(stage["count"], prev)
        prev = stage["count"] if stage["count"] > 0 else prev

    return {
        "windowDays": window_days,
        "stages": stages,
        "temperatures": dict(by_temp),
        "intentBreakdown": dict(intent_breakdown),
        "avgClaimMinutes": avg_claim_minutes,
        "revenueClosed": revenue,
        "ordersClosed": len(orders),
    }
