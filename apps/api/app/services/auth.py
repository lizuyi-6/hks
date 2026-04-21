from __future__ import annotations

import logging
import re

from sqlalchemy.orm import Session

from apps.api.app.core.security import (
    create_access_token,
    create_password_reset_token,
    hash_password,
    verify_password,
)
from apps.api.app.db.models import Tenant, User
from apps.api.app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)
from apps.api.app.services import event_types
from apps.api.app.services.event_bus import emit_event

logger = logging.getLogger(__name__)


def _safe_emit(db: Session, **kwargs) -> None:
    """Emit an activity event without letting a bus failure break auth."""
    try:
        emit_event(db, **kwargs)
    except Exception:  # pragma: no cover — defensive
        logger.exception("activity event emit failed event_type=%s", kwargs.get("event_type"))


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", name.lower()).strip("-")
    return slug[:100] or f"tenant-{id(name)}"


def register_user(db: Session, payload: RegisterRequest) -> TokenResponse:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise ValueError("该邮箱已注册")

    # Create tenant
    slug = _slugify(payload.full_name)
    counter = 1
    base_slug = slug
    while db.query(Tenant).filter(Tenant.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    tenant = Tenant(name=payload.full_name, slug=slug)
    db.add(tenant)
    db.flush()

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        tenant_id=tenant.id,
        role="owner",
    )
    db.add(user)
    db.flush()
    _safe_emit(
        db,
        event_type=event_types.USER_REGISTERED,
        user_id=user.id,
        tenant_id=tenant.id,
        source_entity_type="user",
        source_entity_id=user.id,
        payload={
            "title": "账号注册",
            "detail": f"{user.full_name or user.email} 创建了账号",
            "email": user.email,
        },
    )
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, tenant_id=tenant.id, role="owner")
    return TokenResponse(access_token=token, token_type="bearer")


def login_user(db: Session, payload: LoginRequest) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise ValueError("邮箱或密码错误")

    token = create_access_token(
        user.id, tenant_id=user.tenant_id, role=user.role or "member"
    )
    _safe_emit(
        db,
        event_type=event_types.USER_LOGIN,
        user_id=user.id,
        tenant_id=user.tenant_id,
        source_entity_type="user",
        source_entity_id=user.id,
        payload={
            "title": "账号登录",
            "detail": f"通过邮箱 {user.email} 登录平台",
        },
    )
    db.commit()
    return TokenResponse(access_token=token, token_type="bearer")


def refresh_token(db: Session, old_token: str) -> TokenResponse | None:
    from apps.api.app.core.security import decode_token_allow_expired

    payload = decode_token_allow_expired(old_token)
    if not payload:
        return None

    # Only allow access tokens (no explicit type) or explicit "access"/"refresh" types.
    # Reject password-reset tokens and any other typed token from being exchanged.
    token_type = payload.get("type")
    if token_type not in (None, "access", "refresh"):
        logger.warning("refresh_token rejected: invalid token type=%s", token_type)
        return None

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        return None

    token = create_access_token(
        user.id, tenant_id=user.tenant_id, role=user.role or "member"
    )
    return TokenResponse(access_token=token, token_type="bearer")


def change_password(
    db: Session, user: User, old_password: str, new_password: str
) -> bool:
    if not verify_password(old_password, user.password_hash):
        return False
    user.password_hash = hash_password(new_password)
    _safe_emit(
        db,
        event_type=event_types.AUTH_PASSWORD_CHANGED,
        user_id=user.id,
        tenant_id=user.tenant_id,
        source_entity_type="user",
        source_entity_id=user.id,
        payload={
            "title": "修改登录密码",
            "detail": "账号密码已更新",
        },
    )
    db.commit()
    return True


def request_password_reset(db: Session, payload: ForgotPasswordRequest) -> str | None:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        return None
    token = create_password_reset_token(user.id)
    logger.info("Password reset token issued for user_id=%s", user.id)
    _safe_emit(
        db,
        event_type=event_types.AUTH_PASSWORD_RESET_REQUESTED,
        user_id=user.id,
        tenant_id=user.tenant_id,
        source_entity_type="user",
        source_entity_id=user.id,
        payload={
            "title": "申请重置密码",
            "detail": f"邮箱 {user.email} 发起了密码重置",
        },
    )
    db.commit()
    return token


def reset_password(db: Session, token: str, new_password: str) -> bool:
    from apps.api.app.core.security import decode_access_token

    try:
        payload = decode_access_token(token)
    except Exception:
        logger.exception("reset_password failed during token decode")
        return False

    if payload.get("type") != "reset":
        return False

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        return False

    user.password_hash = hash_password(new_password)
    _safe_emit(
        db,
        event_type=event_types.AUTH_PASSWORD_RESET,
        user_id=user.id,
        tenant_id=user.tenant_id,
        source_entity_type="user",
        source_entity_id=user.id,
        payload={
            "title": "完成密码重置",
            "detail": "已通过重置链接更新密码",
        },
    )
    db.commit()
    return True
