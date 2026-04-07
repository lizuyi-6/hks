from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.db.models import ModuleResult
from apps.api.app.services.dependencies import get_current_user

router = APIRouter(prefix="/module-results", tags=["module-results"])


def _to_dict(result: ModuleResult) -> dict:
    return {
        "id": result.id,
        "user_id": result.user_id,
        "workflow_id": result.workflow_id,
        "module_type": result.module_type,
        "job_id": result.job_id,
        "result_data": result.result_data,
        "created_at": result.created_at.isoformat() if result.created_at else None,
    }


@router.get("")
def list_module_results(
    module_type: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    query = db.query(ModuleResult).filter(ModuleResult.user_id == user.id)
    if module_type:
        query = query.filter(ModuleResult.module_type == module_type)
    results = query.order_by(ModuleResult.created_at.desc()).limit(50).all()
    return [_to_dict(r) for r in results]
