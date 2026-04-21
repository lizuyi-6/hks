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

import ast
import logging
import operator
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from sqlalchemy.orm import Session

from apps.api.app.db.models import AutomationRule, SystemEvent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Safe expression evaluator for AutomationRule.condition_expr
#
# condition_expr is stored in the database and may come from user-authored
# rules. Using plain ``eval()`` — even with ``__builtins__`` disabled — is
# vulnerable to sandbox escapes (e.g. ``().__class__.__mro__[1].__subclasses__()``
# or attribute chains into object internals). Instead we parse the expression
# into an AST and walk it, rejecting any node type, name, attribute or call
# that is not explicitly on an allow-list.
# ---------------------------------------------------------------------------

_ALLOWED_COMPARE_OPS: dict[type, Any] = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
    ast.Is: operator.is_,
    ast.IsNot: operator.is_not,
}

_ALLOWED_BINOPS: dict[type, Any] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
}

_ALLOWED_UNARYOPS: dict[type, Any] = {
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
    ast.Not: operator.not_,
}

_ALLOWED_FUNCS: dict[str, Any] = {
    "int": int,
    "float": float,
    "str": str,
    "bool": bool,
    "len": len,
    "min": min,
    "max": max,
    "abs": abs,
}

_ALLOWED_METHODS: frozenset[str] = frozenset(
    {
        "get",
        "keys",
        "values",
        "items",
        "startswith",
        "endswith",
        "lower",
        "upper",
        "strip",
        "split",
    }
)


class _UnsafeExpression(ValueError):
    """Raised when condition_expr contains a disallowed construct."""


def _safe_eval_node(node: ast.AST, names: dict[str, Any]) -> Any:
    if isinstance(node, ast.Expression):
        return _safe_eval_node(node.body, names)

    if isinstance(node, ast.Constant):
        return node.value

    if isinstance(node, ast.Name):
        if node.id in names:
            return names[node.id]
        if node.id in _ALLOWED_FUNCS:
            return _ALLOWED_FUNCS[node.id]
        raise _UnsafeExpression(f"unknown name: {node.id!r}")

    if isinstance(node, ast.Attribute):
        if node.attr.startswith("_"):
            raise _UnsafeExpression(f"disallowed attribute: {node.attr!r}")
        return getattr(_safe_eval_node(node.value, names), node.attr)

    if isinstance(node, ast.Subscript):
        container = _safe_eval_node(node.value, names)
        key = _safe_eval_node(node.slice, names)
        return container[key]

    if isinstance(node, ast.BoolOp):
        if isinstance(node.op, ast.And):
            result: Any = True
            for value in node.values:
                result = _safe_eval_node(value, names)
                if not result:
                    return result
            return result
        if isinstance(node.op, ast.Or):
            result = False
            for value in node.values:
                result = _safe_eval_node(value, names)
                if result:
                    return result
            return result
        raise _UnsafeExpression("disallowed boolean operator")

    if isinstance(node, ast.UnaryOp):
        op_type = type(node.op)
        if op_type not in _ALLOWED_UNARYOPS:
            raise _UnsafeExpression(f"disallowed unary op: {op_type.__name__}")
        return _ALLOWED_UNARYOPS[op_type](_safe_eval_node(node.operand, names))

    if isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in _ALLOWED_BINOPS:
            raise _UnsafeExpression(f"disallowed binary op: {op_type.__name__}")
        return _ALLOWED_BINOPS[op_type](
            _safe_eval_node(node.left, names),
            _safe_eval_node(node.right, names),
        )

    if isinstance(node, ast.Compare):
        left = _safe_eval_node(node.left, names)
        for op, comparator in zip(node.ops, node.comparators):
            right = _safe_eval_node(comparator, names)
            op_type = type(op)
            if op_type not in _ALLOWED_COMPARE_OPS:
                raise _UnsafeExpression(
                    f"disallowed compare op: {op_type.__name__}"
                )
            if not _ALLOWED_COMPARE_OPS[op_type](left, right):
                return False
            left = right
        return True

    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name):
            if node.func.id not in _ALLOWED_FUNCS:
                raise _UnsafeExpression(
                    f"disallowed function call: {node.func.id!r}"
                )
            fn = _ALLOWED_FUNCS[node.func.id]
        elif isinstance(node.func, ast.Attribute):
            if node.func.attr not in _ALLOWED_METHODS:
                raise _UnsafeExpression(
                    f"disallowed method call: {node.func.attr!r}"
                )
            target = _safe_eval_node(node.func.value, names)
            fn = getattr(target, node.func.attr)
        else:
            raise _UnsafeExpression("disallowed call form")
        args = [_safe_eval_node(a, names) for a in node.args]
        kwargs = {kw.arg: _safe_eval_node(kw.value, names) for kw in node.keywords}
        return fn(*args, **kwargs)

    if isinstance(node, ast.List):
        return [_safe_eval_node(e, names) for e in node.elts]
    if isinstance(node, ast.Tuple):
        return tuple(_safe_eval_node(e, names) for e in node.elts)
    if isinstance(node, ast.Set):
        return {_safe_eval_node(e, names) for e in node.elts}
    if isinstance(node, ast.Dict):
        return {
            _safe_eval_node(k, names): _safe_eval_node(v, names)
            for k, v in zip(node.keys, node.values)
            if k is not None
        }
    if isinstance(node, ast.IfExp):
        return (
            _safe_eval_node(node.body, names)
            if _safe_eval_node(node.test, names)
            else _safe_eval_node(node.orelse, names)
        )

    raise _UnsafeExpression(f"disallowed ast node: {type(node).__name__}")


