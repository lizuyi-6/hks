from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from apps.api.app.core.database import SessionLocal
from apps.api.app.core.streaming import sse_event
from apps.api.app.db.models import Notification
from apps.api.app.services.dependencies import TenantContext, get_current_tenant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications-stream"])

POLL_INTERVAL_SECONDS = 3
KEEPALIVE_INTERVAL_SECONDS = 30


@router.get("/stream")
async def notifications_stream(
    ctx: TenantContext = Depends(get_current_tenant),
):
    user_id = ctx.user.id
    connect_time = datetime.now(timezone.utc)
    logger.info("notifications_stream.connect user_id=%s", user_id)

    def _poll_notifications(after: datetime) -> list[dict]:
        """Run a short-lived DB query per poll cycle to avoid holding a session open."""
        try:
            with SessionLocal() as db:
                notifs = (
                    db.query(Notification)
                    .filter(
                        Notification.user_id == user_id,
                        Notification.created_at > after,
                        Notification.dismissed_at.is_(None),
                    )
                    .order_by(Notification.created_at.asc())
                    .all()
                )
                return [
                    {
                        "id": n.id,
                        "category": n.category,
                        "priority": n.priority,
                        "title": n.title,
                        "body": n.body,
                        "actionUrl": n.action_url,
                        "actionLabel": n.action_label,
                        "createdAt": n.created_at.isoformat(),
                    }
                    for n in notifs
                ]
        except Exception:
            logger.exception("notifications_stream.poll_error user_id=%s", user_id)
            return []

    async def generator():
        last_check = connect_time
        last_ping = connect_time

        try:
            while True:
                now = datetime.now(timezone.utc)

                # Off-load sync DB query to a thread so we don't block the event loop.
                rows = await asyncio.to_thread(_poll_notifications, last_check)

                for data in rows:
                    yield sse_event("notification", data)

                if rows:
                    last_check = now

                if (now - last_ping).total_seconds() >= KEEPALIVE_INTERVAL_SECONDS:
                    yield sse_event("ping", {})
                    last_ping = now

                await asyncio.sleep(POLL_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            logger.info("notifications_stream.disconnect user_id=%s", user_id)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
