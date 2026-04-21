"""Proactive Copilot routes — /agent/proactive/*.

Three endpoints power the FloatingAgent's "主动副驾" behavior:

- ``POST /agent/proactive/peek`` — lightweight page-arrival probe. The
  FloatingAgent calls this 2s after a route change with the current
  pathname + optional resource descriptor. Returns a
  :class:`ProactiveSuggestion` payload or an empty envelope.
- ``POST /agent/proactive/execute`` — runs the chosen action on a
  suggestion, delegating to ``chat_service._execute_action``.
- ``POST /agent/proactive/dismiss`` — records the user's降噪 choice:
  ``once`` / ``today`` / ``rule_forever``.
- ``POST /agent/proactive/feedback`` — captures 👍 / 👎 feedback for
  future rule iteration.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.core.error_handler import NotFoundError, ValidationError
from apps.api.app.services import proactive_engine
from apps.api.app.services.dependencies import TenantContext, get_current_tenant

router = APIRouter(prefix="/agent/proactive", tags=["agent"])


class PeekRequest(BaseModel):
    route: str = Field(..., min_length=1, max_length=200)
    resourceType: str | None = Field(default=None, max_length=64)
    resourceId: str | None = Field(default=None, max_length=120)


@router.post("/peek")
def proactive_peek(
    body: PeekRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    """Return a suggestion for the current page, or an empty envelope."""
    trace_id = f"proactive-{uuid.uuid4().hex[:10]}"
    suggestion = proactive_engine.peek(
        db,
        user=ctx.user,
        route=body.route,
        resource_type=body.resourceType,
        resource_id=body.resourceId,
        trace_id=trace_id,
    )
    if suggestion is None:
        return {"suggestion": None}
    return {"suggestion": suggestion}


class ExecuteRequest(BaseModel):
    suggestionId: str
    actionId: str


@router.post("/execute")
async def proactive_execute(
    body: ExecuteRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    trace_id = f"proactive-exec-{uuid.uuid4().hex[:10]}"
    try:
        result = await proactive_engine.execute(
            db,
            user=ctx.user,
            suggestion_id=body.suggestionId,
            action_id=body.actionId,
            trace_id=trace_id,
        )
    except ValueError as exc:
        # Surface "not found" as 404, anything else as 422.
        message = str(exc)
        if "not found" in message.lower():
            raise NotFoundError(message) from exc
        raise ValidationError(message) from exc
    return result


class DismissRequest(BaseModel):
    suggestionId: str
    # ``once`` → just close this card; ``today`` → suppress the rule for 24h;
    # ``rule_forever`` → never nag about this rule again.
    scope: str = Field(..., pattern="^(once|today|rule_forever)$")


@router.post("/dismiss")
def proactive_dismiss(
    body: DismissRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    try:
        suggestion = proactive_engine.dismiss(
            db,
            user=ctx.user,
            suggestion_id=body.suggestionId,
            scope=body.scope,
        )
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc
    return {"ok": True, "status": suggestion.status, "scope": body.scope}


class FeedbackRequest(BaseModel):
    suggestionId: str
    feedback: str = Field(..., pattern="^(up|down)$")


@router.post("/feedback")
def proactive_feedback(
    body: FeedbackRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_current_tenant),
):
    try:
        suggestion = proactive_engine.record_feedback(
            db,
            user=ctx.user,
            suggestion_id=body.suggestionId,
            feedback=body.feedback,
        )
    except ValueError as exc:
        raise NotFoundError(str(exc)) from exc
    return {"ok": True, "feedback": suggestion.feedback}
