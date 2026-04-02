from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.schemas.common import JobResponse
from apps.api.app.schemas.diagnosis import DiagnosisRequest
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.jobs import enqueue_job


router = APIRouter(prefix="/diagnosis", tags=["diagnosis"])


@router.post("/jobs", response_model=JobResponse)
def create_diagnosis_job(
    payload: DiagnosisRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    job = enqueue_job(db, "diagnosis.report", payload.model_dump(mode="json"))
    return JobResponse(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        idempotency_key=job.idempotency_key,
        error_message=job.error_message,
        result=job.result,
    )

