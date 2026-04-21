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
from apps.api.app.services import event_types
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.event_bus import emit_event
from apps.api.app.services.profile_engine import (
    build_profile_fingerprint,
    list_user_tags,
)

router = APIRouter(prefix="/profile", tags=["profile"])


# Human-readable labels for user profile fields, used when synthesizing an
# activity-log entry for a profile edit.
_PROFILE_FIELD_LABELS: dict[str, str] = {
    "full_name": "姓名",
    "business_name": "公司/项目名",
    "business_description": "业务描述",
    "industry": "行业",
    "stage": "阶段",
    "applicant_type": "申请人类型",
    "applicant_name": "申请人名称",
    "has_trademark": "已注册商标",
    "has_patent": "已有专利/软著",
    "ip_focus": "IP 焦点",
}


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
    changed_fields: list[str] = []
    for field, value in update_data.items():
        current = getattr(user, field, None)
        if current != value:
            changed_fields.append(field)
            setattr(user, field, value)

    if changed_fields:
        labels = [_PROFILE_FIELD_LABELS.get(f, f) for f in changed_fields]
        try:
            emit_event(
                db,
                event_type=event_types.PROFILE_UPDATED,
                user_id=user.id,
                tenant_id=user.tenant_id,
                source_entity_type="user_profile",
                source_entity_id=user.id,
                payload={
                    "title": "更新账号资料",
                    "detail": f"修改了 {'、'.join(labels)}",
                    "changed_fields": changed_fields,
                },
            )
        except Exception:  # pragma: no cover — defensive
            pass

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


# UI category mapping for the account activity timeline.
# Every event type that ends up on a user row should land in exactly one
# category. Unknown types fall through to ``"system"`` so they are still shown
# (just with a generic icon) instead of being misfiled as profile edits.
_EVENT_TYPE_MAP: dict[str, str] = {
    # 认证与账户
    event_types.USER_REGISTERED: "login",
    event_types.USER_LOGIN: "login",
    event_types.USER_LOGOUT: "login",
    "auth.login": "login",
    # 资料
    event_types.PROFILE_UPDATED: "profile",
    "profile.update": "profile",
    # 安全
    event_types.AUTH_PASSWORD_CHANGED: "security",
    event_types.AUTH_PASSWORD_RESET_REQUESTED: "security",
    event_types.AUTH_PASSWORD_RESET: "security",
    "security.alert": "security",
    # 文档 / 上传
    event_types.DOCUMENT_GENERATED: "document",
    "document.rendered": "document",
    event_types.FILE_UPLOADED: "document",
    event_types.LICENSE_PARSED: "document",
    # 资产
    event_types.ASSET_CREATED: "asset",
    event_types.ASSET_UPDATED: "asset",
    event_types.ASSET_DELETED: "asset",
    event_types.ASSET_EXPIRING_SOON: "asset",
    # 工作流 / 任务
    event_types.WORKFLOW_STEP_COMPLETED: "workflow",
    event_types.WORKFLOW_STEP_AWAITING: "workflow",
    event_types.WORKFLOW_COMPLETED: "workflow",
    event_types.WORKFLOW_FAILED: "workflow",
    event_types.JOB_COMPLETED: "workflow",
    event_types.JOB_FAILED: "workflow",
    event_types.DIAGNOSIS_COMPLETED: "workflow",
    event_types.TRADEMARK_RED_FLAG: "workflow",
    event_types.COMPLIANCE_AUDIT_COMPLETED: "workflow",
    event_types.POLICY_DIGEST_READY: "workflow",
    event_types.MONITORING_ALERT: "workflow",
    event_types.COMPETITOR_CHANGE: "workflow",
    event_types.LITIGATION_PREDICTED: "workflow",
    event_types.LITIGATION_CASE_CREATED: "workflow",
    # 匹配 / 咨询
    event_types.MATCHING_REQUESTED: "matching",
    event_types.PROVIDER_LEAD_CREATED: "matching",
    event_types.CHAT_STARTED: "matching",
    event_types.CHAT_HANDOFF: "matching",
}

# Fallback titles when an event's payload does not supply its own.
_DEFAULT_CATEGORY_TITLE: dict[str, str] = {
    "login": "账号登录",
    "document": "生成/上传文档",
    "profile": "更新账号资料",
    "asset": "IP 资产变更",
    "security": "安全事件",
    "workflow": "后台任务进展",
    "matching": "咨询/匹配活动",
    "system": "平台活动",
}


def _event_to_activity(event: SystemEvent) -> dict:
    category = _EVENT_TYPE_MAP.get(event.event_type, "system")
    payload = event.payload if isinstance(event.payload, dict) else {}
    title = (
        payload.get("title")
        or _DEFAULT_CATEGORY_TITLE.get(category)
        or event.event_type
    )
    detail = (
        payload.get("detail")
        or payload.get("description")
        or payload.get("summary")
        or ""
    )
    return {
        "id": event.id,
        "type": category,
        "eventType": event.event_type,
        "title": title,
        "detail": detail,
        "at": event.created_at.isoformat(),
    }


@router.get("/activity")
def get_profile_activity(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    category: str | None = Query(None, description="过滤类别：login/profile/security/document/asset/workflow/matching/system"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base_query = db.query(SystemEvent).filter(SystemEvent.user_id == user.id)

    if category:
        allowed_types = [
            event_type for event_type, cat in _EVENT_TYPE_MAP.items() if cat == category
        ]
        if category == "system":
            # "系统" 桶包含未显式映射的事件类型。
            base_query = base_query.filter(~SystemEvent.event_type.in_(list(_EVENT_TYPE_MAP.keys())))
        elif allowed_types:
            base_query = base_query.filter(SystemEvent.event_type.in_(allowed_types))
        else:
            base_query = base_query.filter(False)

    total = base_query.count()
    events = (
        base_query.order_by(SystemEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [_event_to_activity(e) for e in events],
    }


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
