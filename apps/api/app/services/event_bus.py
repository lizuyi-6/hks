from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.db.models import SystemEvent


def emit_event(
    db: Session,
    event_type: str,
    user_id: str | None = None,
    tenant_id: str | None = None,
    source_entity_type: str | None = None,
    source_entity_id: str | None = None,
    payload: dict | None = None,
) -> SystemEvent:
    event = SystemEvent(
        event_type=event_type,
        user_id=user_id,
        tenant_id=tenant_id,
        source_entity_type=source_entity_type,
        source_entity_id=source_entity_id,
        payload=payload or {},
        processed=False,
    )
    db.add(event)
    db.flush()
    return event


def get_unprocessed_events(db: Session, batch_size: int = 50) -> list[SystemEvent]:
    return (
        db.query(SystemEvent)
        .filter(SystemEvent.processed == False)  # noqa: E712
        .order_by(SystemEvent.created_at.asc())
        .limit(batch_size)
        .all()
    )


def mark_event_processed(db: Session, event_id: str) -> None:
    db.query(SystemEvent).filter(SystemEvent.id == event_id).update(
        {"processed": True}
    )
