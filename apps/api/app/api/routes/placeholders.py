from fastapi import APIRouter, Depends

from apps.api.app.core.config import get_settings
from apps.api.app.schemas.common import PlaceholderResponse
from apps.api.app.services.dependencies import get_current_user


router = APIRouter(tags=["placeholders"])
settings = get_settings()


def _placeholder(module: str, enabled: bool) -> PlaceholderResponse:
    return PlaceholderResponse(
        module=module,
        enabled=enabled,
        message="模块骨架已创建，真实业务能力后续按 feature flag 启用。",
    )


@router.get("/monitoring", response_model=PlaceholderResponse)
def monitoring(_user=Depends(get_current_user)):
    return _placeholder(
        "monitoring",
        settings.feature_monitoring_public_search
        or settings.feature_monitoring_authorized_api
        or settings.feature_monitoring_authorized_scrape,
    )


@router.get("/competitors", response_model=PlaceholderResponse)
def competitors(_user=Depends(get_current_user)):
    return _placeholder("competitors", settings.feature_competitors)


@router.get("/contracts", response_model=PlaceholderResponse)
def contracts(_user=Depends(get_current_user)):
    return _placeholder("contracts", settings.feature_contract_review)


@router.get("/patents", response_model=PlaceholderResponse)
def patents(_user=Depends(get_current_user)):
    return _placeholder("patents", settings.feature_patent_assist)


@router.get("/policies", response_model=PlaceholderResponse)
def policies(_user=Depends(get_current_user)):
    return _placeholder("policies", settings.feature_policy_digest)


@router.get("/due-diligence", response_model=PlaceholderResponse)
def due_diligence(_user=Depends(get_current_user)):
    return _placeholder("due-diligence", settings.feature_due_diligence)

