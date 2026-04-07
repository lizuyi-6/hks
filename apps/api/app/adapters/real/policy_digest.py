from __future__ import annotations

import logging

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import PolicyDigestPort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)

POLICY_DIGEST_SYSTEM_PROMPT = """你是 A1+ IP Coworker 的行业政策摘要助手。根据指定的行业，整理最新的知识产权相关政策信息。

请输出 JSON 格式：
- industry: 行业名称
- policies: 数组，每个元素包含 title(政策名称)、summary(摘要)、impact(high/medium/low)、effective_date(生效日期，如已知)、source(来源)
- key_changes: 关键变化要点列表
- action_items: 建议用户采取的行动列表
- compliance_notes: 合规提醒

重点关注：
1. 商标法及其实施条例的最新修订
2. 专利审查指南的更新
3. 软件著作权登记政策变化
4. 行业特定的 IP 监管要求
5. 税收优惠政策（如高新技术企业认定）

重要提醒：所有政策信息仅供参考，以官方发布为准。"""


class RealPolicyDigestAdapter(PolicyDigestPort):
    port_name = "policyDigest"
    provider_name = "llm-policy-digest"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def digest(self, industry: str, trace_id: str):
        from apps.api.app.adapters.registry import provider_registry
        llm = provider_registry.get("llm")
        llm_result = llm.analyze_text(
            POLICY_DIGEST_SYSTEM_PROMPT,
            f"请整理 {industry} 行业最新的知识产权相关政策信息。",
            trace_id,
        )

        payload = llm_result.normalized_payload

        if not isinstance(payload, dict) or "policies" not in payload:
            payload = {
                "industry": industry,
                "policies": [
                    {
                        "title": "《商标法》最新修订",
                        "summary": "持续关注商标法修订动态，涉及恶意注册、惩罚性赔偿等。",
                        "impact": "medium",
                        "effective_date": "持续更新",
                        "source": "CNIPA",
                    },
                    {
                        "title": "《专利审查指南》更新",
                        "summary": "涉及软件专利、人工智能相关发明的审查标准更新。",
                        "impact": "high",
                        "effective_date": "持续更新",
                        "source": "CNIPA",
                    },
                ],
                "key_changes": [
                    "加强恶意商标注册打击力度",
                    "软件相关专利审查标准细化",
                    "高新技术企业认定条件调整",
                ],
                "action_items": [
                    "定期关注 CNIPA 官网公告",
                    "审查已有商标是否符合最新要求",
                    "评估是否符合高新技术企业认定条件",
                ],
                "compliance_notes": "建议定期查阅国家知识产权局官网获取最新政策。",
            }

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="行业政策摘要引擎", note=f"行业: {industry}")],
            disclaimer="政策信息由 AI 整理，仅供参考，以官方发布为准。",
            normalized_payload=payload,
        )