def _safe_eval_expression(expr: str, names: dict[str, Any]) -> Any:
    tree = ast.parse(expr, mode="eval")
    return _safe_eval_node(tree, names)

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
        "rule_key": "sys.daily_lead_temperature_recompute",
        "trigger_type": "cron",
        "trigger_config": {"cron": "30 2 * * *"},
        "condition_expr": None,
        "action_type": "enqueue_job",
        "action_config": {
            "job_type": "lead.temperature_recompute",
            # Only rebucket leads whose signals haven't been refreshed in 6h.
            "payload_template": {"limit": 1000, "only_stale_hours": 6},
        },
        "description": "每日凌晨 02:30 重算所有未关闭线索的温度评分（D5 日批）",
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
    # ------------------------------------------------------------------
    # A1+ 2.0 场景化推送模板 (Scenario-based Push Templates)
    # ------------------------------------------------------------------
    {
        "rule_key": "scenario.diagnosis_to_match",
        "trigger_type": "event",
        "trigger_config": {"event_type": "diagnosis.completed"},
        "condition_expr": None,
        "action_type": "create_scenario_push",
        "action_config": {
            "scenario": "diagnosis_to_match",
            "category": "workflow",
            "priority": "medium",
            "title": "为你推荐 3 位擅长此领域的律师",
            "body": "刚完成的 IP 诊断报告里发现几项风险，想看看匹配的专业律师吗？",
            "action_label": "一键匹配",
            "action_url": "/consult?prefill=diagnosis",
        },
        "description": "用户诊断完成 → 推送律师匹配入口（需求画像→智能匹配）",
    },
    {
        "rule_key": "scenario.trademark_red_flag",
        "trigger_type": "event",
        "trigger_config": {"event_type": "trademark.red_flag"},
        "condition_expr": None,
        "action_type": "create_scenario_push",
        "action_config": {
            "scenario": "trademark_red_flag",
            "category": "workflow",
            "priority": "high",
            "title": "商标查重结果为红灯，建议咨询专业律师",
            "body": "检测到高风险近似商标，由专业律师出具规避方案能显著降低驳回概率。",
            "action_label": "联系商标律师",
            "action_url": "/consult?intent=trademark&urgency=urgent",
        },
        "description": "商标查重红灯 → 推送律师咨询入口",
    },
    {
        "rule_key": "scenario.asset_expiring_renewal",
        "trigger_type": "event",
        "trigger_config": {"event_type": "asset.expiring_soon"},
        "condition_expr": "int(event.payload.get('days_until_expiry', 999)) <= 90",
        "action_type": "create_scenario_push",
        "action_config": {
            "scenario": "asset_expiring_renewal",
            "category": "reminder",
            "priority": "medium",
            "title": "资产即将到期 · 是否交由律师代办续展？",
            "body": "离到期日仅 90 天，建议尽快启动续展。平台已上架代办服务产品，可一键委托。",
            "action_label": "查看续展服务",
            "action_url": "/consult?intent=trademark&subintent=renewal",
        },
        "description": "资产到期 90 天 → 推送续展代办服务",
    },
    {
        "rule_key": "scenario.monitoring_infringement_hit",
        "trigger_type": "event",
        "trigger_config": {"event_type": "monitoring.alert"},
        "condition_expr": "int(event.payload.get('high_count', 0)) > 0",
        "action_type": "create_scenario_push",
        "action_config": {
            "scenario": "monitoring_infringement_hit",
            "category": "monitoring",
            "priority": "high",
            "title": "发现侵权线索 · 一键委托律师维权",
            "body": "监控已保存相关证据，可立即发起取证/发函/维权流程。",
            "action_label": "启动维权流程",
            "action_url": "/consult?intent=litigation&urgency=urgent",
        },
        "description": "监控命中侵权线索 → 推送一键维权入口",
    },
    {
        "rule_key": "scenario.policy_hit_compliance",
        "trigger_type": "event",
        "trigger_config": {"event_type": "policy.digest_ready"},
        "condition_expr": "bool((event.payload or {}).get('impact_high'))",
        "action_type": "create_scenario_push",
        "action_config": {
            "scenario": "policy_hit_compliance",
            "category": "policy",
            "priority": "high",
            "title": "新政策可能影响你的业务",
            "body": "平台检测到对你所在行业有较大影响的新规，建议查看合规建议。",
            "action_label": "查看合规建议",
            "action_url": "/enterprise/policy-radar",
        },
        "description": "政策雷达命中 → 向订阅企业推送合规建议",
    },
    {
        "rule_key": "scenario.provider_fresh_lead",
        "trigger_type": "event",
        "trigger_config": {"event_type": "provider.lead_created"},
        "condition_expr": "float(event.payload.get('score', 0)) >= 70",
        "action_type": "create_scenario_push",
        "action_config": {
            "scenario": "provider_fresh_lead",
            "category": "system",
            "priority": "high",
            "title": "新线索匹配分 ≥ 70，建议 3 小时内响应",
            "body": "高匹配度线索转化率更高，请尽快联系客户。",
            "action_label": "前往线索池",
            "action_url": "/provider/leads",
            "target_role": "provider",
        },
        "description": "律师端：高分线索 → 推送给律师",
    },
    {
        "rule_key": "scenario.compliance_score_low",
        "trigger_type": "event",
        "trigger_config": {"event_type": "compliance.audit_completed"},
        "condition_expr": "int(event.payload.get('score', 100)) < 60",
        "action_type": "create_scenario_push",
        "action_config": {
            "scenario": "compliance_score_low",
            "category": "system",
            "priority": "high",
            "title": "合规评分低于 60 · 建议启动改善计划",
            "body": "已为你准备风险摘要和改善路径图，配套服务产品可按需订阅。",
            "action_label": "查看报告",
            "action_url": "/enterprise/audit",
            "target_role": "enterprise",
        },
        "description": "合规评分低 → 推送改善路径",
    },
    {
        "rule_key": "scenario.order_silent_followup",
        "trigger_type": "cron",
        "trigger_config": {"cron": "0 */6 * * *"},
        "condition_expr": None,
        "action_type": "enqueue_job",
        "action_config": {
            "job_type": "order.silent_followup",
            "payload_template": {"silent_hours": 48},
        },
        "description": "订单静默超 48h → 双向催办",
    },
    # ------------------------------------------------------------------
    # Litigation Intelligence — 诉讼风险模块场景推送
    # ------------------------------------------------------------------
    {
        "rule_key": "scenario.litigation_high_risk",
        "trigger_type": "event",
        "trigger_config": {"event_type": "litigation.predicted"},
        "condition_expr": "float(event.payload.get('win_probability', 1.0)) < 0.4",
        "action_type": "create_scenario_push",
        "action_config": {
            "scenario": "litigation_high_risk",
            "category": "workflow",
            "priority": "high",
            "title": "胜诉率偏低 · 建议先行和解或补强证据",
            "body": "AI 预测本案胜诉率不足 40%，直接诉讼风险较大，可先尝试和解或补充关键证据。",
            "action_label": "查看 AI 策略",
            "action_url": "/litigation",
        },
        "description": "诉讼预测胜诉率 < 40% → 推送和解 / 证据补强建议",
    },
    {
        "rule_key": "scenario.litigation_ready_to_file",
        "trigger_type": "event",
        "trigger_config": {"event_type": "litigation.predicted"},
        "condition_expr": "float(event.payload.get('win_probability', 0.0)) >= 0.75",
        "action_type": "create_scenario_push",
        "action_config": {
            "scenario": "litigation_ready_to_file",
            "category": "workflow",
            "priority": "high",
            "title": "胜诉概率较高 · 一键匹配诉讼律师",
            "body": "AI 预测本案胜诉率较高，建议及时立案并申请行为保全，已为你匹配诉讼律师。",
            "action_label": "匹配诉讼律师",
            "action_url": "/match?intent=litigation",
        },
        "description": "诉讼预测胜诉率 ≥ 75% → 精准获客：推送诉讼律师匹配",
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
        result = _safe_eval_expression(condition_expr, {"event": ns_event})
        return bool(result)
    except _UnsafeExpression as exc:
        logger.warning(
            "condition_expr rejected by safe evaluator (%s): %s",
            exc,
            condition_expr,
        )
        return False
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
        elif action_type == "create_scenario_push":
            _action_create_scenario_push(db, rule, action_config, triggering_event, context_user_id)
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


def _action_create_scenario_push(
    db: Session,
    rule: AutomationRule,
    action_config: dict,
    triggering_event: SystemEvent | None,
    context_user_id: str | None,
) -> None:
    """Scenario-based push: full notification with action button from the config."""
    from apps.api.app.services.notifications import create_notification

    user_id = context_user_id
    if not user_id and triggering_event:
        user_id = triggering_event.user_id
    if not user_id:
        logger.warning("scenario push: no user_id for rule %s", rule.rule_key)
        return

    tenant_id = rule.tenant_id or (triggering_event.tenant_id if triggering_event else None)
    create_notification(
        db,
        user_id=user_id,
        tenant_id=tenant_id,
        category=action_config.get("category", "system"),
        priority=action_config.get("priority", "medium"),
        title=action_config.get("title", "A1+ 场景化提醒"),
        body=action_config.get("body"),
        action_url=action_config.get("action_url"),
        action_label=action_config.get("action_label"),
        source_entity_type=triggering_event.source_entity_type if triggering_event else None,
        source_entity_id=triggering_event.source_entity_id if triggering_event else None,
    )


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
