from __future__ import annotations

from datetime import datetime, timedelta, timezone
from copy import deepcopy
from uuid import uuid4

from sqlalchemy.orm import Session, joinedload

from apps.api.app.db.models import (
    IpAsset,
    ModuleResult,
    WorkflowInstance,
    WorkflowStep,
)
from apps.api.app.services import event_types
from apps.api.app.services.event_bus import emit_event
from apps.api.app.services.jobs import enqueue_job


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


WORKFLOW_TEMPLATES = {
    "trademark-registration": {
        "name": "商标注册全流程",
        "steps": [
            {
                "step_type": "diagnosis",
                "job_type": "diagnosis.report",
                "name": "IP 诊断",
                "requires_user_review": False,
                "auto_enqueue": True,
            },
            {
                "step_type": "trademark-check",
                "job_type": "trademark.check",
                "name": "商标查重",
                "requires_user_review": False,
                "auto_enqueue": True,
            },
            {
                "step_type": "application",
                "job_type": "trademark.application",
                "name": "申请书生成",
                "requires_user_review": True,
                "auto_enqueue": True,
            },
            {
                "step_type": "submit-guide",
                "job_type": None,
                "name": "提交引导",
                "requires_user_review": True,
                "auto_enqueue": False,
            },
            {
                "step_type": "ledger",
                "job_type": None,
                "name": "入台账",
                "requires_user_review": False,
                "auto_enqueue": False,
            },
        ],
    }
}


def _deep_merge(base: dict, override: dict) -> dict:
    merged = deepcopy(base)
    for key, value in override.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


def create_workflow(
    db: Session,
    user_id: str,
    workflow_type: str,
    initial_context: dict | None = None,
    tenant_id: str | None = None,
) -> WorkflowInstance:
    template = WORKFLOW_TEMPLATES.get(workflow_type)
    if template is None:
        raise ValueError(f"Unknown workflow type: {workflow_type}")

    context = initial_context or {}
    instance = WorkflowInstance(
        user_id=user_id,
        tenant_id=tenant_id,
        workflow_type=workflow_type,
        status="pending",
        context=context,
        current_step_index=0,
    )
    db.add(instance)
    db.flush()

    for idx, step_def in enumerate(template["steps"]):
        step = WorkflowStep(
            workflow_id=instance.id,
            step_type=step_def["step_type"],
            step_index=idx,
            status="pending",
        )
        db.add(step)

    db.flush()

    steps = (
        db.query(WorkflowStep)
        .filter(WorkflowStep.workflow_id == instance.id)
        .order_by(WorkflowStep.step_index.asc())
        .all()
    )

    first_step = steps[0]
    first_step.status = "running"
    instance.status = "running"

    first_def = template["steps"][0]
    if first_def.get("job_type"):
        job = enqueue_job(db, first_def["job_type"], context)
        first_step.job_id = job.id

    db.commit()
    db.refresh(instance)
    return instance


def advance_workflow(
    db: Session,
    workflow_id: str,
    step_output: dict | None = None,
) -> WorkflowInstance:
    instance = (
        db.query(WorkflowInstance)
        .options(joinedload(WorkflowInstance.steps))
        .filter(WorkflowInstance.id == workflow_id)
        .first()
    )
    if instance is None:
        raise ValueError("Workflow not found")

    steps = sorted(instance.steps, key=lambda s: s.step_index)
    current_idx = instance.current_step_index

    if current_idx >= len(steps):
        raise ValueError("No current step to complete")

    current_step = steps[current_idx]
    current_step.status = "completed"
    current_step.output_data = step_output or {}

    emit_event(
        db,
        event_type=event_types.WORKFLOW_STEP_COMPLETED,
        source_entity_type="workflow_step",
        source_entity_id=current_step.id,
        payload={
            "workflow_id": instance.id,
            "step_type": current_step.step_type,
            "step_index": instance.current_step_index,
            "job_id": current_step.job_id,
        },
    )

    if step_output:
        instance.context = _deep_merge(instance.context, step_output)

    next_idx = current_idx + 1

    if next_idx < len(steps):
        next_step = steps[next_idx]
        next_step.status = "running"
        instance.current_step_index = next_idx

        template = WORKFLOW_TEMPLATES.get(instance.workflow_type)
        if template:
            next_def = template["steps"][next_idx]
            if next_def.get("job_type"):
                job = enqueue_job(db, next_def["job_type"], instance.context)
                next_step.job_id = job.id
    else:
        instance.status = "completed"
        emit_event(
            db,
            event_type=event_types.WORKFLOW_COMPLETED,
            source_entity_type="workflow",
            source_entity_id=instance.id,
            payload={"workflow_type": instance.workflow_type, "workflow_id": instance.id},
        )

    db.commit()
    db.refresh(instance)
    return instance


