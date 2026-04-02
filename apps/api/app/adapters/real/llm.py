from __future__ import annotations

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import LLMPort
from apps.api.app.schemas.common import SourceRef
from apps.api.app.schemas.diagnosis import DiagnosisRequest, DiagnosisResult
from apps.api.app.schemas.trademark import ApplicationDraftRequest


class RealRuleLlmAdapter(LLMPort):
    port_name = "llm"
    provider_name = "rules-engine"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def diagnose(self, payload: DiagnosisRequest, knowledge: dict, trace_id: str):
        description = payload.business_description
        lowered = description.lower()

        categories = ["35"]
        if "软件" in description or "saas" in lowered or "系统" in description:
            categories.append("42")
        if "教育" in description or "课程" in description:
            categories.append("41")
        if "服装" in description or "饰品" in description:
            categories.append("25")

        priority_assets = [f"商标：建议优先覆盖第 {', '.join(categories)} 类"]
        if "软件" in description or "代码" in description or "平台" in description:
            priority_assets.append("软件著作权：建议同步准备软著登记材料")
        if "方法" in description or "算法" in description or "硬件" in description:
            priority_assets.append("专利：如存在核心技术方案，建议评估专利布局")

        risks = [
            "如果名称检索不足，可能在提交前后发现近似商标。",
            "若宣传语和品牌元素不统一，后续保护成本会提高。",
        ]
        next_actions = [
            "先执行商标查重并确认核心类别。",
            "根据结果生成申请书并由申请人自行提交至官方系统。",
            "生成后自动入台账，建立 90/60/30/7 天提醒。",
        ]

        result = DiagnosisResult(
            summary=f"基于当前业务描述，建议优先从品牌名称保护切入，并把提交准备与后续台账管理串成一条流程。",
            priority_assets=priority_assets,
            risks=risks,
            next_actions=next_actions,
            recommended_track="trademark",
            recommended_trademark_categories=categories,
        )

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="规则引擎", note="基于产品文档的首版结构化策略")],
            disclaimer="诊断结果由规则引擎结合知识库生成，仅供参考，以官方为准。",
            normalized_payload=result,
        )

    def summarize_application(self, payload: ApplicationDraftRequest, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="申请书摘要引擎", note="结构化模板摘要")],
            disclaimer="申请书摘要由规则引擎生成，仅供参考，以官方为准。",
            normalized_payload={
                "summary": f"为商标「{payload.trademark_name}」生成申请书，申请人 {payload.applicant_name}，类别 {', '.join(payload.categories)}。",
                "highlights": [
                    "已包含类别建议与风险提示",
                    "已包含用户自行提交的流程提醒",
                ],
            },
        )

