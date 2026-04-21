from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import User
from apps.api.app.schemas.matching import (
    MatchingRunRequest,
)
from apps.api.app.services import event_types
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.event_bus import emit_event
from apps.api.app.services.matching_engine import (
    get_matching_detail,
    list_matching_requests,
    run_matching,
)
from apps.api.app.services.profile_engine import build_profile_fingerprint, list_user_tags

router = APIRouter(prefix="/matching", tags=["matching"])
logger = logging.getLogger(__name__)


@router.post("/run")
def run_match(
    payload: MatchingRunRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload.raw_query or not payload.raw_query.strip():
        raise HTTPException(status_code=400, detail="raw_query 不能为空")

    request, candidates = run_matching(db, user, payload.raw_query.strip(), top_k=payload.top_k)
    detail = get_matching_detail(db, user.id, request.id) or {"candidates": []}
    try:
        emit_event(
            db,
            event_type=event_types.MATCHING_REQUESTED,
            user_id=user.id,
            tenant_id=user.tenant_id,
            source_entity_type="matching_request",
            source_entity_id=request.id,
            payload={
                "title": "发起律师/服务商匹配",
                "detail": (request.raw_query or "")[:120],
                "intentCategory": request.intent_category,
                "candidateCount": len(detail.get("candidates", []) or []),
            },
        )
        db.commit()
    except Exception:  # pragma: no cover — defensive
        logger.exception("matching.requested emit failed request_id=%s", request.id)
    return {
        "requestId": request.id,
        "fingerprint": {
            "intentCategory": request.intent_category,
            "urgency": request.urgency,
            "budget": request.budget_range,
            "region": request.region,
            "tags": (request.profile_vector or {}).get("tags", []),
            "rawQuery": request.raw_query,
        },
        "candidates": detail["candidates"],
        "disclaimer": "匹配结果仅供参考，以实际沟通结果为准。",
    }


@router.post("/fingerprint")
def preview_fingerprint(
    payload: MatchingRunRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    fp = build_profile_fingerprint(db, user, payload.raw_query, persist=False)
    return fp


@router.get("")
def list_matches(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = list_matching_requests(db, user.id, limit=20)
    return [
        {
            "id": r.id,
            "intentCategory": r.intent_category,
            "rawQuery": r.raw_query,
            "urgency": r.urgency,
            "region": r.region,
            "status": r.status,
            "createdAt": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/{request_id}")
def get_match(
    request_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    detail = get_matching_detail(db, user.id, request_id)
    if not detail:
        raise HTTPException(status_code=404, detail="匹配记录不存在")
    return detail


@router.get("/profile/tags")
def profile_tags(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tags = list_user_tags(db, user.id)
    return [
        {
            "id": t.id,
            "tagType": t.tag_type,
            "tagValue": t.tag_value,
            "confidence": t.confidence,
            "source": t.source,
            "createdAt": t.created_at.isoformat(),
        }
        for t in tags
    ]
