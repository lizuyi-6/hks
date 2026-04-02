from datetime import datetime

from apps.api.app.schemas.common import ApiModel


class AssetCreateRequest(ApiModel):
    name: str
    type: str
    registration_number: str | None = None
    expires_at: str | None = None


class AssetResponse(ApiModel):
    id: str
    name: str
    type: str
    registration_number: str | None = None
    status: str
    expires_at: datetime | None = None
    next_milestone: str | None = None
    source_mode: str


class ReminderResponse(ApiModel):
    id: str
    asset_id: str
    channel: str
    due_at: datetime
    status: str
