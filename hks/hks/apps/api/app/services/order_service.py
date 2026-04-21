"""Service-order & consultation orchestrator.

Handles the full "服务数字化" lifecycle:
    pending_quote → quoted → signed → paying → in_delivery → delivered → closed
and all side-channels (e-signature, escrow payment, milestones, bilateral
ratings). Everything external is behind a port so real providers can be
plugged in later without touching business logic.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.db.models import (
    ConsultationSession,
    LegalServiceProvider,
    ProviderLead,
    ServiceOrder,
    ServiceProduct,
    User,
)

logger = logging.getLogger(__name__)


ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending_quote": {"quoted", "cancelled"},
    "quoted": {"signed", "cancelled"},
    "signed": {"paying", "cancelled"},
    "paying": {"in_delivery", "cancelled"},
    "in_delivery": {"delivered"},
    "delivered": {"closed"},
    "closed": set(),
    "cancelled": set(),
}


def _generate_order_no() -> str:
    now = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    import random
    return f"A1P{now}{random.randint(100, 999)}"


def _default_milestones(category: str | None) -> list[dict[str, Any]]:
    base = [
        {"key": "quote", "title": "律师出具报价", "status": "pending"},
        {"key": "sign", "title": "双方电子签约", "status": "pending"},
        {"key": "pay", "title": "托管支付", "status": "pending"},
        {"key": "deliver", "title": "交付成果", "status": "pending"},
        {"key": "accept", "title": "用户验收", "status": "pending"},
    ]
    if category == "trademark":
        base.insert(3, {"key": "submit", "title": "协助提交至商标局", "status": "pending"})
    if category == "litigation":
        base.insert(3, {"key": "case_brief", "title": "案件卷宗整理", "status": "pending"})
    return base


def create_order_from_match(
    db: Session,
    *,
    user_id: str,
    provider_id: str,
    product_id: str | None = None,
    matching_request_id: str | None = None,
    consultation_id: str | None = None,
    note: str | None = None,
) -> ServiceOrder:
    provider = db.query(LegalServiceProvider).filter(LegalServiceProvider.id == provider_id).first()
    if not provider:
        raise ValueError("provider not found")

    product = None
    if product_id:
        product = db.query(ServiceProduct).filter(ServiceProduct.id == product_id).first()
    if product is None:
        product = (
            db.query(ServiceProduct)
            .filter(ServiceProduct.provider_id == provider_id, ServiceProduct.status == "active")
            .order_by(ServiceProduct.sold_count.desc())
            .first()
        )

    lead = _find_linked_lead(
        db,
        user_id=user_id,
        provider_id=provider_id,
        matching_request_id=matching_request_id,
    )

    notes: dict[str, Any] = {}
    if note:
        notes["user_note"] = note
    if lead:
        notes["lead_id"] = lead.id

    order = ServiceOrder(
        order_no=_generate_order_no(),
        user_id=user_id,
        provider_id=provider_id,
        product_id=product.id if product else None,
        matching_request_id=matching_request_id,
        consultation_id=consultation_id,
        amount=product.price if product else 0,
        status="pending_quote",
        escrow_status="idle",
        milestones=_default_milestones(product.category if product else None),
        notes=notes,
    )
    db.add(order)

    # Link lead → "quoted" status the moment an order is created.
    if lead and lead.status in {"new", "claimed", "contacted"}:
        lead.status = "quoted"
        lead.last_viewed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(order)
    logger.info(
        "service order created order_id=%s user=%s provider=%s lead=%s",
        order.id, user_id, provider_id, lead.id if lead else None,
    )
    return order


def _find_linked_lead(
    db: Session,
    *,
    user_id: str,
    provider_id: str,
    matching_request_id: str | None,
) -> ProviderLead | None:
    """Locate the ProviderLead backing this order, if any.

    Priority: (1) exact match on matching_request_id, (2) latest open lead for
    the same user+provider pair. We intentionally skip leads that are already
    terminal (``won``/``lost``) so re-engaged orders don't overwrite history.
    """
    base = db.query(ProviderLead).filter(
        ProviderLead.user_id == user_id,
        ProviderLead.provider_id == provider_id,
        ProviderLead.status.in_(["new", "claimed", "contacted", "quoted"]),
    )
    if matching_request_id:
        lead = base.filter(ProviderLead.matching_request_id == matching_request_id).first()
        if lead:
            return lead
    return base.order_by(ProviderLead.created_at.desc()).first()


def _mark_lead_for_order(db: Session, order: ServiceOrder, status: str) -> None:
    """Update the ProviderLead linked to ``order`` to ``status`` if present."""
    notes = order.notes or {}
    lead_id = notes.get("lead_id")
    lead: ProviderLead | None = None
    if lead_id:
        lead = db.query(ProviderLead).filter(ProviderLead.id == lead_id).first()
    if lead is None:
        lead = _find_linked_lead(
            db,
            user_id=order.user_id,
            provider_id=order.provider_id,
            matching_request_id=order.matching_request_id,
        )
    if lead is None:
        return
    lead.status = status
    if status == "quoted":
        lead.last_viewed_at = datetime.now(timezone.utc)


def _transition(order: ServiceOrder, to_status: str) -> None:
    if to_status not in ALLOWED_TRANSITIONS.get(order.status, set()):
        raise ValueError(f"非法状态切换 {order.status} → {to_status}")
    order.status = to_status


def _mark_milestone(order: ServiceOrder, key: str, status: str = "done", detail: dict | None = None) -> None:
    milestones = list(order.milestones or [])
    for m in milestones:
        if m.get("key") == key:
            m["status"] = status
            if detail:
                m.update(detail)
            m["updated_at"] = datetime.now(timezone.utc).isoformat()
            break
    order.milestones = milestones


def issue_quote(db: Session, order: ServiceOrder, amount: int, note: str | None = None) -> ServiceOrder:
    _transition(order, "quoted")
    order.amount = int(amount)
    order.notes = {**(order.notes or {}), "quote_note": note or ""}
    _mark_milestone(order, "quote", "done", {"amount": amount})
    _mark_lead_for_order(db, order, "quoted")
    db.commit()
    db.refresh(order)
    return order


def sign_contract(db: Session, order: ServiceOrder, signers: list[dict] | None = None) -> dict[str, Any]:
    esign = provider_registry.get("eSignature")
    env = esign.create_envelope(
        order_id=order.id,
        template_id="service_agreement_v1",
        signers=signers or [{"role": "user"}, {"role": "provider"}],
        trace_id=order.id,
    )
    payload = env.normalized_payload
    order.contract_envelope_id = payload.get("envelope_id")
    order.contract_url = payload.get("sign_url")
    _transition(order, "signed")
    _mark_milestone(order, "sign", "done", {"envelope_id": payload.get("envelope_id")})
    db.commit()
    db.refresh(order)
    return payload


def escrow_hold(db: Session, order: ServiceOrder) -> dict[str, Any]:
    escrow = provider_registry.get("paymentEscrow")
    env = escrow.hold(order_id=order.id, amount=order.amount, trace_id=order.id)
    payload = env.normalized_payload
    order.escrow_status = "held"
    order.escrow_ref = payload.get("escrow_ref")
    _transition(order, "paying")
    db.commit()
    db.refresh(order)
    return payload


def begin_delivery(db: Session, order: ServiceOrder) -> ServiceOrder:
    _transition(order, "in_delivery")
    _mark_milestone(order, "pay", "done", {"status": "held"})
    db.commit()
    db.refresh(order)
    return order


def complete_delivery(db: Session, order: ServiceOrder, deliverables: list[dict] | None = None) -> ServiceOrder:
    if deliverables:
        order.deliverables = deliverables
    _transition(order, "delivered")
    _mark_milestone(order, "deliver", "done", {"count": len(deliverables or [])})
    db.commit()
    db.refresh(order)
    return order


def accept_and_release(
    db: Session, order: ServiceOrder, rating: int | None = None, review: str | None = None
) -> ServiceOrder:
    escrow = provider_registry.get("paymentEscrow")
    escrow.release(order_id=order.id, trace_id=order.id)
    order.escrow_status = "released"
    order.user_rating = rating
    order.user_review = review
    _transition(order, "closed")
    _mark_milestone(order, "accept", "done", {"rating": rating})
    _mark_lead_for_order(db, order, "won")

    # Bump provider metrics
    provider = db.query(LegalServiceProvider).filter(LegalServiceProvider.id == order.provider_id).first()
    if provider and rating is not None:
        current = provider.rating_avg * max(provider.orders_count, 1)
        provider.orders_count = (provider.orders_count or 0) + 1
        provider.rating_avg = round((current + rating) / provider.orders_count, 2)
    db.commit()
    db.refresh(order)
    return order


# ---------------------------------------------------------------------------
# Consultations
# ---------------------------------------------------------------------------


def create_consultation_session(
    db: Session,
    *,
    user: User,
    topic: str,
    channel: str = "ai",
    provider_id: str | None = None,
    handoff_reason: str | None = None,
) -> tuple[ConsultationSession, dict[str, Any]]:
    # Classify as handoff if channel asked for it or topic matches high-risk signals.
    from apps.api.app.services.chat_service import needs_human_handoff

    need_handoff, kw_reason = needs_human_handoff(topic)
    status = "ai_active"
    ai_confidence = 0.9
    if channel in ("handoff", "human") or need_handoff:
        status = "awaiting_provider" if not provider_id else "provider_assigned"
        ai_confidence = 0.4
        if not handoff_reason:
            handoff_reason = kw_reason or "用户主动请求人工咨询"

    session = ConsultationSession(
        user_id=user.id,
        provider_id=provider_id,
        topic=topic,
        channel=channel,
        status=status,
        ai_confidence=ai_confidence,
        handoff_reason=handoff_reason,
        ai_handoff_at=datetime.now(timezone.utc) if handoff_reason else None,
        transcript=[],
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    handoff_info = {
        "requested": bool(handoff_reason),
        "status": session.status,
        "reason": handoff_reason,
        "confidence": ai_confidence,
    }
    return session, handoff_info


_CONFIDENCE_DROP_KEYWORDS = [
    "不会", "搞不定", "搞不懂", "太复杂", "我不懂",
    "找律师", "转人工", "要律师", "专业律师",
    "被起诉", "律师函", "应诉", "维权", "侵权",
    "诉讼", "判决", "赔偿", "和解", "仲裁",
    "竞业", "融资尽调", "股权纠纷",
]

_CONFIDENCE_BOOST_KEYWORDS = [
    "明白了", "好的", "可以", "谢谢", "收到",
    "继续", "就这样", "按你说的做",
]


def _recalc_ai_confidence(
    session: ConsultationSession, role: str, content: str
) -> tuple[float, str | None]:
    """根据最新对话内容动态调整 AI 置信度。

    返回 (new_confidence, suggested_handoff_reason|None)
    """
    conf = float(session.ai_confidence or 0.9)
    msg = (content or "")
    reason: str | None = None

    if role == "user":
        for kw in _CONFIDENCE_DROP_KEYWORDS:
            if kw in msg:
                conf -= 0.15
                reason = f"用户提及「{kw}」，建议转人工"
                break
        for kw in _CONFIDENCE_BOOST_KEYWORDS:
            if kw in msg and reason is None:
                conf += 0.05
                break
        turn_count = len([m for m in (session.transcript or []) if m.get("role") == "user"])
        if turn_count >= 5 and conf > 0.5:
            conf -= 0.05
            if reason is None:
                reason = "用户连续多轮提问，建议引入律师"

    elif role == "assistant":
        if any(
            kw in msg
            for kw in ("我无法", "建议咨询律师", "超出 AI", "请律师", "无法确定")
        ):
            conf -= 0.2
            reason = "AI 自认把握不足，建议转人工"

    conf = max(0.05, min(1.0, conf))
    return round(conf, 3), reason


def append_consultation_message(
    db: Session,
    session: ConsultationSession,
    role: str,
    content: str,
) -> dict[str, Any]:
    transcript = list(session.transcript or [])
    transcript.append({
        "role": role,
        "content": content,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    session.transcript = transcript

    new_conf, handoff_reason = _recalc_ai_confidence(session, role, content)
    session.ai_confidence = new_conf

    handoff_triggered = False
    if (
        new_conf < 0.45
        and session.status == "ai_active"
        and session.channel != "human"
    ):
        session.status = "awaiting_provider"
        session.ai_handoff_at = datetime.now(timezone.utc)
        session.handoff_reason = handoff_reason or "AI 置信度低于阈值"
        handoff_triggered = True

    db.commit()

    return {
        "aiConfidence": new_conf,
        "handoffSuggested": new_conf < 0.6,
        "handoffTriggered": handoff_triggered,
        "reason": handoff_reason,
        "status": session.status,
    }


def close_consultation(db: Session, session: ConsultationSession, rating: int | None = None) -> None:
    session.status = "closed"
    session.closed_at = datetime.now(timezone.utc)
    session.rating = rating
    db.commit()


# ---------------------------------------------------------------------------
# Listing / serialization helpers
# ---------------------------------------------------------------------------


def order_to_dict(db: Session, order: ServiceOrder) -> dict[str, Any]:
    provider = db.query(LegalServiceProvider).filter(LegalServiceProvider.id == order.provider_id).first()
    product = db.query(ServiceProduct).filter(ServiceProduct.id == order.product_id).first() if order.product_id else None
    return {
        "id": order.id,
        "order_no": order.order_no,
        "status": order.status,
        "escrow_status": order.escrow_status,
        "amount": order.amount,
        "currency": order.currency,
        "user_id": order.user_id,
        "provider": {
            "id": provider.id if provider else None,
            "name": provider.name if provider else None,
            "rating_avg": provider.rating_avg if provider else None,
            "avatar_url": provider.avatar_url if provider else None,
        } if provider else None,
        "product": {
            "id": product.id, "name": product.name, "category": product.category,
            "delivery_days": product.delivery_days,
        } if product else None,
        "milestones": order.milestones or [],
        "deliverables": order.deliverables or [],
        "contract_envelope_id": order.contract_envelope_id,
        "contract_url": order.contract_url,
        "user_rating": order.user_rating,
        "user_review": order.user_review,
        "provider_rating": order.provider_rating,
        "provider_review": order.provider_review,
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat(),
    }
