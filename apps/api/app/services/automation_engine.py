"""Declarative automation rules engine.

trigger_type="cron"  → fired by CronScheduler on schedule
trigger_type="event" → fired by event_processor on matching events

action_type options:
  "enqueue_job"         → enqueue a job via action_config["job_type"]
  "advance_workflow"    → try to auto-advance the related workflow
  "create_notification" → create an in-app notification
  "emit_notification"   → create notification + send email
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from sqlalchemy.orm import Session

from apps.api.app.db.models import AutomationRule, SystemEvent

logger = logging.getLogger(__name__)

BUILTIN_RULES: list[dict[str, Any]] = [
    {
        "rule_key": "sys.weekly_asset_scan",
        "trigger_type": "cron",
        "trigger_config": {"cron": "0 9 * * 1"},
        "condition_expr": None,
        "action_type": "enqueue_job",
        "action_config": {"job_type": "monitoring.scan", "payload_template": {}},
        "description": "每周一自动扫描全部已登记资产的侵权情况",
    },
    {
        "rule_key": "sys.daily_expiry_check",
        "trigger_type": "cron",
        "trigger_config": {"cron": "0 8 * * *"},
        "condition_expr": None,
        "action_type": "enqueue_job",
        "action_config": {"job_type": "asset.expiry_check", "payload_template": {}},
        "description": "每日检查 IP 资产到期情况",
    },
    {
        "rule_key": "sys.workflow_auto_advance",
        "trigger_type": "event",
        "trigger_config": {"event_type": "job.completed"},
        "condition_expr": (
            "event.payload.get('job_type') in "
            "['diagnosis.report', 'trademark.check', 'trademark.application']"
        ),
        "action_type": "advance_workflow",
        "action_config": {},
        "description": "诊断/商标类 Job 完成后自动推进工作流",
    },
    {
        "rule_key": "sys.monitoring_alert_notify",
        "trigger_type": "event",
        "trigger_config": {"event_type": "monitoring.alert"},
        "condition_expr": None,
        "action_type": "create_notification",
        "action_config": {"priority": "high", "category": "monitoring"},
        "description": "侵权监控告警 → 站内通知",
    },
    {
        "rule_key": "sys.competitor_change_notify",
        "trigger_type": "event",
        "trigger_config": {"event_type": "competitor.change"},
        "condition_expr": None,
        "action_type": "create_notification",
        "action_config": {"priority": "medium", "category": "competitor"},
        "description": "竞争对手商标动态 → 站内通知",
    },
    {
        "rule_key": "sys.policy_digest_notify",
        "trigger_type": "event",
        "trigger_config": {"event_type": "policy.digest_ready"},
        "condition_expr": None,
        "action_type": "create_notification",
        "action_config": {"priority": "low", "category": "policy"},
        "description": "政策速递完成 → 站内通知",
    },
]


def seed_builtin_rules(db: Session) -> None:
    existing_keys = {row[0] for row in db.query(AutomationRule.rule_key).all()}
    for rule_data in BUILTIN_RULES:
        if rule_data["rule_key"] not in existing_keys:
            rule = AutomationRule(**rule_data)
            db.add(rule)
    db.commit()
    logger.info("automation rules seeded (total=%d)", len(BUILTIN_RULES))


def evaluate_condition(
    condition_expr: str | None,
    event: SystemEvent | None,
) -> bool:
    if not condition_expr:
        return True
    if event is None:
        return False

    ns_event = SimpleNamespace(
        event_type=event.event_type,
        payload=event.payload or {},
        user_id=event.user_id,
        tenant_id=event.tenant_id,
        source_entity_type=event.source_entity_type,
        source_entity_id=event.source_entity_id,
    )
    try:
        result = eval(  # noqa: S307
            condition_expr,
            {"__builtins__": {}},
            {"event": ns_event},
        )
        return bool(result)
    except Exception:
        logger.exception("condition_expr evaluation failed: %s", condition_expr)
        return False


def execute_action(
    db: Session,
    rule: AutomationRule,
    triggering_event: SystemEvent | None,
    context_user_id: str | None = None,
) -> None:
    try:
        action_type = rule.action_type
        action_config = rule.action_config or {}

        if action_type == "enqueue_job":
            _action_enqueue_job(db, rule, action_config, triggering_event, context_user_id)
        elif action_type == "advance_workflow":
            _action_advance_workflow(db, triggering_event)
        elif action_type in ("create_notification", "emit_notification"):
            _action_create_notification(
                db,
                rule,
                action_config,
                triggering_event,
                context_user_id,
                send_email=(action_type == "emit_notification"),
            )
        else:
            logger.warning("unknown action_type: %s", action_type)

        rule.last_fired_at = datetime.now(timezone.utc)
        db.commit()

    except Exception:
        logger.exception("execute_action failed for rule %s", rule.rule_key)


def _action_enqueue_job(
    db: Session,
    rule: AutomationRule,
    action_config: dict,
    triggering_event: SystemEvent | None,
    context_user_id: str | None,
) -> None:
    from apps.api.app.services.jobs import enqueue_job

    job_type = action_config.get("job_type")
    if not job_type:
        logger.warning("enqueue_job action missing job_type in rule %s", rule.rule_key)
        return

    payload: dict = {}
    if context_user_id:
        payload["_user_id"] = context_user_id
    if triggering_event:
        payload["_trigger_event_id"] = triggering_event.id

    tenant_id = rule.tenant_id or (triggering_event.tenant_id if triggering_event else None)
    if tenant_id:
        payload["_tenant_id"] = tenant_id
    enqueue_job(db, job_type=job_type, payload=payload)
    logger.info("rule %s enqueued job %s", rule.rule_key, job_type)


def _action_advance_workflow(
    db: Session,
    triggering_event: SystemEvent | None,
) -> None:
    if not triggering_event:
        return

    job_id = (triggering_event.payload or {}).get("job_id")
    if not job_id:
        return

    from apps.api.app.services.workflow_engine import auto_advance_workflow
    auto_advance_workflow(db, completed_job_id=job_id)


def _action_create_notification(
    db: Session,
    rule: AutomationRule,
    action_config: dict,
    triggering_event: SystemEvent | None,
    context_user_id: str | None,
    send_email: bool = False,
) -> None:
    from apps.api.app.services.notifications import create_notification

    user_id = context_user_id
    if not user_id and triggering_event:
        user_id = triggering_event.user_id
    if not user_id:
        logger.warning("create_notification: no user_id for rule %s", rule.rule_key)
        return

    tenant_id = rule.tenant_id or (triggering_event.tenant_id if triggering_event else None)
    category = action_config.get("category", "system")
    priority = action_config.get("priority", "medium")
    title = _notification_title_for_event(triggering_event)
    body = _notification_body_for_event(triggering_event)

    notif = create_notification(
        db,
        user_id=user_id,
        tenant_id=tenant_id,
        category=category,
        priority=priority,
        title=title,
        body=body,
        source_entity_type=triggering_event.source_entity_type if triggering_event else None,
        source_entity_id=triggering_event.source_entity_id if triggering_event else None,
    )

    if send_email:
        try:
            from apps.api.app.adapters.registry import provider_registry
            provider_registry.get("notification").send_email(
                to_email=None,
                subject=title,
                body=body or title,
                trace_id=notif.id,
            )
        except Exception:
            logger.exception("send_email failed for notification %s", notif.id)


def _notification_title_for_event(event: SystemEvent | None) -> str:
    if not event:
        return "系统通知"
    titles = {
        "monitoring.alert": "发现侵权风险，请关注",
        "competitor.change": "竞争对手商标动态更新",
        "policy.digest_ready": "最新政策速递已就绪",
        "asset.expiring_soon": "IP 资产即将到期",
        "workflow.step_awaiting_review": "工作流需要您确认",
        "workflow.completed": "工作流已完成",
    }
    return titles.get(event.event_type, "系统通知")


def _notification_body_for_event(event: SystemEvent | None) -> str | None:
    if not event:
        return None
    payload = event.payload or {}
    if event.event_type == "monitoring.alert":
        count = payload.get("alert_count", 0)
        high = payload.get("high_count", 0)
        return f"共发现 {count} 条风险，其中高风险 {high} 条。请前往监控模块查看详情。"
    if event.event_type == "asset.expiring_soon":
        name = payload.get("asset_name", "资产")
        days = payload.get("days_until_expiry", 0)
        return f"「{name}」将在 {days} 天后到期，请及时处理续期事宜。"
    return None
