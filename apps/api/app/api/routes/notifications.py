from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.core.error_handler import NotFoundError
from apps.api.app.services.dependencies import TenantContext, get_current_tenant
from apps.api.app.services.notifications import (
    dismiss_notification,
    get_notifications,
    get_unread_count,
    mark_all_read,
    mark_read,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _notif_to_dict(n) -> dict:
    return {
        "id": n.id,
        "category": n.category,
        "priority": n.priority,
        "title": n.title,
        "body": n.body,
        "actionUrl": n.action_url,
        "actionLabel": n.action_label,
        "sourceEntityType": n.source_entity_type,
        "sourceEntityId": n.source_entity_id,
        "readAt": n.read_at.isoformat() if n.read_at else None,
        "dismissedAt": n.dismissed_at.isoformat() if n.dismissed_at else None,
        "createdAt": n.created_at.isoformat(),
    }


@router.get("")
def list_notifications(
    unread_only: bool = Query(False),
    category: str | None = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    items = get_notifications(
        db,
        user_id=ctx.user.id,
        tenant_id=ctx.tenant.id if ctx.tenant else None,
        unread_only=unread_only,
        category=category,
        limit=limit,
        offset=offset,
    )
    return [_notif_to_dict(n) for n in items]


@router.get("/count")
def notification_count(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    count = get_unread_count(db, user_id=ctx.user.id)
    return {"unread": count}


@router.post("/{notification_id}/read")
def read_notification(
    notification_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    mark_read(db, notification_id=notification_id, user_id=ctx.user.id)
    return {"ok": True}


@router.post("/read-all")
def read_all_notifications(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    count = mark_all_read(db, user_id=ctx.user.id)
    return {"marked": count}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    dismissed = dismiss_notification(db, notification_id=notification_id, user_id=ctx.user.id)
    if not dismissed:
        raise NotFoundError(f"Notification {notification_id} not found")
    return {"ok": True}
