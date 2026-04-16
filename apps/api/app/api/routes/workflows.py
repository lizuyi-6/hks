from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.services.dependencies import TenantContext, get_current_tenant
from apps.api.app.services.workflow_engine import (
    advance_workflow,
    create_workflow,
    get_user_workflows,
    get_workflow_detail,
)

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _workflow_to_dict(instance) -> dict:
    return {
        "id": instance.id,
        "user_id": instance.user_id,
        "workflow_type": instance.workflow_type,
        "status": instance.status,
        "context": instance.context,
        "current_step_index": instance.current_step_index,
        "created_at": instance.created_at.isoformat() if instance.created_at else None,
        "updated_at": instance.updated_at.isoformat() if instance.updated_at else None,
        "steps": [
            {
                "id": s.id,
                "step_type": s.step_type,
                "step_index": s.step_index,
                "status": s.status,
                "job_id": s.job_id,
                "input_data": s.input_data,
                "output_data": s.output_data,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in sorted(instance.steps, key=lambda s: s.step_index)
        ],
    }


@router.post("")
def create(body: dict, db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    workflow_type = body.get("workflow_type")
    if not workflow_type:
        raise HTTPException(status_code=400, detail="workflow_type is required")

    try:
        instance = create_workflow(
            db,
            user_id=ctx.user.id,
            workflow_type=workflow_type,
            initial_context=body.get("initial_context"),
            tenant_id=ctx.tenant.id if ctx.tenant else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _workflow_to_dict(instance)


@router.get("")
def list_workflows(
    status: str | None = None,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    instances = get_user_workflows(
        db,
        tenant_id=ctx.tenant.id if ctx.tenant else None,
        user_id=ctx.user.id,
        status=status,
    )
    return [_workflow_to_dict(i) for i in instances]


@router.get("/{workflow_id}")
def get_detail(workflow_id: str, db: Session = Depends(get_db), ctx: TenantContext = Depends(get_current_tenant)):
    try:
        instance = get_workflow_detail(db, workflow_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if ctx.tenant and instance.tenant_id != ctx.tenant.id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return _workflow_to_dict(instance)


@router.post("/{workflow_id}/advance")
def advance(
    workflow_id: str,
    body: dict,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    try:
        instance = get_workflow_detail(db, workflow_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if ctx.tenant and instance.tenant_id != ctx.tenant.id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    try:
        instance = advance_workflow(db, workflow_id, step_output=body.get("step_output"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _workflow_to_dict(instance)
