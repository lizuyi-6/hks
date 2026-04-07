from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.db.models import DocumentRecord, IpAsset, JobRecord, ModuleResult, ReminderTask, WorkflowStep
from apps.api.app.schemas.diagnosis import DiagnosisRequest
from apps.api.app.schemas.trademark import (
    ApplicationDraftRequest,
    ApplicationDraftResult,
)


def _save_module_result(db: Session, job: JobRecord, module_type: str, result_data: dict) -> None:
    from apps.api.app.db.models import ModuleResult
    mr = ModuleResult(
        user_id=job.payload.get("_user_id"),
        module_type=module_type,
        job_id=job.id,
        result_data=result_data,
    )
    db.add(mr)
    db.flush()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def make_idempotency_key(job_type: str, payload: dict) -> str:
    serialized = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return f"{job_type}:{digest}"


def enqueue_job(
    db: Session, job_type: str, payload: dict, run_after: datetime | None = None
) -> JobRecord:
    idempotency_key = make_idempotency_key(job_type, payload)
    existing = (
        db.query(JobRecord).filter(JobRecord.idempotency_key == idempotency_key).first()
    )
    if existing:
        return existing

    job = JobRecord(
        job_type=job_type,
        payload=payload,
        run_after=run_after or utcnow(),
        idempotency_key=idempotency_key,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _schedule_asset_reminders(db: Session, asset: IpAsset) -> None:
    if not asset.expires_at:
        return

    offsets = [90, 60, 30, 7]
    for offset in offsets:
        due_at = asset.expires_at - timedelta(days=offset)
        reminder_job = enqueue_job(
            db,
            "reminder.dispatch",
            {"asset_id": asset.id, "offset_days": offset, "channel": "email"},
            run_after=due_at,
        )
        reminder = ReminderTask(
            asset_id=asset.id,
            job_id=reminder_job.id,
            channel="email",
            due_at=due_at,
            status=reminder_job.status,
        )
        db.add(reminder)
    db.commit()


def process_job(db: Session, job: JobRecord) -> JobRecord:
    if job.status in {"completed", "dead_letter"}:
        return job

    if job.status != "processing":
        job.status = "processing"
        job.attempts += 1
        db.commit()

    try:
        if job.job_type == "diagnosis.report":
            payload = DiagnosisRequest.model_validate(job.payload)
            knowledge = provider_registry.get("knowledgeBase").retrieve(
                "trademark", trace_id=job.id
            )
            envelope = provider_registry.get("llm").diagnose(
                payload, knowledge.model_dump(), trace_id=job.id
            )
            job.result = envelope.model_dump(mode="json", by_alias=True)

        elif job.job_type == "trademark.application":
            payload = ApplicationDraftRequest.model_validate(job.payload)
            summary = provider_registry.get("llm").summarize_application(
                payload, trace_id=job.id
            )
            docx_path, pdf_path = provider_registry.get("documentRender").render_application(
                payload, summary.normalized_payload, trace_id=job.id
            )
            record = DocumentRecord(
                job_id=job.id,
                docx_path=docx_path,
                pdf_path=pdf_path,
                document_metadata={
                    "trademark_name": payload.trademark_name,
                    "applicant_name": payload.applicant_name,
                    "categories": payload.categories,
                    "risk_level": payload.risk_level,
                },
            )
            db.add(record)
            db.flush()

            asset = IpAsset(
                name=payload.trademark_name,
                asset_type="trademark",
                registration_number=f"PENDING-{uuid4().hex[:8].upper()}",
                status="pending",
                expires_at=utcnow() + timedelta(days=3650),
                next_milestone="Awaiting official review",
                source_mode=provider_registry.mode_for("documentRender"),
            )
            db.add(asset)
            db.flush()
            _schedule_asset_reminders(db, asset)

            draft = ApplicationDraftResult(
                draft_id=record.id,
                trademark_name=payload.trademark_name,
                applicant_name=payload.applicant_name,
                categories=payload.categories,
                risk_level=payload.risk_level,
                source_mode=provider_registry.mode_for("documentRender"),
                provider=provider_registry.get("documentRender").provider_name,
                document_labels=[
                    "Application Form",
                    "Category Advice",
                    "Risk Notes",
                    "Submission Guide",
                ],
                download_endpoints={
                    "docx": f"/trademarks/documents/{record.id}.docx",
                    "pdf": f"/trademarks/documents/{record.id}.pdf",
                },
            )
            job.result = draft.model_dump(mode="json", by_alias=True)

        elif job.job_type == "reminder.dispatch":
            payload = job.payload
            envelope = provider_registry.get("notification").send_email(
                to_email="demo@a1plus.local",
                subject=f"Asset reminder: {payload['offset_days']} days",
                body=(
                    f"Asset {payload['asset_id']} will reach its milestone in "
                    f"{payload['offset_days']} days."
                ),
                trace_id=job.id,
            )
            job.result = envelope.model_dump(mode="json", by_alias=True)
            reminder = db.query(ReminderTask).filter(ReminderTask.job_id == job.id).first()
            if reminder:
                reminder.status = "sent"

        elif job.job_type == "monitoring.scan":
            provider = provider_registry.get("monitoring")
            result = provider.scan(job.payload.get("query", ""), trace_id=job.id)
            result_dict = result.model_dump(mode="json", by_alias=True) if hasattr(result, "model_dump") else result
            job.result = result_dict
            _save_module_result(db, job, "monitoring", result_dict)

        elif job.job_type == "competitor.track":
            provider = provider_registry.get("competitor")
            result = provider.track(job.payload.get("company_name", ""), trace_id=job.id)
            result_dict = result.model_dump(mode="json", by_alias=True) if hasattr(result, "model_dump") else result
            job.result = result_dict
            _save_module_result(db, job, "competitor", result_dict)

        elif job.job_type == "competitor.compare":
            provider = provider_registry.get("competitor")
            result = provider.compare(job.payload.get("companies", []), trace_id=job.id)
            result_dict = result.model_dump(mode="json", by_alias=True) if hasattr(result, "model_dump") else result
            job.result = result_dict
            _save_module_result(db, job, "competitor", result_dict)

        elif job.job_type == "contract.review":
            provider = provider_registry.get("contractReview")
            result = provider.review(job.payload.get("contract_text", ""), trace_id=job.id)
            result_dict = result.model_dump(mode="json", by_alias=True) if hasattr(result, "model_dump") else result
            job.result = result_dict
            _save_module_result(db, job, "contract", result_dict)

        elif job.job_type == "patent.assess":
            provider = provider_registry.get("patentAssist")
            result = provider.assess(job.payload.get("description", ""), trace_id=job.id)
            result_dict = result.model_dump(mode="json", by_alias=True) if hasattr(result, "model_dump") else result
            job.result = result_dict
            _save_module_result(db, job, "patent", result_dict)

        elif job.job_type == "policy.digest":
            provider = provider_registry.get("policyDigest")
            result = provider.digest(job.payload.get("industry", ""), trace_id=job.id)
            result_dict = result.model_dump(mode="json", by_alias=True) if hasattr(result, "model_dump") else result
            job.result = result_dict
            _save_module_result(db, job, "policy", result_dict)

        elif job.job_type == "due-diligence.investigate":
            provider = provider_registry.get("dueDiligence")
            result = provider.investigate(job.payload.get("company_name", ""), trace_id=job.id)
            result_dict = result.model_dump(mode="json", by_alias=True) if hasattr(result, "model_dump") else result
            job.result = result_dict
            _save_module_result(db, job, "due-diligence", result_dict)

        else:
            raise ValueError(f"Unknown job type: {job.job_type}")

        job.status = "completed"
        job.error_message = None
        db.commit()
    except Exception as exc:  # noqa: BLE001
        job.error_message = str(exc)
        job.status = "dead_letter" if job.attempts >= job.max_attempts else "failed"
        reminder = db.query(ReminderTask).filter(ReminderTask.job_id == job.id).first()
        if reminder:
            reminder.status = "dead_letter" if job.status == "dead_letter" else "failed"
        db.commit()
    finally:
        db.refresh(job)

    return job


def process_due_jobs(db: Session) -> list[JobRecord]:
    jobs = (
        db.query(JobRecord)
        .filter(JobRecord.status.in_(["queued", "failed"]))
        .filter(JobRecord.run_after <= utcnow())
        .order_by(JobRecord.created_at.asc())
        .all()
    )
    return [process_job(db, job) for job in jobs]


def get_job_or_error(db: Session, job_id: str) -> JobRecord:
    job = db.query(JobRecord).filter(JobRecord.id == job_id).first()
    if not job:
        raise ValueError("Job not found")
    return job


def rerun_job(db: Session, identifier: str) -> JobRecord:
    job = db.query(JobRecord).filter(JobRecord.id == identifier).first()
    if not job:
        reminder = db.query(ReminderTask).filter(ReminderTask.id == identifier).first()
        if not reminder or not reminder.job_id:
            raise ValueError("Job not found")
        job = db.query(JobRecord).filter(JobRecord.id == reminder.job_id).first()
        if not job:
            raise ValueError("Job not found")
        reminder.status = "queued"

    job.status = "queued"
    job.error_message = None
    job.run_after = utcnow()
    db.commit()
    db.refresh(job)
    return job


def get_document_record(db: Session, draft_id: str) -> DocumentRecord:
    record = db.query(DocumentRecord).filter(DocumentRecord.id == draft_id).first()
    if not record:
        raise ValueError("Draft not found")
    return record


def build_submission_bundle(db: Session, draft_id: str) -> dict:
    record = get_document_record(db, draft_id)
    guide = provider_registry.get("submissionGuide").guide(draft_id, trace_id=draft_id)
    draft = ApplicationDraftResult(
        draft_id=record.id,
        trademark_name=record.document_metadata["trademark_name"],
        applicant_name=record.document_metadata["applicant_name"],
        categories=record.document_metadata["categories"],
        risk_level=record.document_metadata["risk_level"],
        source_mode=provider_registry.mode_for("documentRender"),
        provider=provider_registry.get("documentRender").provider_name,
        document_labels=[
            "Application Form",
            "Category Advice",
            "Risk Notes",
            "Submission Guide",
        ],
        download_endpoints={
            "docx": f"/trademarks/documents/{record.id}.docx",
            "pdf": f"/trademarks/documents/{record.id}.pdf",
        },
    )
    return {
        "mode": guide.mode,
        "provider": guide.provider,
        "traceId": guide.trace_id,
        "retrievedAt": guide.retrieved_at,
        "sourceRefs": [ref.model_dump(by_alias=True) for ref in guide.source_refs],
        "disclaimer": guide.disclaimer,
        "normalizedPayload": {
            "draft": draft.model_dump(mode="json", by_alias=True),
            "guide": guide.normalized_payload.model_dump(mode="json", by_alias=True),
        },
    }


def document_path_for(record: DocumentRecord, extension: str) -> Path:
    path = Path(record.docx_path if extension == "docx" else record.pdf_path)
    if not path.exists():
        raise ValueError("Document not found")
    return path
