from __future__ import annotations

import logging
import threading

from croniter import croniter
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class CronScheduler:
    def __init__(self, session_factory, poll_interval_seconds: int = 60):
        self._session_factory = session_factory
        self._poll_interval = poll_interval_seconds
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run_loop,
            name="CronScheduler",
            daemon=True,
        )
        self._thread.start()
        logger.info("CronScheduler started (interval=%ds)", self._poll_interval)

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception:
                logger.exception("CronScheduler tick error")
            self._stop_event.wait(timeout=self._poll_interval)

    def _tick(self) -> None:
        from apps.api.app.db.models import AutomationRule
        from apps.api.app.services.automation_engine import execute_action

        with self._session_factory() as db:
            rules = (
                db.query(AutomationRule)
                .filter(
                    AutomationRule.trigger_type == "cron",
                    AutomationRule.enabled == True,  # noqa: E712
                )
                .all()
            )

            now = datetime.now(timezone.utc)

            for rule in rules:
                cron_expr = (rule.trigger_config or {}).get("cron")
                if not cron_expr:
                    continue

                base_time = rule.last_fired_at or rule.created_at
                if base_time.tzinfo is None:
                    base_time = base_time.replace(tzinfo=timezone.utc)

                try:
                    cron = croniter(cron_expr, base_time)
                    next_run = cron.get_next(datetime)
                    if next_run.tzinfo is None:
                        next_run = next_run.replace(tzinfo=timezone.utc)
                except Exception:
                    logger.warning("invalid cron expr '%s' in rule %s", cron_expr, rule.rule_key)
                    continue

                if now >= next_run:
                    logger.info("firing cron rule: %s", rule.rule_key)
                    execute_action(db, rule, triggering_event=None, context_user_id=None)
