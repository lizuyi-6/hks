from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import ReminderTask
from apps.api.app.schemas.assets import ReminderResponse
from apps.api.app.services.dependencies import get_current_user


router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("", response_model=list[ReminderResponse])
def list_reminders(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    tasks = db.query(ReminderTask).order_by(ReminderTask.due_at.asc()).all()
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

