from __future__ import annotations

import logging

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import DueDiligencePort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)

DUE_DILIGENCE_SYSTEM_PROMPT = """你是 A1+ IP Coworker 的融资尽调助手。针对目标公司的知识产权状况进行全面分析，帮助投资人和创业者了解 IP 资产价值和风险。

请输出 JSON 格式：
- company: 公司名称
- ip_portfolio: IP 资产组合概览，包含 trademarks(商标数量)、patents(专利数量)、copyrights(版权数量)、trade_secrets(商业秘密评估)
- strengths: IP 资产优势列表
- risks: IP 风险列表，每个元素包含 risk(风险描述)、severity(high/medium/low)、mitigation(缓解建议)
- valuation_factors: 影响 IP 估值的因素列表
- recommendations: 尽调建议列表
- overall_assessment: 整体评估 high/medium/low

审查维度：
1. IP 资产是否完整布局
2. 是否存在潜在的侵权风险
3. 核心技术是否得到有效保护
4. IP 资产是否存在权属争议
5. 许可和转让协议是否合规
6. 商业秘密保护措施是否到位

重要提醒：所有分析仅供参考，不构成投资建议。应结合专业 IP 律师意见。"""


def _coerce_int(value, default: int = 0) -> int:
    """Best-effort int coercion for values produced by the LLM."""
    if value is None:
        return default
    try:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return default
            return int(float(stripped))
        if isinstance(value, list):
            return len(value)
    except (TypeError, ValueError):
        pass
    return default


def normalize_due_diligence_payload(payload, company_name: str) -> dict:
    """Coerce an LLM payload into the shape the融资尽调 UI expects."""
    if isinstance(payload, dict) and "ip_portfolio" in payload:
        payload.setdefault("company", company_name)
        payload.setdefault("strengths", [])
        payload.setdefault("risks", [])
        payload.setdefault("valuation_factors", [])
        payload.setdefault("recommendations", [])
        payload.setdefault("overall_assessment", "medium")
        # Ensure ip_portfolio has all numeric fields the UI multiplies with;
        # missing fields from the LLM turn into NaN downstream (SVG render errors).
        portfolio = payload.get("ip_portfolio")
        if not isinstance(portfolio, dict):
            portfolio = {}
        portfolio["trademarks"] = _coerce_int(portfolio.get("trademarks"), 0)
        portfolio["patents"] = _coerce_int(portfolio.get("patents"), 0)
        portfolio["copyrights"] = _coerce_int(portfolio.get("copyrights"), 0)
        trade_secrets = portfolio.get("trade_secrets")
        if trade_secrets is None:
            portfolio["trade_secrets"] = "未评估"
        elif not isinstance(trade_secrets, str):
            portfolio["trade_secrets"] = str(trade_secrets)
        payload["ip_portfolio"] = portfolio
        return payload

    fallback_note = ""
    if isinstance(payload, dict):
        fallback_note = payload.get("analysis") or payload.get("summary") or ""
    elif isinstance(payload, str):
        fallback_note = payload

    strengths = ["待进一步尽调确认"]
    if fallback_note:
        strengths = [fallback_note[:500]]

    return {
        "company": company_name,
        "ip_portfolio": {
            "trademarks": 0,
            "patents": 0,
            "copyrights": 0,
            "trade_secrets": "未评估",
        },
        "strengths": strengths,
        "risks": [
            {
                "risk": "IP 资产布局可能不完整",
                "severity": "medium",
                "mitigation": "建议进行全面的 IP 资产盘点",
            },
            {
                "risk": "可能存在未保护的核心技术",
                "severity": "high",
                "mitigation": "建议评估核心技术的保护方案",
            },
        ],
        "valuation_factors": [
            "商标品牌价值",
            "专利技术壁垒",
            "软著资产价值",
            "商业秘密保护水平",
        ],
        "recommendations": [
            "获取公司 IP 资产清单",
            "核查商标注册状态",
            "评估专利质量和保护范围",
            "检查是否存在 IP 权属纠纷",
            "审查员工 IP 转让协议",
        ],
        "overall_assessment": "medium",
    }


class RealDueDiligenceAdapter(DueDiligencePort):
    port_name = "dueDiligence"
    provider_name = "llm-due-diligence"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def investigate(self, company_name: str, trace_id: str):
        from apps.api.app.adapters.registry import provider_registry
        llm = provider_registry.get("llm")
        llm_result = llm.analyze_text(
            DUE_DILIGENCE_SYSTEM_PROMPT,
            f"请对以下公司进行知识产权融资尽调分析：{company_name}",
            trace_id,
        )

        payload = normalize_due_diligence_payload(llm_result.normalized_payload, company_name)

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="融资尽调引擎", note=f"目标公司: {company_name}")],
            disclaimer="尽调分析由 AI 生成，仅供参考，不构成投资建议。应结合专业 IP 律师意见。",
            normalized_payload=payload,
        )
