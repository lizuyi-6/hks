from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from apps.api.app.services.auth import login_user, register_user


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

