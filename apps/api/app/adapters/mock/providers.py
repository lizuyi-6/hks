from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import (
    CompetitorPort,
    ContractReviewPort,
    DocumentRenderPort,
    DueDiligencePort,
    EnterpriseLookupPort,
    KnowledgeBasePort,
    LLMPort,
    MonitoringPort,
    NotificationPort,
    PatentAssistPort,
    PolicyDigestPort,
    PublicWebSearchPort,
    SubmissionGuidePort,
    TrademarkSearchPort,
)
from apps.api.app.schemas.common import SourceRef
from apps.api.app.schemas.diagnosis import DiagnosisRequest, DiagnosisResult
from apps.api.app.schemas.trademark import (
    ApplicationDraftRequest,
    SubmissionGuideResult,
    TrademarkCheckRequest,
    TrademarkCheckResult,
)


class MockTrademarkSearchAdapter(TrademarkSearchPort):
    port_name = "trademarkSearch"
    provider_name = "mock-trademark-search"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def search(self, payload: TrademarkCheckRequest, trace_id: str):
        result = TrademarkCheckResult(
            risk_level="yellow",
            summary=f"Mock 模式下，「{payload.trademark_name}」存在近似项。",
            recommendation="仅用于测试 provider 切换。",
            suggested_categories=payload.categories or ["35"],
            findings=[],
            alternatives=["MockA", "MockB"],
        )
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock data")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload=result,
        )


class MockEnterpriseLookupAdapter(EnterpriseLookupPort):
    port_name = "enterpriseLookup"
    provider_name = "mock-enterprise"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def lookup(self, company_name: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock enterprise")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"name": company_name, "status": "mock"},
        )


class MockPublicWebSearchAdapter(PublicWebSearchPort):
    port_name = "publicWebSearch"
    provider_name = "mock-public-web-search"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def search(self, query: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock public web")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload=[{"title": query, "url": "https://mock.invalid"}],
        )


class MockKnowledgeBaseAdapter(KnowledgeBasePort):
    port_name = "knowledgeBase"
    provider_name = "mock-kb"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def retrieve(self, topic: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock knowledge base")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"topic": topic, "items": []},
        )


class MockLlmAdapter(LLMPort):
    port_name = "llm"
    provider_name = "mock-llm"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def diagnose(self, payload: DiagnosisRequest, knowledge: dict, trace_id: str):
        result = DiagnosisResult(
            summary=f"Mock 诊断：{payload.business_description}",
            priority_assets=["商标：第 35 类"],
            risks=["Mock 风险"],
            next_actions=["Mock 下一步"],
            recommended_track="trademark",
            recommended_trademark_categories=["35"],
        )
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock llm")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload=result,
        )

    def summarize_application(self, payload: ApplicationDraftRequest, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock llm")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"summary": f"Mock application for {payload.trademark_name}", "highlights": []},
        )

    def analyze_text(self, system_prompt: str, user_prompt: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock llm")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"analysis": "Mock 文本分析结果"},
        )

    async def diagnose_stream(
        self,
        payload: DiagnosisRequest,
        knowledge: dict,
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        from apps.api.app.core.streaming import sse_event

        result = DiagnosisResult(
            summary=f"Mock 诊断：{payload.business_description}",
            priority_assets=["商标：第 35 类"],
            risks=["Mock 风险"],
            next_actions=["Mock 下一步"],
            recommended_track="trademark",
            recommended_trademark_categories=["35"],
        )
        envelope = make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock llm")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload=result,
        )
        yield sse_event("meta", {"traceId": trace_id, "provider": self.provider_name, "mode": self.mode})
        for chunk in _split_chunks(result.summary):
            await asyncio.sleep(0.03)
            yield sse_event("token", {"content": chunk})
        yield sse_event("result", envelope.model_dump(by_alias=True))

    async def summarize_application_stream(
        self,
        payload: ApplicationDraftRequest,
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        from apps.api.app.core.streaming import sse_event

        summary_text = f"Mock application for {payload.trademark_name}"
        envelope = make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock llm")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"summary": summary_text, "highlights": []},
        )
        yield sse_event("meta", {"traceId": trace_id, "provider": self.provider_name, "mode": self.mode})
        for chunk in _split_chunks(summary_text):
            await asyncio.sleep(0.03)
            yield sse_event("token", {"content": chunk})
        yield sse_event("result", envelope.model_dump(by_alias=True))

    async def analyze_text_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        from apps.api.app.core.streaming import sse_event

        analysis_text = "Mock 文本分析结果"
        envelope = make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock llm")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"analysis": analysis_text},
        )
        yield sse_event("meta", {"traceId": trace_id, "provider": self.provider_name, "mode": self.mode})
        for chunk in _split_chunks(analysis_text):
            await asyncio.sleep(0.03)
            yield sse_event("token", {"content": chunk})
        yield sse_event("result", envelope.model_dump(by_alias=True))

    async def multi_turn_stream(
        self,
        messages: list[dict[str, str]],
        tools: list[dict],
        system_prompt: str,
        trace_id: str,
    ) -> AsyncGenerator[dict, None]:
        yield {"type": "meta", "provider": self.provider_name, "mode": self.mode}

        last_user = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
        )

        if any(kw in last_user for kw in ("商标", "注册", "查重", "品牌")):
            yield {"type": "tool_call", "name": "trademark_check", "args": {
                "trademark_name": "Mock商标", "business_description": last_user, "categories": ["42"],
            }}
        elif any(kw in last_user for kw in ("诊断", "策略", "保护", "IP情况")):
            yield {"type": "tool_call", "name": "ip_diagnosis", "args": {
                "business_description": last_user,
            }}
        elif any(kw in last_user for kw in ("资产", "台账", "我的IP")):
            yield {"type": "tool_call", "name": "list_assets", "args": {}}
        elif any(kw in last_user for kw in ("申请书", "生成申请")):
            yield {"type": "tool_call", "name": "generate_application", "args": {
                "trademark_name": "Mock商标", "applicant_name": "Mock用户",
                "categories": ["42"], "risk_level": "yellow",
            }}
        elif any(kw in last_user for kw in ("合同", "审查")):
            yield {"type": "tool_call", "name": "contract_review", "args": {
                "contract_text": last_user,
            }}
        elif any(kw in last_user for kw in ("专利", "技术")):
            yield {"type": "tool_call", "name": "patent_assess", "args": {
                "description": last_user,
            }}
        elif any(kw in last_user for kw in ("政策", "补贴", "扶持")):
            yield {"type": "tool_call", "name": "policy_digest", "args": {
                "industry": "软件",
            }}
        else:
            mock_reply = "（Mock）您好！我是A1+ IP Coworker。请告诉我您的知识产权需求，我可以帮您做商标查重、IP诊断、资产查询等。"
            for chunk in _split_chunks(mock_reply):
                await asyncio.sleep(0.03)
                yield {"type": "token", "content": chunk}

        yield {"type": "done"}


