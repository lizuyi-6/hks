from datetime import datetime
from typing import Any
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.services.dependencies import TenantContext, get_current_tenant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])

analytics_storage: list[dict[str, Any]] = []


@router.post("/events")
async def receive_events(request: dict):
    try:
        events = request.get("events", [])
        session_id = request.get("session_id")
        user_id = request.get("user_id")
        tenant_id = request.get("tenant_id")

        if not events:
            return {"ok": True, "received": 0}

        stored_count = 0
        for event in events:
            event_record = {
                "id": len(analytics_storage) + stored_count + 1,
                "event_type": event.get("event"),
                "event_data": event,
                "page": event.get("page"),
                "session_id": session_id,
                "user_id": user_id,
                "tenant_id": tenant_id,
                "created_at": datetime.utcnow().isoformat(),
            }
            analytics_storage.append(event_record)
            stored_count += 1

            if event.get("event") == "error":
                logger.error(
                    f"[Analytics] Error event: {event.get('error_type')} - {event.get('message')}"
                )

            if event.get("event") == "api_performance":
                duration_ms = event.get("duration_ms", 0)
                status_code = event.get("status_code", 0)
                if duration_ms > 1000 or status_code >= 400:
                    logger.warning(
                        f"[Analytics] Slow/error API: {event.get('method')} {event.get('endpoint')} - "
                        f"{duration_ms}ms - HTTP {status_code}"
                    )

        logger.info(f"[Analytics] Stored {stored_count} events, total: {len(analytics_storage)}")

        return {"ok": True, "received": stored_count}
    except Exception as e:
        logger.error(f"[Analytics] Error processing events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events")
async def get_events(
    page: str | None = None,
    event_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
    ctx: TenantContext = Depends(get_current_tenant),
):
    filtered = analytics_storage

    if ctx.tenant:
        filtered = [e for e in filtered if e.get("tenant_id") == ctx.tenant.id]

    if page:
        filtered = [e for e in filtered if e.get("page") == page]

    if event_type:
        filtered = [e for e in filtered if e.get("event_type") == event_type]

    total = len(filtered)
    paginated = filtered[offset : offset + limit]

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "events": paginated,
    }


@router.get("/stats")
async def get_stats(ctx: TenantContext = Depends(get_current_tenant)):
    filtered = analytics_storage
    if ctx.tenant:
        filtered = [e for e in filtered if e.get("tenant_id") == ctx.tenant.id]

    if not filtered:
        return {
            "total_events": 0,
            "event_types": {},
            "pages": {},
        }

    event_types = {}
    pages = {}
    errors = 0
    slow_apis = 0

    for event in filtered:
        event_type = event.get("event_type", "unknown")
        event_types[event_type] = event_types.get(event_type, 0) + 1

        page = event.get("page", "unknown")
        pages[page] = pages.get(page, 0) + 1

        if event_type == "error":
            errors += 1

        if event_type == "api_performance":
            if event.get("duration_ms", 0) > 1000 or event.get("status_code", 0) >= 400:
                slow_apis += 1

    return {
        "total_events": len(filtered),
        "event_types": event_types,
        "pages": pages,
        "errors": errors,
        "slow_apis": slow_apis,
    }


@router.delete("/events")
async def clear_events(ctx: TenantContext = Depends(get_current_tenant)):
    global analytics_storage
    if ctx.tenant:
        analytics_storage = [e for e in analytics_storage if e.get("tenant_id") != ctx.tenant.id]
        cleared = len(analytics_storage)
    else:
        count = len(analytics_storage)
        analytics_storage = []
        cleared = count
    return {"ok": True, "cleared": cleared}
