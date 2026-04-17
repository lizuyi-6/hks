from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from apps.api.app.db.models import AutomationRule
from apps.api.app.services.automation_engine import evaluate_condition, execute_action
from apps.api.app.services.event_bus import get_unprocessed_events, mark_event_processed

logger = logging.getLogger(__name__)


def process_events(db: Session) -> int:
    events = get_unprocessed_events(db, batch_size=50)
    if not events:
        return 0

    event_rules = (
        db.query(AutomationRule)
        .filter(
            AutomationRule.trigger_type == "event",
            AutomationRule.enabled == True,  # noqa: E712
        )
        .all()
    )

    processed_count = 0
    for event in events:
        matching_rules = [
            r for r in event_rules
            if (r.trigger_config or {}).get("event_type") == event.event_type
        ]

        for rule in matching_rules:
            if evaluate_condition(rule.condition_expr, event):
                logger.info(
                    "rule '%s' matched event %s (id=%s)",
                    rule.rule_key,
                    event.event_type,
                    event.id,
                )
                execute_action(
                    db,
                    rule=rule,
                    triggering_event=event,
                    context_user_id=event.user_id,
                )

        mark_event_processed(db, event.id)
        db.commit()
        processed_count += 1

    return processed_count
