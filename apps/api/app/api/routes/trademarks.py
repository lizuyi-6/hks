from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.core.database import get_db
from apps.api.app.core.error_handler import BusinessError, NotFoundError, SystemError, ValidationError
from apps.api.app.schemas.common import JobResponse
from apps.api.app.schemas.trademark import ApplicationDraftRequest, TrademarkCheckRequest
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.jobs import (
    build_submission_bundle,
    document_path_for,
    enqueue_job,
    get_document_record,
    process_job,
)


router = APIRouter(prefix="/trademarks", tags=["trademarks"])


@router.post("/check")
def check_trademark(
    payload: TrademarkCheckRequest,
    _user=Depends(get_current_user),
):
    try:
        result = provider_registry.get("trademarkSearch").search(payload, trace_id=str(uuid4()))
        return result.model_dump(mode="json", by_alias=True, exclude_none=True)
    except Exception as e:
        raise SystemError(message=str(e), error_location="/trademarks/check") from e


@router.post("/application/jobs", response_model=JobResponse)
def create_application_job(
    payload: ApplicationDraftRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    try:
        job = enqueue_job(db, "trademark.application", payload.model_dump(mode="json"))
        process_job(db, job)
        db.refresh(job)
        if job.status == "failed":
            raise BusinessError(
                message=job.error_message or "申请书生成失败",
                context="/trademarks/application/jobs",
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
        raise SystemError(message=str(e), error_location="/trademarks/application/jobs") from e


@router.get("/drafts/{draft_id}")
def get_draft_bundle(
    draft_id: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    try:
        return build_submission_bundle(db, draft_id)
    except ValueError as exc:
        raise NotFoundError(message=str(exc), resource=f"/trademarks/drafts/{draft_id}") from exc
    except Exception as e:
        raise SystemError(message=str(e), error_location=f"/trademarks/drafts/{draft_id}") from e


@router.get("/documents/{draft_id}.{extension}")
def download_document(
    draft_id: str,
    extension: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    if extension not in {"docx", "pdf"}:
        raise ValidationError(message="不支持的文件类型", field="/trademarks/documents")

    try:
        record = get_document_record(db, draft_id)
        path = document_path_for(record, extension)
    except ValueError as exc:
        raise NotFoundError(message=str(exc), resource=f"/trademarks/documents/{draft_id}.{extension}") from exc
    except Exception as e:
        raise SystemError(message=str(e), error_location=f"/trademarks/documents/{draft_id}.{extension}") from e

    media_type = (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if extension == "docx"
        else "application/pdf"
    )
    return FileResponse(Path(path), media_type=media_type, filename=Path(path).name)
