from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from starlette.responses import StreamingResponse


class _JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, UUID):
            return str(o)
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def sse_event(event: str, data: dict | str) -> str:
    """Format a single SSE event string."""
    payload = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, cls=_JSONEncoder)
    return f"event: {event}\ndata: {payload}\n\n"


def streaming_response(generator: AsyncGenerator[str, None]) -> StreamingResponse:
    """Wrap an async generator in a StreamingResponse for SSE."""
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
