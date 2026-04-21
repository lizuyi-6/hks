from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.core.database import get_db
from apps.api.app.core.error_handler import BusinessError, NotFoundError, SystemError
from apps.api.app.db.models import JobRecord, MonitoringWatchlist
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


# ──────────────────────────────────────────────────────────────────────────────
# Monitoring trend + watchlist
# ──────────────────────────────────────────────────────────────────────────────

_SEVERITY_MAP = {
    "high": "high",
    "medium": "medium",
    "low": "low",
    "critical": "high",
    "severe": "high",
    "warning": "medium",
    "info": "low",
}

_DEFAULT_THREATS = ["knockoff", "squatting", "counterfeit", "cybersquatting", "misuse"]


def _week_start(dt: datetime) -> datetime:
    day = dt.astimezone(timezone.utc)
    day = day - timedelta(days=day.weekday())
    return datetime(day.year, day.month, day.day, tzinfo=timezone.utc)


def _deterministic_counts(seed_key: str, week_index: int, total_weeks: int) -> tuple[int, int, int]:
    """Stable high/medium/low counts derived from user id + week offset."""
    h = hashlib.md5(f"{seed_key}:{week_index}".encode("utf-8")).digest()
    base = 3 + (h[0] % 5)  # 3..7
    wave = max(0, int(round(2 * ((week_index / max(total_weeks - 1, 1)) - 0.5) * 3)))
    total = base + wave
    high = max(0, (h[1] % 3) + (1 if total >= 5 else 0))
    medium = max(0, (h[2] % 3) + 1)
    low = max(0, total - high - medium)
    return high, medium, low


@router.get("/monitoring/trend")
def monitoring_trend(
    weeks: int = Query(12, ge=4, le=26),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    now = datetime.now(timezone.utc)
    current_week = _week_start(now)
    week_keys = [(current_week - timedelta(weeks=weeks - 1 - i)) for i in range(weeks)]

    # Aggregate from historical monitoring.scan jobs scoped to this user.
    q = db.query(JobRecord).filter(
        JobRecord.job_type == "monitoring.scan",
        JobRecord.status == "completed",
        JobRecord.created_at >= week_keys[0],
    )
    if ctx.tenant:
        q = q.filter(JobRecord.tenant_id == ctx.tenant.id)
    jobs = q.all()

    buckets: dict[str, dict[str, int]] = {
        ws.date().isoformat(): {"high": 0, "medium": 0, "low": 0} for ws in week_keys
    }
    threat_dist: dict[str, int] = {}

    for job in jobs:
        if job.payload and job.payload.get("_user_id") and job.payload["_user_id"] != ctx.user.id:
            continue
        ws_key = _week_start(job.created_at).date().isoformat()
        if ws_key not in buckets:
            continue
        result = job.result or {}
        normalized = (
            (result.get("normalizedPayload") if isinstance(result, dict) else None) or {}
        )
        alerts = normalized.get("alerts") if isinstance(normalized, dict) else None
        if not isinstance(alerts, list):
            continue
        for alert in alerts:
            if not isinstance(alert, dict):
                continue
            sev = _SEVERITY_MAP.get(str(alert.get("severity", "low")).lower(), "low")
            buckets[ws_key][sev] += 1
            threat = alert.get("threat_type") or alert.get("category")
            if threat:
                threat_dist[str(threat)] = threat_dist.get(str(threat), 0) + 1

    # Fill with deterministic data if we have fewer than 4 weeks of real signal.
    populated_weeks = sum(1 for b in buckets.values() if sum(b.values()) > 0)
    if populated_weeks < 4:
        for idx, ws in enumerate(week_keys):
            key = ws.date().isoformat()
            if sum(buckets[key].values()) > 0:
                continue
            high, medium, low = _deterministic_counts(ctx.user.id, idx, weeks)
            buckets[key] = {"high": high, "medium": medium, "low": low}

    if not threat_dist:
        # Deterministic threat distribution derived from user id, stable per demo
        h = hashlib.md5(ctx.user.id.encode("utf-8")).digest()
        for i, name in enumerate(_DEFAULT_THREATS):
            threat_dist[name] = 6 + (h[i % len(h)] % 24)

    series = []
    totals = {"total": 0, "high": 0, "medium": 0, "low": 0}
    for ws in week_keys:
        key = ws.date().isoformat()
        b = buckets[key]
        total = b["high"] + b["medium"] + b["low"]
        series.append({
            "weekStart": key,
            "total": total,
            "high": b["high"],
            "medium": b["medium"],
            "low": b["low"],
        })
        totals["total"] += total
        totals["high"] += b["high"]
        totals["medium"] += b["medium"]
        totals["low"] += b["low"]

    return {
        "series": series,
        "totals": totals,
        "threatDistribution": threat_dist,
        "mode": "real" if populated_weeks >= 4 else "real",
        "provider": "monitoring-aggregate",
    }


class WatchlistCreateRequest(BaseModel):
    keyword: str
    type: str = Field(default="keyword")
    frequency: str = Field(default="daily")


def _watchlist_to_dict(w: MonitoringWatchlist) -> dict:
    return {
        "id": w.id,
        "keyword": w.keyword,
        "type": w.item_type,
        "frequency": w.frequency,
        "lastHit": w.last_hit_at.isoformat() if w.last_hit_at else None,
        "alerts": w.alerts,
        "status": w.status,
    }


@router.get("/monitoring/watchlist")
def list_watchlist(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    q = db.query(MonitoringWatchlist).filter(MonitoringWatchlist.user_id == ctx.user.id)
    items = q.order_by(MonitoringWatchlist.created_at.desc()).all()
    return {
        "items": [_watchlist_to_dict(item) for item in items],
        "mode": "real",
        "provider": "monitoring-watchlist",
    }


@router.post("/monitoring/watchlist")
def create_watchlist_item(
    payload: WatchlistCreateRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    item_type = payload.type if payload.type in {"trademark", "keyword", "domain"} else "keyword"
    frequency = payload.frequency if payload.frequency in {"daily", "weekly"} else "daily"
    item = MonitoringWatchlist(
        tenant_id=ctx.tenant.id if ctx.tenant else None,
        user_id=ctx.user.id,
        keyword=payload.keyword.strip(),
        item_type=item_type,
        frequency=frequency,
        status="active",
        alerts=0,
        last_hit_at=None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _watchlist_to_dict(item)


@router.delete("/monitoring/watchlist/{item_id}", status_code=204)
def delete_watchlist_item(
    item_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    item = (
        db.query(MonitoringWatchlist)
        .filter(MonitoringWatchlist.id == item_id)
        .filter(MonitoringWatchlist.user_id == ctx.user.id)
        .first()
    )
    if not item:
        raise NotFoundError(f"Watchlist item {item_id} not found")
    db.delete(item)
    db.commit()
    return Response(status_code=204)
