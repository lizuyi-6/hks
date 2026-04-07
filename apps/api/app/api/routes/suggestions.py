from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.workflow_engine import get_suggestions

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


@router.get("")
def list_suggestions(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return get_suggestions(db, user_id=user.id)
