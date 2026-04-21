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
    action_config: dict | None = None


class CreateRuleRequest(BaseModel):
    ruleKey: str
    triggerType: str
    triggerConfig: dict
    actionType: str
    actionConfig: dict = {}
    conditionExpr: str | None = None
    description: str | None = None
    enabled: bool = True


@router.post("/rules")
def create_rule(
    body: CreateRuleRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    rule = AutomationRule(
        tenant_id=ctx.tenant.id if ctx.tenant else None,
        user_id=ctx.user.id,
        rule_key=body.ruleKey,
        trigger_type=body.triggerType,
        trigger_config=body.triggerConfig,
        action_type=body.actionType,
        action_config=body.actionConfig,
        condition_expr=body.conditionExpr,
        description=body.description,
        enabled=body.enabled,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_to_dict(rule)


@router.get("/event-types")
def list_event_types():
    """Expose the well-known event types a rule can subscribe to, plus a
    short human label. Used by the "new rule" wizard on the push-center.
    """
    return [
        {"eventType": "diagnosis.completed", "label": "诊断完成", "category": "workflow"},
        {"eventType": "trademark.red_flag", "label": "商标查重命中红灯", "category": "workflow"},
        {"eventType": "monitoring.alert", "label": "侵权监控告警", "category": "monitoring"},
        {"eventType": "competitor.change", "label": "竞品商标变化", "category": "competitor"},
        {"eventType": "policy.digest_ready", "label": "政策雷达出刊", "category": "policy"},
        {"eventType": "asset.expiring_soon", "label": "资产即将到期", "category": "reminder"},
        {"eventType": "compliance.audit_completed", "label": "合规体检完成", "category": "system"},
        {"eventType": "provider.lead_created", "label": "律所收到新线索", "category": "system"},
        {"eventType": "litigation.predicted", "label": "诉讼预测完成", "category": "workflow"},
        {"eventType": "job.completed", "label": "任务完成", "category": "system"},
        {"eventType": "workflow.step_completed", "label": "工作流节点完成", "category": "workflow"},
    ]


@router.get("/templates")
def list_templates():
    """Return the built-in scenario push templates for the management UI."""
    from apps.api.app.services.automation_engine import BUILTIN_RULES
    scenarios = [r for r in BUILTIN_RULES if r.get("action_type") == "create_scenario_push"]
    return [{
        "ruleKey": r["rule_key"],
        "triggerType": r["trigger_type"],
        "triggerConfig": r["trigger_config"],
        "conditionExpr": r.get("condition_expr"),
        "actionConfig": r["action_config"],
        "description": r["description"],
    } for r in scenarios]


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
    if body.action_config is not None:
        rule.action_config = body.action_config
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


@router.get("/timeline")
def push_timeline(
    limit: int = 50,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    """返回最近触发过场景推送的通知时间线，用于"场景推送中心"可视化。"""
    from apps.api.app.db.models import Notification

    q = (
        db.query(Notification)
        .filter(Notification.user_id == ctx.user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    rows = q.all()
    return [
        {
            "id": n.id,
            "category": n.category,
            "priority": n.priority,
            "title": n.title,
            "body": n.body,
            "actionUrl": n.action_url,
            "actionLabel": n.action_label,
            "createdAt": n.created_at.isoformat(),
        }
        for n in rows
    ]
