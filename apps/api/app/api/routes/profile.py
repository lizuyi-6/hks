from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import MatchingRequest, SystemEvent, User
from apps.api.app.schemas.profile import (
    ProfileStatusResponse,
    ProfileUpdateRequest,
    UserProfileResponse,
)
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.profile_engine import (
    build_profile_fingerprint,
    list_user_tags,
)

router = APIRouter(prefix="/profile", tags=["profile"])


def _is_complete(user: User) -> bool:
    return bool(user.business_name and user.business_description and user.industry)


def _to_response(user: User) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        business_name=user.business_name,
        business_description=user.business_description,
        industry=user.industry,
        stage=user.stage,
        applicant_type=user.applicant_type,
        applicant_name=user.applicant_name,
        has_trademark=user.has_trademark,
        has_patent=user.has_patent,
        ip_focus=user.ip_focus,
        profile_complete=_is_complete(user),
        created_at=user.created_at,
    )


@router.get("", response_model=UserProfileResponse)
def get_profile(user: User = Depends(get_current_user)):
    return _to_response(user)


@router.put("", response_model=UserProfileResponse)
def update_profile(
    payload: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    update_data = payload.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return _to_response(user)


@router.get("/status", response_model=ProfileStatusResponse)
def get_profile_status(user: User = Depends(get_current_user)):
    has = bool(user.business_name or user.business_description)
    return ProfileStatusResponse(
        has_profile=has,
        profile_complete=_is_complete(user),
    )


_EVENT_TYPE_MAP = {
    "user.login": "login",
    "user.logout": "login",
    "auth.login": "login",
    "document.generated": "document",
    "document.rendered": "document",
    "profile.updated": "profile",
    "profile.update": "profile",
    "asset.created": "asset",
    "asset.updated": "asset",
    "asset.deleted": "asset",
    "auth.password_changed": "security",
    "security.alert": "security",
}


def _event_to_activity(event: SystemEvent) -> dict:
    category = _EVENT_TYPE_MAP.get(event.event_type, "profile")
    payload = event.payload if isinstance(event.payload, dict) else {}
    title = payload.get("title") or {
        "login": "账号登录",
        "document": "生成文档",
        "profile": "更新个人资料",
        "asset": "IP 资产变更",
        "security": "安全事件",
    }.get(category, event.event_type)
    detail = payload.get("detail") or payload.get("description") or ""
    return {
        "id": event.id,
        "type": category,
        "title": title,
        "detail": detail,
        "at": event.created_at.isoformat(),
    }


@router.get("/activity")
def get_profile_activity(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events = (
        db.query(SystemEvent)
        .filter(SystemEvent.user_id == user.id)
        .order_by(SystemEvent.created_at.desc())
        .limit(20)
        .all()
    )
    return [_event_to_activity(e) for e in events]


# --------------------------------------------------------------------------
# 需求画像 (Profile Fingerprint) 端点 — 赛道支柱 1 可视化
# --------------------------------------------------------------------------


@router.get("/tags")
def get_profile_tags(
    limit: int = Query(50, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """返回当前用户的画像标签（来源/置信度/时间），供"我的画像"页渲染。"""
    tags = list_user_tags(db, user.id, limit=limit)
    buckets: dict[str, list[dict]] = {}
    for t in tags:
        entry = {
            "id": t.id,
            "tagType": t.tag_type,
            "tagValue": t.tag_value,
            "confidence": t.confidence,
            "source": t.source,
            "evidence": t.evidence or {},
            "createdAt": t.created_at.isoformat(),
        }
        buckets.setdefault(t.tag_type, []).append(entry)
    flat = [item for group in buckets.values() for item in group]
    return {
        "total": len(flat),
        "byType": buckets,
        "tags": flat,
    }


@router.get("/fingerprint")
def get_profile_fingerprint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """返回最近一次画像指纹（基于最近一次 matching 请求 + 当前静态画像）。"""
    latest = (
        db.query(MatchingRequest)
        .filter(MatchingRequest.user_id == user.id)
        .order_by(MatchingRequest.created_at.desc())
        .first()
    )
    if latest:
        tags = (latest.profile_vector or {}).get("tags", [])
        return {
            "source": "matching",
            "requestId": latest.id,
            "intentCategory": latest.intent_category,
            "urgency": latest.urgency,
            "budget": latest.budget_range,
            "region": latest.region,
            "rawQuery": latest.raw_query,
            "tags": tags,
            "snapshot": latest.profile_snapshot or {},
            "createdAt": latest.created_at.isoformat(),
        }
    # fallback to synthesized fingerprint from user profile fields
    raw = user.business_description or ""
    fp = build_profile_fingerprint(db, user, raw, persist=False)
    return {
        "source": "synthesized",
        "requestId": None,
        "intentCategory": fp["intent_category"],
        "urgency": fp["urgency"],
        "budget": fp.get("budget"),
        "region": fp["region"],
        "rawQuery": raw,
        "tags": fp["tags"],
        "snapshot": {
            "industry": user.industry,
            "stage": user.stage,
            "businessName": user.business_name,
        },
        "createdAt": None,
    }


class FingerprintPreviewRequest(BaseModel):
    raw_query: str


@router.post("/fingerprint/preview")
def preview_fingerprint(
    body: FingerprintPreviewRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """不落库预览：给 onboarding 的"一句话说需求 → 画像确认"使用。"""
    fp = build_profile_fingerprint(db, user, body.raw_query, persist=False)
    return {
        "intentCategory": fp["intent_category"],
        "intentConfidence": fp["intent_confidence"],
        "urgency": fp["urgency"],
        "budget": fp.get("budget"),
        "region": fp["region"],
        "tags": fp["tags"],
        "tagsDetailed": fp["tags_detailed"],
        "suggestedPracticeAreas": fp["suggested_practice_areas"],
        "rawQuery": body.raw_query,
    }
