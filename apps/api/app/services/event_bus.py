from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from apps.api.app.db.models import SystemEvent

logger = logging.getLogger(__name__)


def emit_event(
    db: Session,
    event_type: str,
    user_id: str | None = None,
    tenant_id: str | None = None,
    source_entity_type: str | None = None,
    source_entity_id: str | None = None,
    payload: dict | None = None,
    idempotent: bool = False,
) -> SystemEvent:
    """Emit a system event.

    When ``idempotent`` is True and a source entity is provided, we first
    check whether an event with the same (event_type, source_entity_type,
    source_entity_id) triple already exists. If it does, the existing row
    is returned and no duplicate is inserted.

    This matters for jobs like ``diagnosis.report`` that may legitimately
    run for minutes: if the stale-processing reclaim loop ever resurrects
    the job row while the original run is finishing, both runs emit
    ``DIAGNOSIS_COMPLETED`` and downstream scenario rules fire twice.
    """
    if idempotent and source_entity_id:
        existing = (
            db.query(SystemEvent)
            .filter(
                SystemEvent.event_type == event_type,
                SystemEvent.source_entity_type == source_entity_type,
                SystemEvent.source_entity_id == source_entity_id,
            )
            .first()
        )
        if existing is not None:
            logger.info(
                "event.dedup_skipped type=%s source=%s/%s existing=%s",
                event_type,
                source_entity_type,
                source_entity_id,
                existing.id,
            )
            return existing

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
