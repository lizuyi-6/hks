from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Callable

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends
from starlette.responses import StreamingResponse

from apps.api.app.adapters.real.contract_review import (
    CONTRACT_REVIEW_SYSTEM_PROMPT,
    normalize_contract_review_payload,
)
from apps.api.app.adapters.real.due_diligence import (
    DUE_DILIGENCE_SYSTEM_PROMPT,
    normalize_due_diligence_payload,
)
from apps.api.app.adapters.real.patent_assist import PATENT_ASSESS_SYSTEM_PROMPT
from apps.api.app.adapters.real.policy_digest import (
    POLICY_DIGEST_SYSTEM_PROMPT,
    normalize_policy_digest_payload,
)
from apps.api.app.adapters.registry import provider_registry
from apps.api.app.core.streaming import streaming_response
from apps.api.app.schemas.diagnosis import DiagnosisRequest
from apps.api.app.services.dependencies import TenantContext, get_current_tenant

router = APIRouter(prefix="/stream", tags=["streaming"])


def _parse_sse_event(raw: str) -> tuple[str | None, str | None]:
    """Parse a single SSE frame into (event_name, data_text)."""
    event_name: str | None = None
    data_lines: list[str] = []
    for line in raw.splitlines():
        if line.startswith("event:"):
            event_name = line[len("event:"):].strip()
        elif line.startswith("data:"):
            data_lines.append(line[len("data:"):].lstrip())
    if not data_lines:
        return event_name, None
    return event_name, "\n".join(data_lines)


async def _wrap_analyze_text_stream(
    system_prompt: str,
    user_prompt: str,
    trace_id: str,
    normalizer: Callable[[object], dict] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream LLM analyze_text output, collecting tokens into the final envelope.

    When ``normalizer`` is provided, the final ``result`` event is parsed and its
    ``normalizedPayload`` is rewritten so downstream UIs always receive the
    shape they expect (risks/policies/ip_portfolio …) even when the LLM emits
    partial JSON or plain text.
    """
    from apps.api.app.core.streaming import sse_event

    llm = provider_registry.get("llm")
    try:
        async for event in llm.analyze_text_stream(system_prompt, user_prompt, trace_id):
            if normalizer is None:
                yield event
                continue

            name, data_text = _parse_sse_event(event)
            if name != "result" or not data_text:
                yield event
                continue

            try:
                envelope = json.loads(data_text)
                raw_payload = envelope.get("normalizedPayload")
                normalized = normalizer(raw_payload)
                envelope["normalizedPayload"] = normalized
                yield sse_event("result", envelope)
            except Exception:
                logger.exception(
                    "stream.analyze_text.normalize_failed trace_id=%s", trace_id,
                )
                # Fall back to the raw event so the UI can still render _something_.
                yield event
    except Exception:
        logger.exception("stream.analyze_text.failed trace_id=%s", trace_id)
        yield sse_event(
            "error",
            {"message": "流式分析暂时不可用，请重试", "traceId": trace_id},
        )


@router.post("/diagnosis")
async def stream_diagnosis(
    payload: DiagnosisRequest,
    _ctx: TenantContext = Depends(get_current_tenant),
):
    trace_id = f"stream-diag-{uuid.uuid4().hex[:12]}"
    llm = provider_registry.get("llm")
    # Fetch KB snippets so the LLM can ground its answer in the官方 catalog
    # instead of emitting generic-sounding prose.
    try:
        kb_envelope = provider_registry.get("knowledgeBase").retrieve(
            "trademark", trace_id=trace_id,
        )
        knowledge = kb_envelope.model_dump(by_alias=True)
    except Exception:
        logger.exception("stream.diagnosis.kb_retrieve_failed trace_id=%s", trace_id)
        knowledge = {}

    async def _guarded():
        from apps.api.app.core.streaming import sse_event as _sse_event
        try:
            async for chunk in llm.diagnose_stream(payload, knowledge, trace_id):
                yield chunk
        except Exception:
            logger.exception("stream.diagnosis.failed trace_id=%s", trace_id)
            yield _sse_event(
                "error",
                {"message": "诊断流暂时不可用，请重试", "traceId": trace_id},
            )

    return streaming_response(_guarded())


@router.post("/contracts/review")
async def stream_contract_review(
    body: dict,
    _ctx: TenantContext = Depends(get_current_tenant),
):
    trace_id = f"stream-ctr-{uuid.uuid4().hex[:12]}"
    contract_text = body.get("contract_text", "")
    user_prompt = f"请审查以下合同文本：\n\n{contract_text[:4000]}"
    return streaming_response(
        _wrap_analyze_text_stream(
            CONTRACT_REVIEW_SYSTEM_PROMPT,
            user_prompt,
            trace_id,
            normalizer=normalize_contract_review_payload,
        )
    )


@router.post("/patents/assess")
async def stream_patent_assess(
    body: dict,
    _ctx: TenantContext = Depends(get_current_tenant),
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
    _ctx: TenantContext = Depends(get_current_tenant),
):
    trace_id = f"stream-pol-{uuid.uuid4().hex[:12]}"
    industry = body.get("industry", "通用")
    user_prompt = f"请整理 {industry} 行业最新的知识产权相关政策信息。"
    return streaming_response(
        _wrap_analyze_text_stream(
            POLICY_DIGEST_SYSTEM_PROMPT,
            user_prompt,
            trace_id,
            normalizer=lambda p: normalize_policy_digest_payload(p, industry),
        )
    )


@router.post("/due-diligence/investigate")
async def stream_due_diligence(
    body: dict,
    _ctx: TenantContext = Depends(get_current_tenant),
):
    trace_id = f"stream-dd-{uuid.uuid4().hex[:12]}"
    company_name = body.get("company_name", "")
    user_prompt = f"请对以下公司进行知识产权融资尽调分析：{company_name}"
    return streaming_response(
        _wrap_analyze_text_stream(
            DUE_DILIGENCE_SYSTEM_PROMPT,
            user_prompt,
            trace_id,
            normalizer=lambda p: normalize_due_diligence_payload(p, company_name),
        )
    )
