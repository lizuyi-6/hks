from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import FirmMember, ProviderLead, User
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.provider_crm import (
    claim_lead,
    client_profile,
    get_acquisition_funnel,
    list_leads,
    mark_lead_status,
    require_provider,
    roi_attribution,
    roi_report,
)

router = APIRouter(prefix="/provider-leads", tags=["provider-leads"])


@router.get("")
def my_leads(
    status: str | None = None,
    temperature: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        provider = require_provider(db, user)
    except ValueError:
        return []
    return list_leads(db, provider.id, status=status, temperature=temperature)


@router.post("/{lead_id}/view")
def view_lead(
    lead_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """律师查看线索详情 → 幂等写入 last_viewed_at，驱动 5 段漏斗'律师查看'阶段。"""
    try:
        provider = require_provider(db, user)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    lead = db.query(ProviderLead).filter(ProviderLead.id == lead_id).first()
    if not lead or lead.provider_id != provider.id:
        raise HTTPException(status_code=404, detail="线索不存在")
    now = datetime.now(timezone.utc)
    first_view = lead.last_viewed_at is None
    lead.last_viewed_at = now
    db.commit()
    return {
        "leadId": lead.id,
        "lastViewedAt": now.isoformat(),
        "firstView": first_view,
    }


@router.post("/{lead_id}/claim")
def claim(
    lead_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        provider = require_provider(db, user)
        lead = claim_lead(db, provider.id, lead_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    # 认领即视为查看过 —— 确保漏斗"律师查看"阶段不小于"线索认领"。
    if lead.last_viewed_at is None:
        lead.last_viewed_at = datetime.now(timezone.utc)
        db.commit()
    return {"status": lead.status, "claimedAt": lead.claimed_at.isoformat() if lead.claimed_at else None}


@router.post("/{lead_id}/status")
def update_status(
    lead_id: str,
    status: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        provider = require_provider(db, user)
        lead = mark_lead_status(db, provider.id, lead_id, status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": lead.status}


@router.get("/clients/{user_id}")
def client_detail(
    user_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        provider = require_provider(db, user)
        data = client_profile(db, provider.id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return data


@router.get("/roi")
def get_roi_report(
    days: int = 30,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        provider = require_provider(db, user)
    except ValueError:
        return {
            "windowDays": days,
            "leads": {"total": 0, "claimed": 0, "won": 0, "claimRate": 0, "winRate": 0},
            "orders": {"total": 0, "closed": 0, "revenue": 0},
            "byCategory": {},
            "ratingAvg": 0,
        }
    return roi_report(db, provider.id, days=days)


@router.post("/temperature-recompute")
def trigger_temperature_recompute(
    limit: int = 500,
    only_stale_hours: int | None = 6,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Ad-hoc trigger of the D5 lead-temperature daily batch.

    Provider-scoped: we only recompute leads assigned to the caller's
    provider. Useful for the workbench's "now 重算" button and for CI smoke
    tests that don't want to wait for the cron.
    """
    try:
        provider = require_provider(db, user)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e

    from apps.api.app.services.provider_crm import recompute_lead_temperature

    open_statuses = ["new", "claimed", "contacted", "quoted"]
    leads = (
        db.query(ProviderLead)
        .filter(
            ProviderLead.provider_id == provider.id,
            ProviderLead.status.in_(open_statuses),
        )
        .limit(limit)
        .all()
    )
    changed = 0
    skipped_fresh = 0
    now_ts = datetime.now(timezone.utc)
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
                        skipped_fresh += 1
                        continue
                except Exception:
                    pass
        prev = lead.temperature
        new_temp, _ = recompute_lead_temperature(db, lead, commit=False)
        temperature_counts[new_temp] = temperature_counts.get(new_temp, 0) + 1
        if new_temp != prev:
            changed += 1
    db.commit()
    return {
        "processed": len(leads),
        "temperatureChanged": changed,
        "staleSkipped": skipped_fresh,
        "byTemperature": temperature_counts,
    }


@router.get("/roi/attribution")
def get_roi_attribution(
    days: int = 30,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """ROI attribution breakdown (D2) — revenue split by intent / temperature
    / region / source / category, plus top clients."""
    try:
        provider = require_provider(db, user)
    except ValueError:
        return {
            "windowDays": days,
            "totals": {"orders": 0, "closed": 0, "revenue": 0, "avgDealSize": 0},
            "byIntent": {},
            "byTemperature": {},
            "byRegion": {},
            "bySource": {},
            "byCategory": {},
            "topClients": [],
            "scorecard": {},
        }
    return roi_attribution(db, provider.id, days=days)


@router.get("/funnel")
def get_funnel(
    window_days: int = 30,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """返回五段获客漏斗，用于律师端漏斗图 tab。"""
    try:
        provider = require_provider(db, user)
    except ValueError:
        return {
            "windowDays": window_days,
            "stages": [
                {"key": "distributed", "label": "匹配分发", "count": 0, "vsTotal": 0, "vsPrev": 0},
                {"key": "viewed", "label": "律师查看", "count": 0, "vsTotal": 0, "vsPrev": 0},
                {"key": "claimed", "label": "线索认领", "count": 0, "vsTotal": 0, "vsPrev": 0},
                {"key": "quoted", "label": "报价 / 签单", "count": 0, "vsTotal": 0, "vsPrev": 0},
                {"key": "won", "label": "成交", "count": 0, "vsTotal": 0, "vsPrev": 0},
            ],
            "temperatures": {},
            "intentBreakdown": {},
            "avgClaimMinutes": None,
            "revenueClosed": 0,
            "ordersClosed": 0,
        }
    return get_acquisition_funnel(db, provider.id, window_days=window_days)


# ---------------------------------------------------------------------------
# Firm members (律所多账号 + 组内分配)
# ---------------------------------------------------------------------------


def _member_to_dict(m: FirmMember) -> dict:
    return {
        "id": m.id,
        "providerId": m.provider_id,
        "userId": m.user_id,
        "displayName": m.display_name,
        "role": m.role,
        "specialties": m.specialties or [],
        "email": m.email,
        "avatarUrl": m.avatar_url,
        "activeLeads": m.active_leads,
        "closedLeads": m.closed_leads,
        "active": m.active,
        "createdAt": m.created_at.isoformat() if m.created_at else None,
    }


@router.get("/firm-members")
def list_firm_members(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        provider = require_provider(db, user)
    except ValueError:
        return []
    rows = (
        db.query(FirmMember)
        .filter(FirmMember.provider_id == provider.id)
        .order_by(FirmMember.active.desc(), FirmMember.created_at.asc())
        .all()
    )
    return [_member_to_dict(m) for m in rows]


class FirmMemberCreate(BaseModel):
    displayName: str
    role: str = "associate"
    email: str | None = None
    specialties: list[str] = []


@router.post("/firm-members")
def create_firm_member(
    body: FirmMemberCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        provider = require_provider(db, user)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    member = FirmMember(
        provider_id=provider.id,
        display_name=body.displayName,
        role=body.role,
        email=body.email,
        specialties=body.specialties or [],
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return _member_to_dict(member)


class AssignLeadBody(BaseModel):
    memberId: str | None


@router.post("/{lead_id}/assign")
def assign_lead(
    lead_id: str,
    body: AssignLeadBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        provider = require_provider(db, user)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    lead = db.query(ProviderLead).filter(ProviderLead.id == lead_id).first()
    if not lead or lead.provider_id != provider.id:
        raise HTTPException(status_code=404, detail="线索不存在")

    prev_assignee = lead.assignee_id
    if body.memberId:
        member = db.query(FirmMember).filter(FirmMember.id == body.memberId).first()
        if not member or member.provider_id != provider.id:
            raise HTTPException(status_code=400, detail="成员不存在或不属于本机构")
        lead.assignee_id = member.id
        lead.assigned_at = datetime.now(timezone.utc)
        if prev_assignee != member.id:
            member.active_leads = (member.active_leads or 0) + 1
            if prev_assignee:
                prev = db.query(FirmMember).filter(FirmMember.id == prev_assignee).first()
                if prev:
                    prev.active_leads = max(0, (prev.active_leads or 0) - 1)
    else:
        if prev_assignee:
            prev = db.query(FirmMember).filter(FirmMember.id == prev_assignee).first()
            if prev:
                prev.active_leads = max(0, (prev.active_leads or 0) - 1)
        lead.assignee_id = None
        lead.assigned_at = None

    db.commit()
    db.refresh(lead)
    return {
        "leadId": lead.id,
        "assigneeId": lead.assignee_id,
        "assignedAt": lead.assigned_at.isoformat() if lead.assigned_at else None,
    }
