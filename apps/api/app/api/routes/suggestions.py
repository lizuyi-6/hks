from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.services.dependencies import TenantContext, get_current_tenant
from apps.api.app.services.workflow_engine import get_suggestions

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


@router.get("")
def list_suggestions(db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    return get_suggestions(db, tenant_id=ctx.tenant.id if ctx.tenant else None, user_id=ctx.user.id)
