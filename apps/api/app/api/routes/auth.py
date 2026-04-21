import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from apps.api.app.services import event_types
from apps.api.app.services.auth import (
    change_password,
    login_user,
    refresh_token,
    register_user,
    request_password_reset,
    reset_password,
)
from apps.api.app.services.dependencies import get_current_user, try_current_user
from apps.api.app.services.event_bus import emit_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    try:
        return register_user(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    try:
        return login_user(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.post("/logout")
def logout(
    user=Depends(try_current_user),
    db: Session = Depends(get_db),
):
    if user is not None:
        try:
            emit_event(
                db,
                event_type=event_types.USER_LOGOUT,
                user_id=user.id,
                tenant_id=user.tenant_id,
                source_entity_type="user",
                source_entity_id=user.id,
                payload={
                    "title": "账号登出",
                    "detail": f"{user.email} 退出登录",
                },
            )
            db.commit()
        except Exception:  # pragma: no cover — defensive
            logger.exception("logout event emit failed user_id=%s", user.id)
    return {"ok": True}


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    result = refresh_token(db, payload.token)
    if not result:
        raise HTTPException(status_code=401, detail="Token 无法刷新")
    return result


@router.post("/change-password")
def change_pwd(
    payload: ChangePasswordRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not change_password(db, user, payload.old_password, payload.new_password):
        raise HTTPException(status_code=400, detail="旧密码不正确")
    return {"ok": True}


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    token = request_password_reset(db, payload)
    # Always return success to avoid email enumeration
    return {"ok": True, "message": "如果该邮箱已注册，重置链接已发送"}


@router.post("/reset-password")
def reset_pwd(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    if not reset_password(db, payload.token, payload.new_password):
        raise HTTPException(status_code=400, detail="重置链接无效或已过期")
    return {"ok": True}
