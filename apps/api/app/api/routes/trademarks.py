import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.core.database import get_db
from apps.api.app.core.error_handler import BusinessError, NotFoundError, SystemError, ValidationError
from apps.api.app.schemas.common import JobResponse
from apps.api.app.schemas.trademark import ApplicationDraftRequest, TrademarkCheckRequest
from apps.api.app.services.dependencies import TenantContext, get_current_tenant
from apps.api.app.db.models import DocumentRecord, JobRecord
from apps.api.app.services import event_types
from apps.api.app.services.event_bus import emit_event
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
    db: Session = Depends(get_db),
    _ctx: TenantContext = Depends(get_current_tenant),
):
    try:
        result = provider_registry.get("trademarkSearch").search(payload, trace_id=str(uuid4()))
        dumped = result.model_dump(mode="json", by_alias=True, exclude_none=True)

        # 查重红灯 → 即时发事件给 scenario.trademark_red_flag，无需等 application 流程。
        try:
            normalized = (dumped.get("normalizedPayload") or {})
            risk_level = str(normalized.get("riskLevel") or normalized.get("risk_level") or "").lower()
            if risk_level == "red":
                emit_event(
                    db,
                    event_type=event_types.TRADEMARK_RED_FLAG,
                    user_id=_ctx.user.id if _ctx.user else None,
                    tenant_id=_ctx.tenant.id if _ctx.tenant else None,
                    source_entity_type="trademark_check",
                    source_entity_id=None,
                    payload={
                        "trademark_name": payload.trademark_name,
                        "applicant_name": payload.applicant_name,
                        "categories": payload.categories,
                        "risk_level": "red",
                        "summary": normalized.get("summary"),
                        "source": "check",
                    },
                )
        except Exception:
            logger.exception("emit trademark.red_flag failed at /trademarks/check")

        return dumped
    except Exception as e:
        logger.exception("trademark.check.failed endpoint=/trademarks/check")
        raise SystemError(message="商标查重服务暂时不可用", error_location="/trademarks/check") from e


@router.post("/application/jobs", response_model=JobResponse)
def create_application_job(
    payload: ApplicationDraftRequest,
    db: Session = Depends(get_db),
    _ctx: TenantContext = Depends(get_current_tenant),
):
    try:
        data = payload.model_dump(mode="json")
        if _ctx.tenant:
            data["_tenant_id"] = _ctx.tenant.id
        job = enqueue_job(db, "trademark.application", data)
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
        logger.exception("trademark.application.failed endpoint=/trademarks/application/jobs")
        raise SystemError(message="申请书生成服务暂时不可用", error_location="/trademarks/application/jobs") from e


@router.get("/drafts/{draft_id}")
def get_draft_bundle(
    draft_id: str,
    db: Session = Depends(get_db),
    _ctx: TenantContext = Depends(get_current_tenant),
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
    _ctx: TenantContext = Depends(get_current_tenant),
):
    if extension not in {"docx", "pdf", "md"}:
        raise ValidationError(message="不支持的文件类型", field="/trademarks/documents")

    try:
        # Join through JobRecord to enforce tenant ownership (prevents IDOR)
        record = (
            db.query(DocumentRecord)
            .join(JobRecord, JobRecord.id == DocumentRecord.job_id)
            .filter(
                DocumentRecord.id == draft_id,
                JobRecord.tenant_id == (_ctx.tenant.id if _ctx.tenant else None),
            )
            .first()
        )
        if not record:
            raise ValueError("Draft not found")
        path = document_path_for(record, extension)
    except ValueError as exc:
        raise NotFoundError(message=str(exc), resource=f"/trademarks/documents/{draft_id}.{extension}") from exc
    except Exception as e:
        raise SystemError(message=str(e), error_location=f"/trademarks/documents/{draft_id}.{extension}") from e

    media_type = {
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf": "application/pdf",
        "md": "text/markdown; charset=utf-8",
    }[extension]
    return FileResponse(Path(path), media_type=media_type, filename=Path(path).name)
