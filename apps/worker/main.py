from __future__ import annotations

import logging
import time

from apps.api.app.core.config import get_settings
from apps.api.app.core.database import SessionLocal
from apps.api.app.services.jobs import process_due_jobs


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
settings = get_settings()


def main() -> None:
    logging.info("worker started with poll interval=%s", settings.worker_poll_interval)
    while True:
        with SessionLocal() as db:
            jobs = process_due_jobs(db)
            if jobs:
                logging.info("processed %s jobs", len(jobs))
        time.sleep(settings.worker_poll_interval)


if __name__ == "__main__":
    main()