def _split_chunks(text: str, size: int = 4) -> list[str]:
    """Split text into chunks for simulated streaming."""
    return [text[i : i + size] for i in range(0, len(text), size)]


class MockDocumentRenderAdapter(DocumentRenderPort):
    port_name = "documentRender"
    provider_name = "mock-document-render"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def render_application(self, payload: ApplicationDraftRequest, summary: dict, trace_id: str) -> tuple[str, str]:
        raise RuntimeError("Mock 渲染不写文件，请切换 real 模式或在测试中打桩")


class MockNotificationAdapter(NotificationPort):
    port_name = "notification"
    provider_name = "mock-notification"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def send_email(self, to_email: str, subject: str, body: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock notification")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"to": to_email, "subject": subject, "sent": False},
        )


class MockMonitoringAdapter(MonitoringPort):
    port_name = "monitoring"
    provider_name = "mock-monitoring"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def scan(self, query: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock monitoring")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"query": query, "alerts": []},
        )

    def get_alerts(self, user_id: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock monitoring")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"alerts": [], "total": 0},
        )


class MockSubmissionGuideAdapter(SubmissionGuidePort):
    port_name = "submissionGuide"
    provider_name = "mock-submission-guide"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def guide(self, draft_id: str, trace_id: str):
        result = SubmissionGuideResult(
            title="Mock 提交流程",
            steps=["Mock step"],
            official_url="https://mock.invalid",
            warning="Mock only",
        )
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock submission guide")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload=result,
        )


class MockCompetitorAdapter(CompetitorPort):
    port_name = "competitor"
    provider_name = "mock-competitor"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def track(self, company_name: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock competitor")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={
                "company": company_name,
                "trademarks": [],
                "patents_count": 0,
                "ip_activity": "low",
            },
        )

    def compare(self, companies: list[str], trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock competitor")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"companies": companies, "comparison": {}},
        )


class MockContractReviewAdapter(ContractReviewPort):
    port_name = "contractReview"
    provider_name = "mock-contract-review"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def review(self, contract_text: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock contract review")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"risks": [], "summary": "Mock review"},
        )


class MockPatentAssistAdapter(PatentAssistPort):
    port_name = "patentAssist"
    provider_name = "mock-patent-assist"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def assess(self, description: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock patent assist")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"assessment": "Mock assessment", "type": "invention"},
        )


class MockPolicyDigestAdapter(PolicyDigestPort):
    port_name = "policyDigest"
    provider_name = "mock-policy-digest"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def digest(self, industry: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock policy digest")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"industry": industry, "policies": []},
        )


class MockDueDiligenceAdapter(DueDiligencePort):
    port_name = "dueDiligence"
    provider_name = "mock-due-diligence"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def investigate(self, company_name: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="mock due diligence")],
            disclaimer="Mock 数据仅用于测试。",
            normalized_payload={"company": company_name, "ip_assets": [], "risks": []},
        )
