import logging
import threading

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.app.core.database import SessionLocal, get_db
from apps.api.app.schemas.common import JobResponse
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.jobs import get_job_or_error, process_job, rerun_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _process_in_background(job_id: str) -> None:
    import traceback
    try:
        with SessionLocal() as db:
            job = get_job_or_error(db, job_id)
            logger.info(f"[Background] Starting job {job_id} (type={job.job_type})")
            process_job(db, job)
            logger.info(f"[Background] Completed job {job_id}, status={job.status}")
    except Exception:
        logger.error(f"[Background] Job {job_id} failed:\n{traceback.format_exc()}")


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    try:
        job = get_job_or_error(db, job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if job.status in {"queued", "failed"}:
        job.status = "processing"
        job.attempts += 1
        db.commit()
        db.refresh(job)
        thread = threading.Thread(
            target=_process_in_background, args=(job_id,), daemon=True
        )
        thread.start()

    return JobResponse(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        idempotency_key=job.idempotency_key,
        error_message=job.error_message,
        result=job.result,
    )


@router.post("/{identifier}/rerun", response_model=JobResponse)
def rerun(identifier: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    try:
        job = rerun_job(db, identifier)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return JobResponse(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        idempotency_key=job.idempotency_key,
        error_message=job.error_message,
        result=job.result,
    )
