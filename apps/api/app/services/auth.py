from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.core.security import create_access_token, hash_password, verify_password
from apps.api.app.db.models import User
from apps.api.app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse


def register_user(db: Session, payload: RegisterRequest) -> TokenResponse:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise ValueError("该邮箱已注册")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id))


def login_user(db: Session, payload: LoginRequest) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise ValueError("邮箱或密码错误")

    return TokenResponse(access_token=create_access_token(user.id))

