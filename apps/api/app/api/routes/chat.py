from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.app.core.database import get_db
from apps.api.app.core.streaming import streaming_response
from apps.api.app.schemas.chat import ChatRequest
from apps.api.app.services.chat_service import run_chat_stream
from apps.api.app.services.dependencies import TenantContext, get_current_tenant

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    ctx: TenantContext = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    trace_id = f"chat-{uuid.uuid4().hex[:12]}"
    return streaming_response(run_chat_stream(request, ctx.user, db, trace_id))
