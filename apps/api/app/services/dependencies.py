from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

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
        raise HTTPException(status_code=401, detail="Token 无效") from exc

    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")

    return user


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
        raise HTTPException(status_code=401, detail="Token 无效") from exc

    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")

    tenant = None
    tid = payload.get("tid") or (user.tenant_id if user else None)
    if tid:
        tenant = db.query(Tenant).filter(Tenant.id == tid).first()

    return TenantContext(user=user, tenant=tenant)
