from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import ConsultationSession, LegalServiceProvider, User
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.order_service import (
    append_consultation_message,
    close_consultation,
    create_consultation_session,
)

router = APIRouter(prefix="/consultations", tags=["consultations"])


class StartConsultationBody(BaseModel):
    """Start consultation request.

    Accepts both camelCase (``providerId``) and snake_case (``provider_id``)
    so the legacy frontend payloads keep working while new clients use the
    canonical camelCase form.
    """

    model_config = ConfigDict(populate_by_name=True)

    topic: str
    channel: str = "ai"
    providerId: str | None = Field(default=None, alias="provider_id")
    handoffReason: str | None = Field(default=None, alias="handoff_reason")


class AppendMessageBody(BaseModel):
    role: str
    content: str


def _session_to_dict(session: ConsultationSession, provider: LegalServiceProvider | None) -> dict:
    return {
        "id": session.id,
        "topic": session.topic,
        "status": session.status,
        "channel": session.channel,
        "aiConfidence": session.ai_confidence,
        "handoffReason": session.handoff_reason,
        "aiHandoffAt": session.ai_handoff_at.isoformat() if session.ai_handoff_at else None,
        "acceptedAt": session.accepted_at.isoformat() if session.accepted_at else None,
        "closedAt": session.closed_at.isoformat() if session.closed_at else None,
        "rating": session.rating,
        "transcript": session.transcript or [],
        "provider": {
            "id": provider.id, "name": provider.name, "avatar_url": provider.avatar_url,
            "rating_avg": provider.rating_avg,
        } if provider else None,
        "createdAt": session.created_at.isoformat(),
    }


@router.post("")
def start_consultation(
    body: StartConsultationBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session, handoff = create_consultation_session(
        db,
        user=user,
        topic=body.topic,
        channel=body.channel,
        provider_id=body.providerId,
        handoff_reason=body.handoffReason,
    )
    provider = db.query(LegalServiceProvider).filter(LegalServiceProvider.id == session.provider_id).first() if session.provider_id else None
    return {"session": _session_to_dict(session, provider), "handoff": handoff}


@router.get("")
def list_consultations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.user_id == user.id)
        .order_by(ConsultationSession.created_at.desc())
        .limit(30)
        .all()
    )
    out = []
    for s in rows:
        provider = db.query(LegalServiceProvider).filter(LegalServiceProvider.id == s.provider_id).first() if s.provider_id else None
        out.append(_session_to_dict(s, provider))
    return out


@router.get("/{session_id}")
def get_consultation(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = db.query(ConsultationSession).filter(ConsultationSession.id == session_id).first()
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="咨询会话不存在")
    provider = db.query(LegalServiceProvider).filter(LegalServiceProvider.id == session.provider_id).first() if session.provider_id else None
    return _session_to_dict(session, provider)


@router.post("/{session_id}/messages")
def append_message(
    session_id: str,
    body: AppendMessageBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = db.query(ConsultationSession).filter(ConsultationSession.id == session_id).first()
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="咨询会话不存在")
    confidence = append_consultation_message(
        db, session, role=body.role, content=body.content
    )
    db.refresh(session)
    return {
        "transcript": session.transcript or [],
        "aiConfidence": session.ai_confidence,
        "status": session.status,
        "confidenceInfo": confidence,
    }


@router.post("/{session_id}/handoff")
def force_handoff(
    session_id: str,
    reason: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """用户主动请求转人工。立即把会话切换到 awaiting_provider。"""
    session = db.query(ConsultationSession).filter(ConsultationSession.id == session_id).first()
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="咨询会话不存在")
    from datetime import datetime as _dt, timezone as _tz

    session.status = "awaiting_provider"
    session.ai_handoff_at = _dt.now(_tz.utc)
    session.handoff_reason = reason or "用户主动请求转人工"
    session.ai_confidence = min(float(session.ai_confidence or 0.4), 0.4)
    db.commit()
    db.refresh(session)
    provider = db.query(LegalServiceProvider).filter(LegalServiceProvider.id == session.provider_id).first() if session.provider_id else None
    return _session_to_dict(session, provider)


@router.post("/{session_id}/close")
def close_session(
    session_id: str,
    rating: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = db.query(ConsultationSession).filter(ConsultationSession.id == session_id).first()
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="咨询会话不存在")
    close_consultation(db, session, rating=rating)
    db.refresh(session)
    provider = db.query(LegalServiceProvider).filter(LegalServiceProvider.id == session.provider_id).first() if session.provider_id else None
    return _session_to_dict(session, provider)
