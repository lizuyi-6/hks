from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.core.streaming import sse_event
from apps.api.app.db.models import Notification
from apps.api.app.services.dependencies import TenantContext, get_current_tenant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications-stream"])

POLL_INTERVAL_SECONDS = 3
KEEPALIVE_INTERVAL_SECONDS = 30


@router.get("/stream")
async def notifications_stream(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    user_id = ctx.user.id
    connect_time = datetime.now(timezone.utc)

    async def generator():
        last_check = connect_time
        last_ping = connect_time

        while True:
            now = datetime.now(timezone.utc)

            new_notifs = (
                db.query(Notification)
                .filter(
                    Notification.user_id == user_id,
                    Notification.created_at > last_check,
                    Notification.dismissed_at.is_(None),
                )
                .order_by(Notification.created_at.asc())
                .all()
            )

            for notif in new_notifs:
                data = {
                    "id": notif.id,
                    "category": notif.category,
                    "priority": notif.priority,
                    "title": notif.title,
                    "body": notif.body,
                    "actionUrl": notif.action_url,
                    "actionLabel": notif.action_label,
                    "createdAt": notif.created_at.isoformat(),
                }
                yield sse_event("notification", data)

            if new_notifs:
                last_check = now

            if (now - last_ping).total_seconds() >= KEEPALIVE_INTERVAL_SECONDS:
                yield sse_event("ping", {})
                last_ping = now

            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
