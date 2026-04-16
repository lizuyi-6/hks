from __future__ import annotations

import json
from difflib import SequenceMatcher

from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.config import get_settings
from apps.api.app.ports.interfaces import TrademarkSearchPort
from apps.api.app.schemas.common import SourceRef
from apps.api.app.schemas.trademark import (
    TrademarkCheckRequest,
    TrademarkCheckResult,
    TrademarkFinding,
)

_VISUALLY_SIMILAR = {
    "0": "Oo", "O": "0o", "1": "lIi", "l": "1Ii", "I": "1li",
    "5": "Ss", "S": "5s", "8": "Bb", "B": "8b",
    "n": "m", "m": "n", "rn": "m",
    "曰": "日", "日": "曰", "己": "已巳", "已": "己巳",
    "未": "末", "末": "未", "戊": "戌", "戌": "戊",
}


def _visual_similarity(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if abs(len(a) - len(b)) > max(len(a), len(b)) * 0.5:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _compute_similarity(query: str, entry_name: str, query_cats: list[str], entry_cat: str) -> int:
    text_sim = _visual_similarity(query, entry_name)

    query_lower = query.lower()
    entry_lower = entry_name.lower()

    prefix_bonus = 0.0
    if query_lower and entry_lower and query_lower[0] == entry_lower[0]:
        prefix_bonus = 0.05

    length_penalty = 0.0
    len_diff = abs(len(query) - len(entry_name))
    if len_diff > 3:
        length_penalty = 0.05 * (len_diff - 3)

    base = text_sim + prefix_bonus - length_penalty

    if query_cats and entry_cat not in query_cats:
        base -= 0.08

    confusable_chars = []
    for char, similars in _VISUALLY_SIMILAR.items():
        if char in query:
            confusable_chars.extend(similars)
    if confusable_chars:
        for c in confusable_chars:
            if c in entry_lower:
                base += 0.03
                break

    return min(max(int(base * 100), 0), 100)


ANALYSIS_SYSTEM_PROMPT = """你是一位资深的商标代理人，擅长商标近似分析和风险评估。

请根据用户提供的信息和初步检索结果，给出专业的商标查重分析报告。

你必须以 JSON 格式返回，包含以下字段：
{
  "summary": "一段200字以内的专业分析摘要，结合商标名称、业务场景和检索结果进行综合评估",
  "riskLevel": "red | yellow | green",
  "recommendation": "具体、可操作的建议，如：建议修改商标名称中的某个字，或建议选择哪些类别",
  "suggestedCategories": ["推荐的尼斯分类号列表"],
  "alternatives": ["建议的替代商标名称，至少3个"]
}

分析要点：
1. 商标名称的独特性和显著性
2. 与现有商标的近似程度（字形、读音、含义）
3. 商品/服务类别的相关性
4. 注册成功概率评估
5. 风险规避建议

注意：只返回 JSON，不要其他文字。"""


class RealTrademarkSearchAdapter(TrademarkSearchPort):
    port_name = "trademarkSearch"
    provider_name = "cnipa-snapshot-llm"
    mode = "real"

    def __init__(self) -> None:
        self.settings = get_settings()

    def availability(self) -> tuple[bool, str | None]:
        path = self.settings.knowledge_base_dir / "snapshots" / "trademark_snapshot.json"
        return path.exists(), None if path.exists() else "trademark snapshot missing"

    def search(self, payload: TrademarkCheckRequest, trace_id: str):
        # Step 1: 规则匹配 — 从快照中检索近似商标
        snapshot_path = self.settings.knowledge_base_dir / "snapshots" / "trademark_snapshot.json"
        entries = json.loads(snapshot_path.read_text(encoding="utf-8"))
        findings: list[TrademarkFinding] = []

        for item in entries["entries"]:
            similarity = _compute_similarity(
                payload.trademark_name, item["name"],
                payload.categories, item["category"],
            )
            if similarity < 40:
                continue

            findings.append(
                TrademarkFinding(
                    name=item["name"],
                    category=item["category"],
                    similarity_score=similarity,
                    status=item["status"],
                    note=item["note"],
                )
            )

        findings.sort(key=lambda f: f.similarity_score, reverse=True)
        top_findings = findings[:8]

        # Step 2: LLM 深度分析
        top_score = top_findings[0].similarity_score if top_findings else 0

        findings_text = "\n".join(
            f"- {f.name}（第{f.category}类，相似度{f.similarity_score}%，状态：{f.status}）{f.note}"
            for f in top_findings
        ) if top_findings else "未发现近似商标"

        user_prompt = (
            f"商标名称：{payload.trademark_name}\n"
            f"申请人：{payload.applicant_name}（{payload.applicant_type}）\n"
            f"业务描述：{payload.business_description or '未提供'}\n"
            f"申请类别：{', '.join(payload.categories) if payload.categories else '未指定'}\n\n"
            f"初步检索结果（共{len(top_findings)}个近似项，最高相似度{top_score}%）：\n"
            f"{findings_text}"
        )

        try:
            from apps.api.app.adapters.registry import provider_registry
            llm = provider_registry.get("llm")
            envelope = llm.analyze_text(ANALYSIS_SYSTEM_PROMPT, user_prompt, trace_id)
            llm_data = envelope.normalized_payload if hasattr(envelope, "normalized_payload") else envelope
            if isinstance(llm_data, dict):
                llm_result = llm_data
            else:
                llm_result = {}
        except Exception:
            llm_result = {}

        # Step 3: 合并 LLM 结果与规则匹配结果
        if llm_result:
            risk_level = llm_result.get("riskLevel") or llm_result.get("risk_level") or (
                "red" if top_score >= 85 else "yellow" if top_score >= 60 else "green"
            )
            summary = llm_result.get("summary", "")
            recommendation = llm_result.get("recommendation", "")
            suggested_categories = llm_result.get("suggestedCategories") or llm_result.get("suggested_categories") or payload.categories or ["35", "42"]
            alternatives = llm_result.get("alternatives", [])
        else:
            risk_level = "red" if top_score >= 85 else "yellow" if top_score >= 60 else "green"
            summary = {
                "green": "未发现直接冲突项，可进入申请书生成。",
                "yellow": f"存在 {len(top_findings)} 个近似商标（最高相似度 {top_score}%），建议查看近似项后再决定是否申请。",
                "red": f"发现 {len(top_findings)} 个明显冲突项（最高相似度 {top_score}%），建议先调整商标名称或类别。",
            }[risk_level]
            recommendation = entries["recommendations"][risk_level]
            suggested_categories = payload.categories or ["35", "42"]
            alternatives = entries["alternatives"].get(risk_level, [])

        if isinstance(suggested_categories, str):
            suggested_categories = [suggested_categories]

        result = TrademarkCheckResult(
            risk_level=risk_level,
            summary=summary,
            recommendation=recommendation,
            suggested_categories=suggested_categories,
            findings=top_findings,
            alternatives=alternatives,
        )

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[
                SourceRef(
                    title="CNIPA 商标快照",
                    url="https://sbj.cnipa.gov.cn/sbj/sbcx/",
                    note="本地结构化快照 + 规则匹配 + LLM 语义分析",
                )
            ],
            disclaimer="结果基于公开商标快照与AI分析，仅供参考，以官方查询系统为准。",
            normalized_payload=result,
        )
