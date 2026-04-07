from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import IpAsset, ReminderTask
from apps.api.app.schemas.assets import AssetCreateRequest, AssetResponse
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.jobs import _schedule_asset_reminders


router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("", response_model=list[AssetResponse])
def list_assets(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    assets = db.query(IpAsset).order_by(IpAsset.created_at.desc()).all()
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
    _user=Depends(get_current_user),
):
    expires_at = (
        datetime.fromisoformat(payload.expires_at).replace(tzinfo=timezone.utc)
        if payload.expires_at
        else None
    )
    asset = IpAsset(
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
    _schedule_asset_reminders(db, asset)
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


@router.delete("/{asset_id}")
def delete_asset(
    asset_id: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    asset = db.query(IpAsset).filter(IpAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="资产不存在")

    db.query(ReminderTask).filter(ReminderTask.asset_id == asset_id).delete()
    db.delete(asset)
    db.commit()
    return {"ok": True}

