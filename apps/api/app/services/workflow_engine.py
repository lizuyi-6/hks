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
from apps.api.app.services.jobs import enqueue_job


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


WORKFLOW_TEMPLATES = {
    "trademark-registration": {
        "name": "商标注册全流程",
        "steps": [
            {"step_type": "diagnosis", "job_type": "diagnosis.report", "name": "IP 诊断"},
            {"step_type": "trademark-check", "job_type": None, "name": "商标查重"},
            {"step_type": "application", "job_type": "trademark.application", "name": "申请书生成"},
            {"step_type": "submit-guide", "job_type": None, "name": "提交引导"},
            {"step_type": "ledger", "job_type": None, "name": "入台账"},
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
) -> WorkflowInstance:
    template = WORKFLOW_TEMPLATES.get(workflow_type)
    if template is None:
        raise ValueError(f"Unknown workflow type: {workflow_type}")

    context = initial_context or {}
    instance = WorkflowInstance(
        user_id=user_id,
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
    db.commit()
    db.refresh(instance)
    return instance


def get_suggestions(db: Session, user_id: str) -> list[dict]:
    suggestions: list[dict] = []

    running_workflows = (
        db.query(WorkflowInstance)
        .filter(WorkflowInstance.user_id == user_id)
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

    diagnosis_results = (
        db.query(ModuleResult)
        .filter(ModuleResult.user_id == user_id)
        .filter(ModuleResult.module_type == "diagnosis")
        .order_by(ModuleResult.created_at.desc())
        .limit(1)
        .first()
    )
    if not diagnosis_results:
        diagnosis_steps = (
            db.query(WorkflowStep)
            .join(WorkflowInstance)
            .filter(WorkflowInstance.user_id == user_id)
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
            .filter(WorkflowInstance.user_id == user_id)
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
        .filter(WorkflowInstance.user_id == user_id)
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
    expiring_assets = (
        db.query(IpAsset)
        .filter(IpAsset.owner_id == user_id)
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
    user_id: str,
    status: str | None = None,
) -> list[WorkflowInstance]:
    query = (
        db.query(WorkflowInstance)
        .options(joinedload(WorkflowInstance.steps))
        .filter(WorkflowInstance.user_id == user_id)
    )
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
