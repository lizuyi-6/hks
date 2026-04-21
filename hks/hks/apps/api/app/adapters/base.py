from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from apps.api.app.schemas.common import DataSourceEnvelope, SourceRef


def make_envelope(*, mode: str, provider: str, trace_id: str | None, source_refs: list[SourceRef], disclaimer: str, normalized_payload):
    return DataSourceEnvelope(
        mode=mode,
        provider=provider,
        trace_id=trace_id or str(uuid4()),
        retrieved_at=datetime.now(timezone.utc),
        source_refs=source_refs,
        disclaimer=disclaimer,
        normalized_payload=normalized_payload,
    )