def fail_workflow_step(
    db: Session,
    workflow_id: str,
    error_message: str,
) -> WorkflowInstance:
    instance = (
        db.query(WorkflowInstance)
        .options(joinedload(WorkflowInstance.steps))
        .filter(WorkflowInstance.id == workflow_id)
        .first()
    )
    if instance is None:
        raise ValueError("Workflow not found")

    steps = sorted(instance.steps, key=lambda s: s.step_index)
    current_idx = instance.current_step_index

    if current_idx < len(steps):
        current_step = steps[current_idx]
        current_step.status = "failed"
        current_step.output_data = {"error": error_message}

    instance.status = "failed"
    emit_event(
        db,
        event_type=event_types.WORKFLOW_FAILED,
        source_entity_type="workflow_step",
        source_entity_id=instance.id,
        payload={"workflow_id": instance.id, "error": error_message},
    )
    db.commit()
    db.refresh(instance)
    return instance


def get_suggestions(db: Session, user_id: str, tenant_id: str | None = None) -> list[dict]:
    suggestions: list[dict] = []

    wf_filter = WorkflowInstance.user_id == user_id
    if tenant_id:
        wf_filter = WorkflowInstance.tenant_id == tenant_id

    running_workflows = (
        db.query(WorkflowInstance)
        .filter(wf_filter)
        .filter(WorkflowInstance.status == "running")
        .all()
    )
    if running_workflows:
        for wf in running_workflows:
            template = WORKFLOW_TEMPLATES.get(wf.workflow_type, {})
            steps = sorted(wf.steps, key=lambda s: s.step_index)
            current_step = steps[wf.current_step_index] if wf.current_step_index < len(steps) else None
            step_name = current_step.step_type if current_step else "未知"
            suggestions.append({
                "id": f"continue-workflow-{wf.id}",
                "title": f"继续「{template.get('name', wf.workflow_type)}」",
                "description": f"当前步骤：{step_name}（第 {wf.current_step_index + 1} 步）",
                "action": {
                    "label": "继续流程",
                    "href": "/dashboard",
                },
                "priority": 10,
            })

    mr_filter = ModuleResult.user_id == user_id
    if tenant_id:
        mr_filter = ModuleResult.tenant_id == tenant_id

    diagnosis_results = (
        db.query(ModuleResult)
        .filter(mr_filter)
        .filter(ModuleResult.module_type == "diagnosis")
        .order_by(ModuleResult.created_at.desc())
        .limit(1)
        .first()
    )
    if not diagnosis_results:
        diagnosis_steps = (
            db.query(WorkflowStep)
            .join(WorkflowInstance)
            .filter(wf_filter)
            .filter(WorkflowStep.step_type == "diagnosis")
            .filter(WorkflowStep.status == "completed")
            .order_by(WorkflowStep.created_at.desc())
            .limit(1)
            .first()
        )
        if diagnosis_steps:
            diagnosis_results = True

    if diagnosis_results:
        has_running_tm_check = (
            db.query(WorkflowInstance)
            .filter(wf_filter)
            .filter(WorkflowInstance.workflow_type == "trademark-registration")
            .filter(WorkflowInstance.status.in_(["running", "pending"]))
            .first()
        )
        if not has_running_tm_check:
            suggestions.append({
                "id": "start-trademark-check",
                "title": "开始商标查重",
                "description": "您已完成了 IP 诊断，可以继续进行商标查重",
                "action": {
                    "label": "开始查重",
                    "href": "/trademark/check",
                },
                "priority": 20,
            })

    all_workflows = (
        db.query(WorkflowInstance)
        .filter(wf_filter)
        .first()
    )
    if not all_workflows and not diagnosis_results:
        suggestions.append({
            "id": "start-diagnosis",
            "title": "开始 IP 诊断",
            "description": "您还没有进行过 IP 诊断，建议先完成诊断了解您的知识产权状况",
            "action": {
                "label": "开始诊断",
                "href": "/diagnosis",
            },
            "priority": 30,
        })

    now = utcnow()
    threshold = now + timedelta(days=90)
    asset_filter = IpAsset.owner_id == user_id
    if tenant_id:
        asset_filter = IpAsset.tenant_id == tenant_id

    expiring_assets = (
        db.query(IpAsset)
        .filter(asset_filter)
        .filter(IpAsset.expires_at != None)
        .filter(IpAsset.expires_at <= threshold)
        .filter(IpAsset.expires_at >= now)
        .all()
    )
    if expiring_assets:
        asset_names = ", ".join(a.name for a in expiring_assets[:3])
        suggestions.append({
            "id": "expiring-assets",
            "title": f"有 {len(expiring_assets)} 项资产即将到期",
            "description": f"以下资产将在 90 天内到期：{asset_names}",
            "action": {
                "label": "查看提醒",
                "href": "/assets",
            },
            "priority": 5,
        })

    suggestions.sort(key=lambda s: s["priority"])
    return suggestions


