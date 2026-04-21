import logging
import threading

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from apps.api.app.core.database import SessionLocal, get_db
from apps.api.app.db.models import JobRecord
from apps.api.app.schemas.common import JobResponse
from apps.api.app.services.dependencies import TenantContext, get_current_tenant
from apps.api.app.services.jobs import get_job_or_error, process_job, rerun_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _job_to_dict(j: JobRecord) -> dict:
    return {
        "id": j.id,
        "jobType": j.job_type,
        "status": j.status,
        "createdAt": j.created_at.isoformat(),
        "tenantId": j.tenant_id,
    }


@router.get("")
def list_jobs(
    status: str | None = Query(None),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    q = db.query(JobRecord)
    if ctx.tenant:
        q = q.filter(JobRecord.tenant_id == ctx.tenant.id)
    if status:
        statuses = [s.strip() for s in status.split(",")]
        q = q.filter(JobRecord.status.in_(statuses))
    jobs = q.order_by(JobRecord.created_at.desc()).limit(limit).all()
    return [_job_to_dict(j) for j in jobs]


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
def get_job(job_id: str, db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    q = db.query(JobRecord).filter(JobRecord.id == job_id)
    if ctx.tenant:
        q = q.filter(JobRecord.tenant_id == ctx.tenant.id)
    job = q.first()
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在")

    if job.status in {"queued", "failed"}:
        # Atomic claim: only one concurrent GET can flip the status to 'processing'.
        from sqlalchemy import update

        result = db.execute(
            update(JobRecord)
            .where(JobRecord.id == job_id, JobRecord.status.in_(["queued", "failed"]))
            .values(status="processing", attempts=JobRecord.attempts + 1)
        )
        db.commit()
        db.refresh(job)
        if result.rowcount == 1:
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
def rerun(identifier: str, db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    try:
        job = rerun_job(db, identifier)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if ctx.tenant and job.tenant_id != ctx.tenant.id:
        raise HTTPException(status_code=404, detail="任务不存在")

    return JobResponse(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        idempotency_key=job.idempotency_key,
        error_message=job.error_message,
        result=job.result,
    )
