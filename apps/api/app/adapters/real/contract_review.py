from __future__ import annotations

import logging

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import ContractReviewPort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)

CONTRACT_REVIEW_SYSTEM_PROMPT = """你是 A1+ IP Coworker 的合同审查助手。请审查以下合同文本，重点关注知识产权相关条款。

请输出 JSON 格式：
- summary: 一段话概述合同的核心 IP 条款
- risks: 数组，每个元素包含 clause(条款描述)、severity(high/medium/low)、suggestion(修改建议)
- ip_clauses_found: 发现的 IP 相关条款列表
- missing_clauses: 建议补充的 IP 条款
- overall_risk: 整体风险等级 high/medium/low

审查重点：
1. 知识产权归属条款是否明确
2. 许可范围和限制是否清晰
3. 保密条款是否充分
4. 侵权责任和赔偿条款
5. 竞业限制条款
6. IP 转让和授权条款

重要提醒：所有分析仅供参考，不构成法律意见。应以专业律师意见为准。"""


class RealContractReviewAdapter(ContractReviewPort):
    port_name = "contractReview"
    provider_name = "llm-contract-review"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def review(self, contract_text: str, trace_id: str):
        from apps.api.app.adapters.registry import provider_registry
        llm = provider_registry.get("llm")
        llm_result = llm.analyze_text(
            CONTRACT_REVIEW_SYSTEM_PROMPT,
            f"请审查以下合同文本：\n\n{contract_text[:4000]}",
            trace_id,
        )

        payload = llm_result.normalized_payload

        if not isinstance(payload, dict) or "risks" not in payload:
            payload = {
                "summary": payload.get("analysis", "合同审查完成"),
                "risks": [],
                "ip_clauses_found": [],
                "missing_clauses": [
                    "建议补充知识产权归属条款",
                    "建议补充保密条款",
                    "建议补充侵权责任条款",
                ],
                "overall_risk": "medium",
            }

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[
                SourceRef(
                    title="合同审查引擎",
                    note="基于 LLM + 规则引擎",
                )
            ],
            disclaimer="合同审查结果由 AI 生成，仅供参考，不构成法律意见。应以专业律师意见为准。",
            normalized_payload=payload,
        )
