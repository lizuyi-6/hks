from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.core.database import get_db
from apps.api.app.core.error_handler import BusinessError, SystemError
from apps.api.app.schemas.common import PlaceholderResponse
from apps.api.app.services.dependencies import TenantContext, get_current_tenant
from apps.api.app.services.jobs import enqueue_job, process_job

router = APIRouter(tags=["modules"])


@router.get("/monitoring/status", response_model=PlaceholderResponse)
def monitoring_status(_ctx: TenantContext = Depends(get_current_tenant)):
    available, reason = provider_registry.get("monitoring").availability()
    return PlaceholderResponse(
        module="monitoring",
        enabled=available,
        message=reason or "侵权监控模块已启用",
    )


@router.post("/monitoring/scan")
def monitoring_scan(body: dict, db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    try:
        payload = dict(body)
        payload["_user_id"] = ctx.user.id
        if ctx.tenant:
            payload["_tenant_id"] = ctx.tenant.id
        job = enqueue_job(db, "monitoring.scan", payload)
        process_job(db, job)
        db.refresh(job)
        if job.status == "failed":
            raise BusinessError(
                message=job.error_message or "监控扫描失败",
                context="/monitoring/scan",
                details={"job_id": job.id, "status": job.status}
            )
        return {"job_id": job.id, "status": job.status, "result": job.result}
    except BusinessError:
        raise
    except Exception as e:
        raise SystemError(message=str(e), error_location="/monitoring/scan") from e


@router.get("/competitors/status", response_model=PlaceholderResponse)
def competitors_status(_ctx: TenantContext = Depends(get_current_tenant)):
    available, reason = provider_registry.get("competitor").availability()
    return PlaceholderResponse(
        module="competitors",
        enabled=available,
        message=reason or "竞争对手追踪模块已启用",
    )


@router.post("/competitors/track")
def competitor_track(body: dict, db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    try:
        payload = dict(body)
        payload["_user_id"] = ctx.user.id
        if ctx.tenant:
            payload["_tenant_id"] = ctx.tenant.id
        job = enqueue_job(db, "competitor.track", payload)
        process_job(db, job)
        db.refresh(job)
        if job.status == "failed":
            raise BusinessError(
                message=job.error_message or "竞品追踪失败",
                context="/competitors/track",
                details={"job_id": job.id, "status": job.status}
            )
        return {"job_id": job.id, "status": job.status, "result": job.result}
    except BusinessError:
        raise
    except Exception as e:
        raise SystemError(message=str(e), error_location="/competitors/track") from e


@router.post("/competitors/compare")
def competitor_compare(body: dict, db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    try:
        payload = dict(body)
        payload["_user_id"] = ctx.user.id
        if ctx.tenant:
            payload["_tenant_id"] = ctx.tenant.id
        job = enqueue_job(db, "competitor.compare", payload)
        process_job(db, job)
        db.refresh(job)
        if job.status == "failed":
            raise BusinessError(
                message=job.error_message or "竞品对比失败",
                context="/competitors/compare",
                details={"job_id": job.id, "status": job.status}
            )
        return {"job_id": job.id, "status": job.status, "result": job.result}
    except BusinessError:
        raise
    except Exception as e:
        raise SystemError(message=str(e), error_location="/competitors/compare") from e


@router.get("/contracts/status", response_model=PlaceholderResponse)
def contracts_status(_ctx: TenantContext = Depends(get_current_tenant)):
    available, reason = provider_registry.get("contractReview").availability()
    return PlaceholderResponse(
        module="contracts",
        enabled=available,
        message=reason or "合同审查模块已启用",
    )


@router.post("/contracts/review")
def contract_review(body: dict, db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    try:
        payload = dict(body)
        payload["_user_id"] = ctx.user.id
        if ctx.tenant:
            payload["_tenant_id"] = ctx.tenant.id
        job = enqueue_job(db, "contract.review", payload)
        process_job(db, job)
        db.refresh(job)
        if job.status == "failed":
            raise BusinessError(
                message=job.error_message or "合同审查失败",
                context="/contracts/review",
                details={"job_id": job.id, "status": job.status}
            )
        return {"job_id": job.id, "status": job.status, "result": job.result}
    except BusinessError:
        raise
    except Exception as e:
        raise SystemError(message=str(e), error_location="/contracts/review") from e


@router.get("/patents/status", response_model=PlaceholderResponse)
def patents_status(_ctx: TenantContext = Depends(get_current_tenant)):
    available, reason = provider_registry.get("patentAssist").availability()
    return PlaceholderResponse(
        module="patents",
        enabled=available,
        message=reason or "专利/软著申请模块已启用",
    )


@router.post("/patents/assess")
def patent_assess(body: dict, db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    try:
        payload = dict(body)
        payload["_user_id"] = ctx.user.id
        if ctx.tenant:
            payload["_tenant_id"] = ctx.tenant.id
        job = enqueue_job(db, "patent.assess", payload)
        process_job(db, job)
        db.refresh(job)
        if job.status == "failed":
            raise BusinessError(
                message=job.error_message or "专利评估失败",
                context="/patents/assess",
                details={"job_id": job.id, "status": job.status}
            )
        return {"job_id": job.id, "status": job.status, "result": job.result}
    except BusinessError:
        raise
    except Exception as e:
        raise SystemError(message=str(e), error_location="/patents/assess") from e


@router.get("/policies/status", response_model=PlaceholderResponse)
def policies_status(_ctx: TenantContext = Depends(get_current_tenant)):
    available, reason = provider_registry.get("policyDigest").availability()
    return PlaceholderResponse(
        module="policies",
        enabled=available,
        message=reason or "行业政策模块已启用",
    )


@router.post("/policies/digest")
def policy_digest(body: dict, db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    try:
        payload = dict(body)
        payload["_user_id"] = ctx.user.id
        if ctx.tenant:
            payload["_tenant_id"] = ctx.tenant.id
        job = enqueue_job(db, "policy.digest", payload)
        process_job(db, job)
        db.refresh(job)
        if job.status == "failed":
            raise BusinessError(
                message=job.error_message or "政策摘要失败",
                context="/policies/digest",
                details={"job_id": job.id, "status": job.status}
            )
        return {"job_id": job.id, "status": job.status, "result": job.result}
    except BusinessError:
        raise
    except Exception as e:
        raise SystemError(message=str(e), error_location="/policies/digest") from e


@router.get("/due-diligence/status", response_model=PlaceholderResponse)
def due_diligence_status(_ctx: TenantContext = Depends(get_current_tenant)):
    available, reason = provider_registry.get("dueDiligence").availability()
    return PlaceholderResponse(
        module="due-diligence",
        enabled=available,
        message=reason or "融资尽调模块已启用",
    )


@router.post("/due-diligence/investigate")
def due_diligence_investigate(body: dict, db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    try:
        payload = dict(body)
        payload["_user_id"] = ctx.user.id
        if ctx.tenant:
            payload["_tenant_id"] = ctx.tenant.id
        job = enqueue_job(db, "due-diligence.investigate", payload)
        process_job(db, job)
        db.refresh(job)
        if job.status == "failed":
            raise BusinessError(
                message=job.error_message or "融资尽调失败",
                context="/due-diligence/investigate",
                details={"job_id": job.id, "status": job.status}
            )
        return {"job_id": job.id, "status": job.status, "result": job.result}
    except BusinessError:
        raise
    except Exception as e:
        raise SystemError(message=str(e), error_location="/due-diligence/investigate") from e
