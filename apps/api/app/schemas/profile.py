from __future__ import annotations

from datetime import datetime

from apps.api.app.schemas.common import ApiModel


class UserProfileResponse(ApiModel):
    id: str
    email: str
    full_name: str
    business_name: str | None = None
    business_description: str | None = None
    industry: str | None = None
    stage: str | None = None
    applicant_type: str | None = None
    applicant_name: str | None = None
    has_trademark: bool | None = None
    has_patent: bool | None = None
    ip_focus: str | None = None
    profile_complete: bool = False
    created_at: datetime


class ProfileUpdateRequest(ApiModel):
    full_name: str | None = None
    business_name: str | None = None
    business_description: str | None = None
    industry: str | None = None
    stage: str | None = None
    applicant_type: str | None = None
    applicant_name: str | None = None
    has_trademark: bool | None = None
    has_patent: bool | None = None
    ip_focus: str | None = None


class ProfileStatusResponse(ApiModel):
    has_profile: bool
    profile_complete: bool
