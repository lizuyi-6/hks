from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from apps.api.app.core.database import get_db
from apps.api.app.core.security import decode_access_token
from apps.api.app.db.models import Tenant, User

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="未登录")

    try:
        payload = decode_access_token(credentials.credentials)
        user = db.query(User).filter(User.id == payload["sub"]).first()
    except Exception as exc:  # noqa: BLE001
        logger.warning("auth.jwt.invalid error=%s", type(exc).__name__)
        raise HTTPException(status_code=401, detail="Token 无效") from exc

    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")

    return user


def try_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    """Best-effort current user lookup that returns ``None`` instead of raising.

    Useful for endpoints that accept both authenticated and anonymous callers,
    e.g. ``/auth/logout`` — we still want to emit a ``user.logout`` activity
    event when we know who the caller is, but must not 401 otherwise.
    """
    if credentials is None:
        return None
    try:
        payload = decode_access_token(credentials.credentials)
    except Exception:  # noqa: BLE001 — anonymous-friendly path
        return None
    sub = payload.get("sub") if isinstance(payload, dict) else None
    if not sub:
        return None
    return db.query(User).filter(User.id == sub).first()


@dataclass
class TenantContext:
    user: User
    tenant: Tenant | None


def get_current_tenant(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> TenantContext:
    if credentials is None:
        raise HTTPException(status_code=401, detail="未登录")

    try:
        payload = decode_access_token(credentials.credentials)
        user = db.query(User).filter(User.id == payload["sub"]).first()
    except Exception as exc:  # noqa: BLE001
        logger.warning("auth.jwt.invalid error=%s", type(exc).__name__)
        raise HTTPException(status_code=401, detail="Token 无效") from exc

    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")

    tenant = None
    tid = payload.get("tid") or (user.tenant_id if user else None)
    if tid:
        tenant = db.query(Tenant).filter(Tenant.id == tid).first()

    return TenantContext(user=user, tenant=tenant)


# Roles that may write tenant-scoped admin resources (integrations, policy, …).
_TENANT_ADMIN_ROLES = {"admin", "owner"}


def require_tenant_admin(
    ctx: TenantContext = Depends(get_current_tenant),
) -> TenantContext:
    """Guard admin-only tenant endpoints.

    Used by the integrations routes so only ``admin`` / ``owner`` users can
    rotate Bing / SMTP / Doubao / Tianyancha credentials. Non-admin tenants
    can still read the *masked* summary via :func:`get_current_tenant`.
    """
    role = (ctx.user.role or "member").lower()
    if role not in _TENANT_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="需要租户管理员权限")
    return ctx
