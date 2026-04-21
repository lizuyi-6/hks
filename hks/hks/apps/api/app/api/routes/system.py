from fastapi import APIRouter

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.schemas.common import HealthProvider


router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health")
def health():
    return {
        "providers": [
            HealthProvider(
                port=item.port,
                mode=item.mode,
                provider=item.provider,
                available=item.available,
                reason=item.reason,
            ).model_dump(mode="json")
            for item in provider_registry.health()
        ]
    }

