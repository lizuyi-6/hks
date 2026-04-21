from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict


T = TypeVar("T")


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class SourceRef(ApiModel):
    title: str
    url: str | None = None
    note: str | None = None


class DataSourceEnvelope(ApiModel, Generic[T]):
    mode: Literal["real", "mock"]
    provider: str
    trace_id: str
    retrieved_at: datetime
    source_refs: list[SourceRef]
    disclaimer: str
    normalized_payload: T


class PlaceholderResponse(ApiModel):
    module: str
    enabled: bool
    status: Literal["placeholder"] = "placeholder"
    message: str


class HealthProvider(ApiModel):
    port: str
    mode: Literal["real", "mock"]
    provider: str
    available: bool
    reason: str | None = None


class JobResponse(ApiModel):
    id: str
    job_type: str
    status: str
    idempotency_key: str
    error_message: str | None = None
    result: Any | None = None
