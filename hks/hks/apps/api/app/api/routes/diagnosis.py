from uuid import uuid4

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.core.database import get_db
from apps.api.app.core.error_handler import BusinessError, SystemError
from apps.api.app.schemas.common import JobResponse
from apps.api.app.schemas.diagnosis import DiagnosisRequest
from apps.api.app.services.dependencies import TenantContext, get_current_tenant
from apps.api.app.services.jobs import enqueue_job, process_job


router = APIRouter(prefix="/diagnosis", tags=["diagnosis"])


@router.post("", response_model=JobResponse)
def run_diagnosis(
    payload: DiagnosisRequest,
    db: Session = Depends(get_db),
    _ctx: TenantContext = Depends(get_current_tenant),
):
    try:
        data = payload.model_dump(mode="json")
        if _ctx.tenant:
            data["_tenant_id"] = _ctx.tenant.id
        # Inject a per-click nonce so the idempotency cache never returns a
        # stale previous job.result for the same business description — each
        # "重新诊断" must really go through the LLM again.
        data["_nonce"] = uuid4().hex
        job = enqueue_job(db, "diagnosis.report", data)
        process_job(db, job)
        db.refresh(job)
        if job.status == "failed":
            raise BusinessError(
                message=job.error_message or "IP诊断失败",
                context="/diagnosis",
                details={"job_id": job.id, "status": job.status}
            )
        return JobResponse(
            id=job.id,
            job_type=job.job_type,
            status=job.status,
            idempotency_key=job.idempotency_key,
            error_message=job.error_message,
            result=job.result,
        )
    except BusinessError:
        raise
    except Exception as e:
        raise SystemError(message=str(e), error_location="/diagnosis") from e


@router.post("/jobs", response_model=JobResponse)
def create_diagnosis_job(
    payload: DiagnosisRequest,
    db: Session = Depends(get_db),
    _ctx: TenantContext = Depends(get_current_tenant),
):
    try:
        data = payload.model_dump(mode="json")
        if _ctx.tenant:
            data["_tenant_id"] = _ctx.tenant.id
        data["_nonce"] = uuid4().hex
        job = enqueue_job(db, "diagnosis.report", data)
        return JobResponse(
            id=job.id,
            job_type=job.job_type,
            status=job.status,
            idempotency_key=job.idempotency_key,
            error_message=job.error_message,
            result=job.result,
        )
    except Exception as e:
        raise SystemError(message=str(e), error_location="/diagnosis/jobs") from e
