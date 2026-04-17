from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from apps.api.app.db.models import Notification


def create_notification(
    db: Session,
    user_id: str,
    tenant_id: str | None,
    category: str,
    priority: str,
    title: str,
    body: str | None = None,
    action_url: str | None = None,
    action_label: str | None = None,
    source_entity_type: str | None = None,
    source_entity_id: str | None = None,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        tenant_id=tenant_id,
        category=category,
        priority=priority,
        title=title,
        body=body,
        action_url=action_url,
        action_label=action_label,
        source_entity_type=source_entity_type,
        source_entity_id=source_entity_id,
    )
    db.add(notif)
    db.flush()
    return notif


def get_notifications(
    db: Session,
    user_id: str,
    tenant_id: str | None = None,
    unread_only: bool = False,
    category: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Notification]:
    q = db.query(Notification).filter(Notification.user_id == user_id)
    if tenant_id:
        q = q.filter(Notification.tenant_id == tenant_id)
    if unread_only:
        q = q.filter(Notification.read_at.is_(None))
    if category:
        q = q.filter(Notification.category == category)
    return (
        q.order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def get_unread_count(db: Session, user_id: str) -> int:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read_at.is_(None))
        .count()
    )


def mark_read(db: Session, notification_id: str, user_id: str) -> Notification | None:
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if notif and not notif.read_at:
        notif.read_at = datetime.now(timezone.utc)
        db.commit()
    return notif


def mark_all_read(db: Session, user_id: str) -> int:
    now = datetime.now(timezone.utc)
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read_at.is_(None))
        .update({"read_at": now})
    )
    db.commit()
    return count


def dismiss_notification(db: Session, notification_id: str, user_id: str) -> bool:
    now = datetime.now(timezone.utc)
    count = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .update({"dismissed_at": now})
    )
    db.commit()
    return count > 0
