import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import IpAsset, ReminderTask
from apps.api.app.schemas.assets import AssetCreateRequest, AssetResponse
from apps.api.app.services.dependencies import TenantContext, get_current_tenant
from apps.api.app.services.jobs import _schedule_asset_reminders


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assets", tags=["assets"])


def _scope_assets_to_ctx(query, ctx: TenantContext):
    """Restrict an ``IpAsset`` query to rows visible to the current context.

    We include rows whose ``tenant_id`` matches the current tenant **and** any
    legacy rows (``tenant_id IS NULL``) that are still owned by the requesting
    user. Without this fallback, assets seeded before tenants existed are
    invisible through the UI but continue to appear in reports, giving the
    impression that "增删都不生效".
    """
    user_id = ctx.user.id if ctx.user else None
    if ctx.tenant and user_id:
        return query.filter(
            or_(
                IpAsset.tenant_id == ctx.tenant.id,
                (IpAsset.tenant_id.is_(None)) & (IpAsset.owner_id == user_id),
            )
        )
    if ctx.tenant:
        return query.filter(IpAsset.tenant_id == ctx.tenant.id)
    if user_id:
        return query.filter(IpAsset.owner_id == user_id)
    return query


@router.get("", response_model=list[AssetResponse])
def list_assets(db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    q = _scope_assets_to_ctx(db.query(IpAsset), ctx)
    assets = q.order_by(IpAsset.created_at.desc()).all()
    return [
        AssetResponse(
            id=asset.id,
            name=asset.name,
            type=asset.asset_type,
            registration_number=asset.registration_number,
            status=asset.status,
            expires_at=asset.expires_at,
            next_milestone=asset.next_milestone,
            source_mode=asset.source_mode,
        )
        for asset in assets
    ]


@router.post("", response_model=AssetResponse)
def create_asset(
    payload: AssetCreateRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    expires_at = (
        datetime.fromisoformat(payload.expires_at).replace(tzinfo=timezone.utc)
        if payload.expires_at
        else None
    )
    asset = IpAsset(
        tenant_id=ctx.tenant.id if ctx.tenant else None,
        owner_id=ctx.user.id,
        name=payload.name,
        asset_type=payload.type,
        registration_number=payload.registration_number,
        status="active",
        expires_at=expires_at,
        next_milestone="手动创建",
        source_mode="real",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    # Reminder scheduling is best-effort: the asset row has already been
    # committed so a secondary failure here must not surface as a 500, or the
    # UI will believe the create failed and refresh into a stale view.
    try:
        _schedule_asset_reminders(db, asset)
    except Exception:
        logger.exception("schedule_asset_reminders failed for asset %s", asset.id)
        db.rollback()
    return AssetResponse(
        id=asset.id,
        name=asset.name,
        type=asset.asset_type,
        registration_number=asset.registration_number,
        status=asset.status,
        expires_at=asset.expires_at,
        next_milestone=asset.next_milestone,
        source_mode=asset.source_mode,
    )


@router.get("/expiry-forecast")
def expiry_forecast(
    months: int = Query(12, ge=1, le=24),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    """Monthly bucket counts of asset expirations in the next N months."""
    now = datetime.now(timezone.utc)
    base_year, base_month = now.year, now.month

    buckets: list[dict] = []
    for i in range(months):
        m = base_month + i
        y = base_year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        buckets.append({
            "label": f"{m}月",
            "month": f"{y:04d}-{m:02d}",
            "count": 0,
        })

    q = _scope_assets_to_ctx(db.query(IpAsset).filter(IpAsset.expires_at.isnot(None)), ctx)

    for asset in q.all():
        if asset.expires_at is None:
            continue
        delta = (asset.expires_at.year - base_year) * 12 + (asset.expires_at.month - base_month)
        if 0 <= delta < months:
            buckets[delta]["count"] += 1

    return {"months": months, "data": buckets}


@router.delete("/{asset_id}")
def delete_asset(
    asset_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    q = _scope_assets_to_ctx(db.query(IpAsset).filter(IpAsset.id == asset_id), ctx)
    asset = q.first()
    if not asset:
        raise HTTPException(status_code=404, detail="资产不存在")

    db.query(ReminderTask).filter(ReminderTask.asset_id == asset_id).delete()
    db.delete(asset)
    db.commit()
    return {"ok": True}
