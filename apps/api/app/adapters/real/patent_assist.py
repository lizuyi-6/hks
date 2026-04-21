from __future__ import annotations

import logging

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import PatentAssistPort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)

PATENT_ASSESS_SYSTEM_PROMPT = """你是 A1+ IP Coworker 的专利/软著评估助手。根据用户提供的技术描述，评估应该申请专利还是软著，并给出建议。

请输出 JSON 格式：
- recommended_type: 推荐的保护类型 "invention"(发明专利)、"utility_model"(实用新型)、"design"(外观设计)、"software_copyright"(软著)
- novelty_assessment: 新颖性评估描述
- feasibility: 可行性 high/medium/low
- key_points: 申请时需要突出的技术要点列表
- materials_needed: 需要准备的材料清单
- estimated_timeline: 预计时间线
- cost_estimate: 费用估算
- risks: 潜在风险列表

评估标准：
- 软著：适合软件产品，申请简单，保护力度相对较低
- 实用新型：适合有形状/结构改进的产品，审批快
- 发明专利：适合核心技术方案，保护力度最强，审批周期长
- 外观设计：适合产品外观/界面设计

重要提醒：所有评估仅供参考，以官方审查结果为准。"""


class RealPatentAssistAdapter(PatentAssistPort):
    port_name = "patentAssist"
    provider_name = "llm-patent-assist"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def assess(self, description: str, trace_id: str):
        from apps.api.app.adapters.registry import provider_registry
        llm = provider_registry.get("llm")
        llm_result = llm.analyze_text(
            PATENT_ASSESS_SYSTEM_PROMPT,
            f"请评估以下技术描述的知识产权保护方案：\n\n{description}",
            trace_id,
        )

        payload = llm_result.normalized_payload

        if not isinstance(payload, dict) or "recommended_type" not in payload:
            has_software = any(kw in description.lower() for kw in ["软件", "系统", "平台", "app", "程序", "代码"])
            has_hardware = any(kw in description.lower() for kw in ["硬件", "设备", "装置", "结构", "电路"])
            has_algorithm = any(kw in description.lower() for kw in ["算法", "方法", "模型", "流程"])

            recommended = "software_copyright"
            if has_algorithm:
                recommended = "invention"
            elif has_hardware:
                recommended = "utility_model"

            payload = {
                "recommended_type": recommended,
                "novelty_assessment": "需要进一步检索确认新颖性",
                "feasibility": "medium",
                "key_points": ["梳理核心技术方案", "准备技术交底书"],
                "materials_needed": ["技术交底书", "产品截图或原型图", "源代码（如申请软著）"],
                "estimated_timeline": "软著 2-3 个月 / 实用新型 6-8 个月 / 发明专利 18-24 个月",
                "cost_estimate": "软著约 300-500 元 / 实用新型约 2000-3000 元 / 发明专利约 5000-8000 元",
                "risks": ["技术方案可能缺乏新颖性", "保护范围可能过窄"],
            }

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="专利/软著评估引擎", note="基于 LLM + 规则引擎")],
            disclaimer="评估结果由 AI 生成，仅供参考，以官方审查结果为准。",
            normalized_payload=payload,
        )
