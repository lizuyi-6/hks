from __future__ import annotations

import logging
import time

from apps.api.app.core.config import get_settings
from apps.api.app.core.database import Base, SessionLocal, engine
from apps.api.app.services.automation_engine import seed_builtin_rules
from apps.api.app.services.jobs import process_due_jobs
from apps.worker.event_processor import process_events
from apps.worker.scheduler import CronScheduler


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
settings = get_settings()


def main() -> None:
    logging.info("worker started with poll interval=%s", settings.worker_poll_interval)

    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        seed_builtin_rules(db)

    scheduler = CronScheduler(session_factory=SessionLocal, poll_interval_seconds=60)
    scheduler.start()

    try:
        while True:
            try:
                with SessionLocal() as db:
                    jobs = process_due_jobs(db)
                    events_processed = process_events(db)

                    if jobs or events_processed:
                        job_count = len(jobs) if isinstance(jobs, list) else jobs
                        logging.info(
                            "cycle: %d jobs, %d events consumed",
                            job_count if isinstance(job_count, int) else 0,
                            events_processed,
                        )
            except Exception:
                logging.exception("worker.cycle.failed — will retry after poll interval")

            time.sleep(settings.worker_poll_interval)
    except KeyboardInterrupt:
        logging.info("worker shutting down…")
        scheduler.stop()


if __name__ == "__main__":
    main()
