from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.db.models import (
    DocumentRecord,
    IpAsset,
    JobRecord,
    ModuleResult,
    ReminderTask,
    User,
    WorkflowStep,
)
from apps.api.app.schemas.diagnosis import DiagnosisRequest
from apps.api.app.schemas.trademark import (
    ApplicationDraftRequest,
    ApplicationDraftResult,
)
from apps.api.app.services import event_types
from apps.api.app.services.event_bus import emit_event

logger = logging.getLogger(__name__)


def _save_module_result(db: Session, job: JobRecord, module_type: str, result_data: dict) -> None:
    from apps.api.app.db.models import ModuleResult
    mr = ModuleResult(
        user_id=job.payload.get("_user_id"),
        tenant_id=job.tenant_id,
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
        tenant_id=payload.get("_tenant_id"),
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        # Concurrent enqueue won the race; roll back and return the existing record.
        db.rollback()
        existing = (
            db.query(JobRecord)
            .filter(JobRecord.idempotency_key == idempotency_key)
            .first()
        )
        if existing:
            return existing
        raise
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


def _heartbeat(db: Session, job: JobRecord) -> None:
    """Bump the job's ``updated_at`` so the stale-processing reclaim loop
    doesn't mistake a long-running LLM call for a crashed worker.

    Called before and after each expensive adapter invocation inside
    ``process_job``. Failures are swallowed: a missed heartbeat is
    preferable to a failed job on a flaky DB connection.
    """
    try:
        job.updated_at = utcnow()
        db.commit()
    except Exception:  # pragma: no cover - best-effort
        logger.exception("job.heartbeat_failed job_id=%s", job.id)
        try:
            db.rollback()
        except Exception:
            pass


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
            _heartbeat(db, job)
            envelope = provider_registry.get("llm").diagnose(
                payload, knowledge.model_dump(), trace_id=job.id
            )
            _heartbeat(db, job)
            job.result = envelope.model_dump(mode="json", by_alias=True)

            # 诊断完成 → 发事件给场景推送规则 scenario.diagnosis_to_match
            diag_user_id = (job.payload or {}).get("_user_id")
            try:
                diag_payload = job.result or {}
                normalized = diag_payload.get("normalizedPayload") or diag_payload
                risks = normalized.get("risks", []) if isinstance(normalized, dict) else []
                emit_event(
                    db,
                    event_type=event_types.DIAGNOSIS_COMPLETED,
                    user_id=diag_user_id,
                    tenant_id=job.tenant_id,
                    source_entity_type="job",
                    source_entity_id=job.id,
                    payload={
                        "job_id": job.id,
                        "industry": payload.industry,
                        "stage": payload.stage,
                        "intent": "trademark",
                        "risk_count": len(risks) if isinstance(risks, list) else 0,
                    },
                    idempotent=True,
                )
            except Exception:
                logger.exception("emit diagnosis.completed failed for job %s", job.id)

            # 回写画像：把诊断 business_description 作为隐式需求更新用户标签
            if diag_user_id:
                try:
                    from apps.api.app.db.models import User
                    from apps.api.app.services.profile_engine import (
                        build_profile_fingerprint,
                    )

                    user = db.query(User).filter(User.id == diag_user_id).first()
                    if user:
                        raw_query = (
                            payload.business_description
                            or payload.business_name
                            or ""
                        )
                        if raw_query:
                            build_profile_fingerprint(
                                db, user, raw_query, persist=True
                            )
                except Exception:
                    logger.exception(
                        "profile fingerprint refresh failed after diagnosis job %s",
                        job.id,
                    )

        elif job.job_type == "trademark.application":
            payload = ApplicationDraftRequest.model_validate(job.payload)
            _heartbeat(db, job)
            summary = provider_registry.get("llm").summarize_application(
                payload, trace_id=job.id
            )
            _heartbeat(db, job)
            docx_path, pdf_path = provider_registry.get("documentRender").render_application(
                payload, summary.normalized_payload, trace_id=job.id
            )
            _heartbeat(db, job)
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
                tenant_id=job.tenant_id,
                owner_id=job.payload.get("_user_id"),
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

            # 高风险商标 → 发事件给场景推送规则 scenario.trademark_red_flag
            if (payload.risk_level or "").lower() == "red":
                try:
                    emit_event(
                        db,
                        event_type=event_types.TRADEMARK_RED_FLAG,
                        user_id=(job.payload or {}).get("_user_id"),
                        tenant_id=job.tenant_id,
                        source_entity_type="trademark",
                        source_entity_id=asset.id,
                        payload={
                            "asset_id": asset.id,
                            "trademark_name": payload.trademark_name,
                            "applicant_name": payload.applicant_name,
                            "categories": payload.categories,
                            "risk_level": payload.risk_level,
                        },
                        idempotent=True,
                    )
                except Exception:
                    logger.exception(
                        "emit trademark.red_flag failed for job %s", job.id
                    )

        elif job.job_type == "reminder.dispatch":
            payload = job.payload
            asset_id = payload.get("asset_id")
            asset = (
                db.query(IpAsset).filter(IpAsset.id == asset_id).first()
                if asset_id
                else None
            )
            owner_email: str | None = None
            if asset and asset.owner_id:
                owner = db.query(User).filter(User.id == asset.owner_id).first()
                if owner:
                    owner_email = owner.email
            if not owner_email:
                reminder = (
                    db.query(ReminderTask)
                    .filter(ReminderTask.job_id == job.id)
                    .first()
                )
                if reminder:
                    reminder.status = "failed"
                raise RuntimeError(
                    f"reminder.dispatch: asset {asset_id!r} has no owner email"
                )
            envelope = provider_registry.get("notification").send_email(
                to_email=owner_email,
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

        elif job.job_type == "lead.temperature_recompute":
            # D5 daily batch: re-score every not-yet-closed ProviderLead so
            # temperature signals stay fresh (recency/activity decay over
            # time even without user action).
            from apps.api.app.db.models import ProviderLead as _ProviderLead
            from apps.api.app.services.provider_crm import (
                recompute_lead_temperature as _recompute,
            )

            open_statuses = {"new", "claimed", "contacted", "quoted"}
            payload = job.payload or {}
            batch_limit = int(payload.get("limit", 500) or 500)
            only_stale_hours = payload.get("only_stale_hours")
            try:
                only_stale_hours = (
                    int(only_stale_hours) if only_stale_hours is not None else None
                )
            except (TypeError, ValueError):
                only_stale_hours = None

            q = db.query(_ProviderLead).filter(
                _ProviderLead.status.in_(list(open_statuses))
            )
            leads = q.limit(batch_limit).all()

            updated = 0
            unchanged = 0
            stale_skipped = 0
            now_ts = utcnow()
            temperature_counts: dict[str, int] = {}

            for lead in leads:
                if only_stale_hours is not None:
                    snap = lead.snapshot if isinstance(lead.snapshot, dict) else {}
                    ts_iso = ((snap.get("temperature_signals") or {}) or {}).get(
                        "updated_at"
                    )
                    if ts_iso:
                        try:
                            last = datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
                            if last.tzinfo is None:
                                last = last.replace(tzinfo=timezone.utc)
                            if (now_ts - last).total_seconds() < only_stale_hours * 3600:
                                stale_skipped += 1
                                continue
                        except Exception:
                            pass
                prev_temp = lead.temperature
                new_temp, _composite = _recompute(db, lead, commit=False)
                temperature_counts[new_temp] = temperature_counts.get(new_temp, 0) + 1
                if new_temp != prev_temp:
                    updated += 1
                else:
                    unchanged += 1

            db.commit()
            job.result = {
                "processed": len(leads),
                "temperatureChanged": updated,
                "unchanged": unchanged,
                "staleSkipped": stale_skipped,
                "byTemperature": temperature_counts,
            }

        elif job.job_type == "asset.expiry_check":
            now = utcnow()
            threshold = now + timedelta(days=90)
            expiring_assets = (
                db.query(IpAsset)
                .filter(
                    IpAsset.expires_at <= threshold,
                    IpAsset.expires_at >= now,
                )
                .all()
            )
            for asset in expiring_assets:
                days_left = (asset.expires_at - now).days
                emit_event(
                    db,
                    event_type=event_types.ASSET_EXPIRING_SOON,
                    user_id=asset.owner_id,
                    tenant_id=asset.tenant_id,
                    source_entity_type="asset",
                    source_entity_id=asset.id,
                    payload={
                        "asset_id": asset.id,
                        "asset_name": asset.name,
                        "days_until_expiry": days_left,
                    },
                )
            job.result = {"checked": len(expiring_assets)}

        else:
            raise ValueError(f"Unknown job type: {job.job_type}")

        job.status = "completed"
        job.error_message = None

        _user_id = (job.payload or {}).get("_user_id") if job.payload else None
        emit_event(
            db,
            event_type=event_types.JOB_COMPLETED,
            user_id=_user_id,
            tenant_id=job.tenant_id,
            source_entity_type="job",
            source_entity_id=job.id,
            payload={"job_type": job.job_type, "job_id": job.id},
        )

        result_dict = job.result or {}
        normalized = result_dict.get("normalizedPayload", result_dict)

        if job.job_type == "monitoring.scan":
            alerts = normalized.get("alerts", [])
            if alerts:
                emit_event(
                    db,
                    event_type=event_types.MONITORING_ALERT,
                    user_id=_user_id,
                    tenant_id=job.tenant_id,
                    source_entity_type="job",
                    source_entity_id=job.id,
                    payload={
                        "alert_count": len(alerts),
                        "high_count": sum(1 for a in alerts if a.get("severity") == "high"),
                        "job_id": job.id,
                    },
                )

        elif job.job_type == "competitor.track":
            emit_event(
                db,
                event_type=event_types.COMPETITOR_CHANGE,
                user_id=_user_id,
                tenant_id=job.tenant_id,
                source_entity_type="job",
                source_entity_id=job.id,
                payload={"job_id": job.id},
            )

        elif job.job_type == "policy.digest":
            policy_payload = job.result or {}
            policy_normalized = policy_payload.get("normalizedPayload") or policy_payload
            policies = (
                policy_normalized.get("policies", [])
                if isinstance(policy_normalized, dict)
                else []
            )
            high_impact_count = sum(
                1
                for p in policies
                if (p or {}).get("impact", "").lower() in ("high", "red", "critical")
                or (p or {}).get("severity") in ("high", "red", "critical")
            )
            emit_event(
                db,
                event_type=event_types.POLICY_DIGEST_READY,
                user_id=_user_id,
                tenant_id=job.tenant_id,
                source_entity_type="job",
                source_entity_id=job.id,
                payload={
                    "job_id": job.id,
                    "policy_count": len(policies) if isinstance(policies, list) else 0,
                    "impact_high": bool(high_impact_count),
                    "high_impact_count": high_impact_count,
                    "industry": (job.payload or {}).get("industry"),
                },
            )

        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "job.process.failed",
            extra={"job_id": job.id, "job_type": job.job_type, "attempt": job.attempts},
        )
        try:
            db.rollback()
        except Exception:
            pass
        job.error_message = str(exc)
        job.status = "dead_letter" if job.attempts >= job.max_attempts else "failed"

        _user_id = (job.payload or {}).get("_user_id") if job.payload else None
        emit_event(
            db,
            event_type=event_types.JOB_FAILED,
            user_id=_user_id,
            tenant_id=job.tenant_id,
            source_entity_type="job",
            source_entity_id=job.id,
            # Use only the exception class name to avoid leaking internal details
            payload={"job_type": job.job_type, "error": type(exc).__name__},
        )

        reminder = db.query(ReminderTask).filter(ReminderTask.job_id == job.id).first()
        if reminder:
            reminder.status = "dead_letter" if job.status == "dead_letter" else "failed"
        db.commit()
    finally:
        db.refresh(job)

    return job


def _stale_processing_timeout_seconds() -> int:
    """Resolved lazily so tests / env overrides take effect without reload."""
    try:
        from apps.api.app.core.config import settings

        return max(60, int(settings.worker_job_timeout_seconds))
    except Exception:
        return 900


def _reclaim_stale_processing(db: Session) -> None:
    """Reset jobs stuck in 'processing' beyond the timeout back to 'queued'.

    ``process_job`` now heartbeats ``updated_at`` around long LLM calls,
    so a job that's still actively running bumps past the cutoff and won't
    be reclaimed. That's what prevented the old 300s cutoff from racing
    with multi-minute diagnosis / trademark jobs and emitting duplicate
    ``DIAGNOSIS_COMPLETED`` events.
    """
    timeout_seconds = _stale_processing_timeout_seconds()
    stale_cutoff = utcnow() - timedelta(seconds=timeout_seconds)
    stale = (
        db.query(JobRecord)
        .filter(
            JobRecord.status == "processing",
            JobRecord.updated_at <= stale_cutoff,
        )
        .all()
    )
    for job in stale:
        logger.warning(
            "job.stale_processing_reclaimed",
            extra={
                "job_id": job.id,
                "job_type": job.job_type,
                "attempts": job.attempts,
                "max_attempts": job.max_attempts,
                "timeout_seconds": timeout_seconds,
            },
        )
        job.status = "queued"
    if stale:
        db.commit()


def process_due_jobs(db: Session) -> list[JobRecord]:
    _reclaim_stale_processing(db)

    try:
        # PostgreSQL supports SKIP LOCKED for single-flight job claiming.
        jobs = (
            db.query(JobRecord)
            .filter(JobRecord.status.in_(["queued", "failed"]))
            .filter(JobRecord.run_after <= utcnow())
            .order_by(JobRecord.created_at.asc())
            .with_for_update(skip_locked=True)
            .all()
        )
    except Exception:
        # Fallback for databases that don't support SKIP LOCKED (e.g. SQLite).
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
