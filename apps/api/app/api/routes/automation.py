from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.core.error_handler import NotFoundError
from apps.api.app.db.models import AutomationRule
from apps.api.app.services.dependencies import TenantContext, get_current_tenant

router = APIRouter(prefix="/automation", tags=["automation"])


def _rule_to_dict(r: AutomationRule) -> dict:
    return {
        "id": r.id,
        "ruleKey": r.rule_key,
        "enabled": r.enabled,
        "triggerType": r.trigger_type,
        "triggerConfig": r.trigger_config,
        "actionType": r.action_type,
        "actionConfig": r.action_config,
        "description": r.description,
        "lastFiredAt": r.last_fired_at.isoformat() if r.last_fired_at else None,
        "createdAt": r.created_at.isoformat(),
    }


@router.get("/rules")
def list_rules(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    tenant_id = ctx.tenant.id if ctx.tenant else None
    q = db.query(AutomationRule)
    if tenant_id:
        q = q.filter(
            (AutomationRule.tenant_id == tenant_id)
            | (AutomationRule.tenant_id.is_(None))
        )
    rules = q.all()
    return [_rule_to_dict(r) for r in rules]


@router.get("/rules/{rule_id}")
def get_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    rule = db.query(AutomationRule).filter(AutomationRule.id == rule_id).first()
    if not rule:
        raise NotFoundError(f"Rule {rule_id} not found")
    return _rule_to_dict(rule)


class UpdateRuleRequest(BaseModel):
    enabled: bool | None = None
    condition_expr: str | None = None


@router.put("/rules/{rule_id}")
def update_rule(
    rule_id: str,
    body: UpdateRuleRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    rule = db.query(AutomationRule).filter(AutomationRule.id == rule_id).first()
    if not rule:
        raise NotFoundError(f"Rule {rule_id} not found")
    if body.enabled is not None:
        rule.enabled = body.enabled
    if body.condition_expr is not None:
        rule.condition_expr = body.condition_expr
    db.commit()
    return _rule_to_dict(rule)


@router.post("/rules/{rule_id}/fire")
def fire_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    from apps.api.app.services.automation_engine import execute_action

    rule = db.query(AutomationRule).filter(AutomationRule.id == rule_id).first()
    if not rule:
        raise NotFoundError(f"Rule {rule_id} not found")
    execute_action(db, rule, triggering_event=None, context_user_id=ctx.user.id)
    return {"fired": True, "rule_key": rule.rule_key}
