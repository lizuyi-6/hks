from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends
from starlette.responses import StreamingResponse

from apps.api.app.adapters.real.contract_review import CONTRACT_REVIEW_SYSTEM_PROMPT
from apps.api.app.adapters.real.due_diligence import DUE_DILIGENCE_SYSTEM_PROMPT
from apps.api.app.adapters.real.patent_assist import PATENT_ASSESS_SYSTEM_PROMPT
from apps.api.app.adapters.real.policy_digest import POLICY_DIGEST_SYSTEM_PROMPT
from apps.api.app.adapters.registry import provider_registry
from apps.api.app.core.streaming import streaming_response
from apps.api.app.schemas.diagnosis import DiagnosisRequest
from apps.api.app.services.dependencies import get_current_user

router = APIRouter(prefix="/stream", tags=["streaming"])


async def _wrap_analyze_text_stream(
    system_prompt: str,
    user_prompt: str,
    trace_id: str,
) -> AsyncGenerator[str, None]:
    """Stream LLM analyze_text output, collecting tokens into the final envelope."""
    from apps.api.app.core.streaming import sse_event

    llm = provider_registry.get("llm")
    async for event in llm.analyze_text_stream(system_prompt, user_prompt, trace_id):
        yield event


@router.post("/diagnosis")
async def stream_diagnosis(
    payload: DiagnosisRequest,
    _user=Depends(get_current_user),
):
    trace_id = f"stream-diag-{uuid.uuid4().hex[:12]}"
    llm = provider_registry.get("llm")
    knowledge = {}
    return streaming_response(llm.diagnose_stream(payload, knowledge, trace_id))


@router.post("/contracts/review")
async def stream_contract_review(
    body: dict,
    _user=Depends(get_current_user),
):
    trace_id = f"stream-ctr-{uuid.uuid4().hex[:12]}"
    contract_text = body.get("contract_text", "")
    user_prompt = f"请审查以下合同文本：\n\n{contract_text[:4000]}"
    return streaming_response(
        _wrap_analyze_text_stream(CONTRACT_REVIEW_SYSTEM_PROMPT, user_prompt, trace_id)
    )


@router.post("/patents/assess")
async def stream_patent_assess(
    body: dict,
    _user=Depends(get_current_user),
):
    trace_id = f"stream-pat-{uuid.uuid4().hex[:12]}"
    description = body.get("description", "")
    user_prompt = f"请评估以下技术描述的知识产权保护方案：\n\n{description}"
    return streaming_response(
        _wrap_analyze_text_stream(PATENT_ASSESS_SYSTEM_PROMPT, user_prompt, trace_id)
    )


@router.post("/policies/digest")
async def stream_policy_digest(
    body: dict,
    _user=Depends(get_current_user),
):
    trace_id = f"stream-pol-{uuid.uuid4().hex[:12]}"
    industry = body.get("industry", "通用")
    user_prompt = f"请整理 {industry} 行业最新的知识产权相关政策信息。"
    return streaming_response(
        _wrap_analyze_text_stream(POLICY_DIGEST_SYSTEM_PROMPT, user_prompt, trace_id)
    )


@router.post("/due-diligence/investigate")
async def stream_due_diligence(
    body: dict,
    _user=Depends(get_current_user),
):
    trace_id = f"stream-dd-{uuid.uuid4().hex[:12]}"
    company_name = body.get("company_name", "")
    user_prompt = f"请对以下公司进行知识产权融资尽调分析：{company_name}"
    return streaming_response(
        _wrap_analyze_text_stream(DUE_DILIGENCE_SYSTEM_PROMPT, user_prompt, trace_id)
    )
