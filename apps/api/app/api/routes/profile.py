from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import User
from apps.api.app.schemas.profile import (
    ProfileStatusResponse,
    ProfileUpdateRequest,
    UserProfileResponse,
)
from apps.api.app.services.dependencies import get_current_user

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
