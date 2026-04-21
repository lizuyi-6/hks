from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import IpAsset, ReminderTask
from apps.api.app.schemas.assets import ReminderResponse
from apps.api.app.services.dependencies import TenantContext, get_current_tenant


router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("", response_model=list[ReminderResponse])
def list_reminders(db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    q = db.query(ReminderTask)
    if ctx.tenant:
        q = q.join(IpAsset).filter(IpAsset.tenant_id == ctx.tenant.id)
    tasks = q.order_by(ReminderTask.due_at.asc()).all()
    return [
        ReminderResponse(
            id=task.id,
            asset_id=task.asset_id,
            channel=task.channel,
            due_at=task.due_at,
            status=task.status,
        )
        for task in tasks
    ]
