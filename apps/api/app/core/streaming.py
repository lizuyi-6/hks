from __future__ import annotations

import json
from collections.abc import AsyncGenerator

from starlette.responses import StreamingResponse


def sse_event(event: str, data: dict | str) -> str:
    """Format a single SSE event string."""
    payload = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)
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