def get_user_workflows(
    db: Session,
    user_id: str | None = None,
    tenant_id: str | None = None,
    status: str | None = None,
) -> list[WorkflowInstance]:
    query = (
        db.query(WorkflowInstance)
        .options(joinedload(WorkflowInstance.steps))
    )
    if tenant_id:
        query = query.filter(WorkflowInstance.tenant_id == tenant_id)
    elif user_id:
        query = query.filter(WorkflowInstance.user_id == user_id)
    if status:
        query = query.filter(WorkflowInstance.status == status)
    return query.order_by(WorkflowInstance.created_at.desc()).all()


def get_workflow_detail(db: Session, workflow_id: str) -> WorkflowInstance:
    instance = (
        db.query(WorkflowInstance)
        .options(joinedload(WorkflowInstance.steps))
        .filter(WorkflowInstance.id == workflow_id)
        .first()
    )
    if instance is None:
        raise ValueError("Workflow not found")
    return instance


def auto_advance_workflow(
    db: Session,
    completed_job_id: str,
) -> WorkflowInstance | None:
    from apps.api.app.db.models import JobRecord
    import logging
    _logger = logging.getLogger(__name__)

    step = (
        db.query(WorkflowStep)
        .filter(
            WorkflowStep.job_id == completed_job_id,
            WorkflowStep.status == "running",
        )
        .first()
    )
    if not step:
        return None

    instance = db.query(WorkflowInstance).filter(
        WorkflowInstance.id == step.workflow_id
    ).first()
    if not instance:
        return None

    template = WORKFLOW_TEMPLATES.get(instance.workflow_type, {})
    steps_def = template.get("steps", [])
    step_def = next(
        (s for s in steps_def if s["step_type"] == step.step_type),
        None,
    )
    requires_review = step_def.get("requires_user_review", False) if step_def else False

    if requires_review:
        step.status = "awaiting_review"

        emit_event(
            db,
            event_type=event_types.WORKFLOW_STEP_AWAITING,
            source_entity_type="workflow_step",
            source_entity_id=step.id,
            payload={
                "workflow_id": instance.id,
                "step_type": step.step_type,
                "step_name": step_def.get("name", step.step_type) if step_def else step.step_type,
            },
        )

        try:
            from apps.api.app.services.notifications import create_notification
            user_id = (instance.context or {}).get("user_id") or instance.user_id
            if user_id:
                step_name = step_def.get("name", step.step_type) if step_def else step.step_type
                create_notification(
                    db,
                    user_id=user_id,
                    tenant_id=getattr(instance, "tenant_id", None),
                    category="workflow",
                    priority="high",
                    title=f"「{step_name}」完成，等待您确认",
                    body="请前往工作台审批此步骤的生成结果。",
                    action_url="/inbox",
                    action_label="前往审批",
                    source_entity_type="workflow_step",
                    source_entity_id=step.id,
                )
        except Exception:
            _logger.exception("create_notification failed in auto_advance_workflow")

        db.commit()
        return instance

    else:
        job = db.query(JobRecord).filter(JobRecord.id == completed_job_id).first()
        step_output = (job.result or {}) if job else {}
        return advance_workflow(db, instance.id, step_output=step_output)
