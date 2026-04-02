from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.schemas.common import JobResponse
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.jobs import get_job_or_error, rerun_job


router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    try:
        job = get_job_or_error(db, job_id)
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

