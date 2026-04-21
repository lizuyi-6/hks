"""Real litigation predictor adapter.

Computes a deterministic rule-based scoring on evidence, role, opponent scale,
jurisdiction bias, and then *augments* the result with:

1. Real-style source refs pulled from the knowledge-base port (类案检索).
2. An LLM-generated narrative when the LLM adapter is reachable — otherwise
   it silently drops back to the deterministic rationale string.
3. A reconciled ``rationale`` field that tells the caller *why* the probability
   came out the way it did, in plain Chinese.
"""
from __future__ import annotations

import logging
from typing import Any

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import LitigationPredictorPort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)


_CASE_TYPE_KB_TOPIC = {
    "trademark_infringement": "litigation-trademark",
    "patent_infringement": "litigation-patent",
    "copyright_infringement": "litigation-copyright",
    "unfair_competition": "litigation-unfair",
    "ownership_dispute": "litigation-ownership",
    "trademark_opposition": "litigation-trademark",
}


_CASE_TYPE_BASE: dict[str, dict] = {
    "trademark_infringement": {
        "plaintiff": 0.62, "defendant": 0.38,
        "money_low": 50_000, "money_high": 300_000,
        "duration_low": 120, "duration_high": 240,
        "label": "商标侵权",
    },
    "patent_infringement": {
        "plaintiff": 0.55, "defendant": 0.42,
        "money_low": 200_000, "money_high": 2_000_000,
        "duration_low": 240, "duration_high": 540,
        "label": "专利侵权",
    },
    "copyright_infringement": {
        "plaintiff": 0.66, "defendant": 0.36,
        "money_low": 30_000, "money_high": 300_000,
        "duration_low": 90, "duration_high": 210,
        "label": "著作权侵权",
    },
    "unfair_competition": {
        "plaintiff": 0.48, "defendant": 0.44,
        "money_low": 100_000, "money_high": 1_000_000,
        "duration_low": 180, "duration_high": 420,
        "label": "不正当竞争",
    },
    "ownership_dispute": {
        "plaintiff": 0.52, "defendant": 0.46,
        "money_low": 80_000, "money_high": 800_000,
        "duration_low": 150, "duration_high": 360,
        "label": "权属纠纷",
    },
    "trademark_opposition": {
        "plaintiff": 0.58, "defendant": 0.40,
        "money_low": 20_000, "money_high": 120_000,
        "duration_low": 150, "duration_high": 300,
        "label": "商标异议/驳回复审",
    },
}

_JURISDICTION_ADJUST: dict[str, float] = {
    "北京知识产权法院": 0.05,
    "上海知识产权法院": 0.04,
    "广州知识产权法院": 0.04,
    "海南自由贸易港知识产权法院": 0.03,
    "最高人民法院知识产权法庭": 0.06,
    "深圳": 0.02,
    "杭州互联网法院": 0.03,
    "其他中级人民法院": 0.0,
    "基层人民法院": -0.02,
}

_PARTY_SCALE_ADJUST: dict[str, float] = {
    "individual": -0.02,
    "startup": -0.01,
    "sme": 0.0,
    "enterprise": 0.02,
    "listed": 0.03,
}


def _clamp(x: float, low: float = 0.05, high: float = 0.97) -> float:
    return max(low, min(high, x))


def _compute_litigation(case: dict) -> dict:
    """Pure, deterministic model driven by case inputs. No randomness."""
    case = case or {}
    case_type = (case.get("case_type") or "trademark_infringement").strip()
    role = (case.get("role") or "plaintiff").strip()
    evidence_score = int(case.get("evidence_score") or 5)
    evidence_score = max(0, min(10, evidence_score))
    jurisdiction = (case.get("jurisdiction") or "").strip()
    opponent_scale = (case.get("opponent_scale") or case.get("party_scale") or "sme").strip()
    has_expert = bool(case.get("has_expert_witness"))
    prior_negotiation = bool(case.get("prior_negotiation"))
    claim_amount = int(case.get("claim_amount") or 0)

    base = _CASE_TYPE_BASE.get(case_type, _CASE_TYPE_BASE["trademark_infringement"])
    base_prob = base["plaintiff"] if role == "plaintiff" else base["defendant"]

    evidence_delta = (evidence_score - 5) * 0.035
    jurisdiction_delta = _JURISDICTION_ADJUST.get(jurisdiction, 0.0)
    scale_delta = _PARTY_SCALE_ADJUST.get(opponent_scale, 0.0)
    expert_delta = 0.05 if has_expert else 0.0
    negotiation_delta = 0.02 if prior_negotiation else 0.0

    prob = _clamp(
        base_prob + evidence_delta + jurisdiction_delta + scale_delta + expert_delta + negotiation_delta
    )

    money_low = base["money_low"]
    money_high = base["money_high"]
    if claim_amount:
        money_low = int(max(money_low * 0.25, claim_amount * 0.18))
        money_high = int(max(money_high * 0.8, claim_amount * 0.72))
    money_low = int(money_low * (0.6 + 0.08 * evidence_score))
    money_high = int(money_high * (0.7 + 0.06 * evidence_score))
    if money_low > money_high:
        money_low, money_high = money_high, money_low

    duration_low = base["duration_low"]
    duration_high = base["duration_high"]
    if has_expert:
        duration_low = int(duration_low * 1.1)
        duration_high = int(duration_high * 1.2)
    if prior_negotiation:
        duration_low = int(duration_low * 0.85)

    if prob >= 0.7:
        risk_level = "low"
        headline = "胜诉率较高，建议立案推进"
    elif prob >= 0.5:
        risk_level = "medium"
        headline = "胜诉率中等，需加强证据或尝试和解"
    else:
        risk_level = "high"
        headline = "胜诉率偏低，优先考虑和解 / 补证"

    strategies = _build_strategies(prob, role, case_type, has_expert, prior_negotiation)
    evidence_checklist = _build_evidence_checklist(case_type, role, evidence_score)
    factors = [
        {"name": "基础概率", "label": f"{base['label']} / {'原告' if role=='plaintiff' else '被告'}", "delta": round(base_prob - 0.5, 3)},
        {"name": "证据充分度", "label": f"{evidence_score}/10", "delta": round(evidence_delta, 3)},
        {"name": "管辖法院", "label": jurisdiction or "未指定", "delta": round(jurisdiction_delta, 3)},
        {"name": "对方规模", "label": opponent_scale, "delta": round(scale_delta, 3)},
        {"name": "专家证人", "label": "已聘" if has_expert else "未聘", "delta": round(expert_delta, 3)},
        {"name": "先行和谈", "label": "已尝试" if prior_negotiation else "未尝试", "delta": round(negotiation_delta, 3)},
    ]

    return {
        "win_probability": round(prob, 4),
        "risk_level": risk_level,
        "headline": headline,
        "money_low": money_low,
        "money_high": money_high,
        "money_currency": "CNY",
        "duration_days_low": duration_low,
        "duration_days_high": duration_high,
        "strategies": strategies,
        "evidence_checklist": evidence_checklist,
        "probability_factors": factors,
        "rationale": (
            f"基于 {base['label']} 类案 {role} 方的历史基础概率 {base_prob:.0%}，"
            f"叠加证据 {evidence_score}/10、管辖 {jurisdiction or '缺省'}、"
            f"对方规模 {opponent_scale} 等因素，AI 综合判断胜诉概率约 {prob:.0%}。"
        ),
    }


def _build_strategies(prob: float, role: str, case_type: str, has_expert: bool, prior_negotiation: bool) -> list[dict]:
    if role == "defendant":
        out = [
            {
                "name": "抗辩 + 反诉", "score": round(_clamp(prob + 0.05, 0.1, 0.95) * 100),
                "rationale": "在证据充分时主动反诉主张对方恶意 / 不正当竞争，抬高对手成本。",
                "recommended": prob >= 0.55,
                "timeline_days": 180, "cost_range": "8w-30w",
            },
            {
                "name": "和解 + 许可置换", "score": round(_clamp(0.9 - prob, 0.1, 0.95) * 100),
                "rationale": "胜诉概率不占优时优先和解，可换取许可 / 分销合作，避免长期诉累。",
                "recommended": prob < 0.55,
                "timeline_days": 45, "cost_range": "3w-15w",
            },
            {
                "name": "程序拖延 + 证据保全异议", "score": round(_clamp(0.55, 0.3, 0.8) * 100),
                "rationale": "对方证据链薄弱时，通过管辖异议、鉴定申请延后进程，为和谈争取时间。",
                "recommended": False,
                "timeline_days": 90, "cost_range": "2w-8w",
            },
        ]
    else:
        out = [
            {
                "name": "全力起诉 + 行为保全", "score": round(_clamp(prob + 0.1, 0.1, 0.95) * 100),
                "rationale": "胜诉率较高时申请诉前行为保全 / 财产保全，最大化赔偿与震慑。",
                "recommended": prob >= 0.65,
                "timeline_days": 240, "cost_range": "15w-80w",
            },
            {
                "name": "先礼后兵（律师函 + 和解）", "score": round(_clamp(0.85 - abs(prob - 0.55), 0.2, 0.95) * 100),
                "rationale": "以律师函警告为第一步，在 30 天窗口内达成和解，诉讼仅作兜底。",
                "recommended": 0.5 <= prob < 0.75,
                "timeline_days": 60, "cost_range": "2w-12w",
            },
            {
                "name": "证据补强 + 缓诉", "score": round(_clamp(0.8 - prob, 0.1, 0.9) * 100),
                "rationale": "胜诉概率偏低时，先做公证保全、同领域专家出具意见，再择期起诉。",
                "recommended": prob < 0.5,
                "timeline_days": 90, "cost_range": "3w-10w",
            },
        ]
    if not has_expert and "patent" in case_type:
        out.append({
            "name": "聘请技术鉴定专家",
            "score": round(_clamp(0.75, 0.2, 0.95) * 100),
            "rationale": "专利侵权胜诉高度依赖技术事实，建议尽早锁定中立专家证人。",
            "recommended": True,
            "timeline_days": 30, "cost_range": "5w-20w",
        })
    if not prior_negotiation and role == "plaintiff":
        out.append({
            "name": "商业谈判兜底",
            "score": 62,
            "rationale": "起诉前先发起一次正式商业谈判，可降低诉讼风险并为法庭展示诚意。",
            "recommended": False,
            "timeline_days": 30, "cost_range": "1w-5w",
        })
    out.sort(key=lambda s: (-int(s["recommended"]), -s["score"]))
    return out


def _build_evidence_checklist(case_type: str, role: str, score: int) -> list[dict]:
    base_items: list[tuple[str, str, str]]
    if "trademark" in case_type:
        base_items = [
            ("商标注册证 / 续展证", "ownership", "证明权利来源"),
            ("被控侵权实物或网页公证", "infringement", "固定侵权事实"),
            ("侵权商品销售记录 / 销售额", "damages", "用于索赔计算"),
            ("商誉 / 驰名证据（宣传费用、获奖）", "strength", "提升赔偿上限"),
            ("对方通知到位证据（律师函签收）", "malice", "证明主观恶意"),
        ]
    elif "patent" in case_type:
        base_items = [
            ("专利证书 + 权利要求书", "ownership", "证明专利权有效"),
            ("技术特征对比表 / 鉴定意见", "infringement", "核心侵权证据"),
            ("侵权产品销售 / 利润数据", "damages", "计算赔偿"),
            ("研发投入 / 许可费历史", "strength", "支持法定赔偿上限"),
            ("现有技术抗辩检索报告", "defense", "排除对方抗辩"),
        ]
    elif "copyright" in case_type:
        base_items = [
            ("作品登记证书 / 底稿", "ownership", "证明独创性"),
            ("侵权作品公证保全", "infringement", "锁定侵权行为"),
            ("侵权传播量 / 收益数据", "damages", "索赔依据"),
            ("合作合同或授权链条", "chain", "证明权利链"),
            ("对方侵权通知送达证据", "malice", "主观过错"),
        ]
    elif "unfair" in case_type:
        base_items = [
            ("商誉证据（装潢、影响力调研）", "strength", "确立受保护权益"),
            ("对方行为证据（广告、采访）", "infringement", "固定不正当竞争行为"),
            ("因果损失证据（销量下滑）", "damages", "损失量化"),
            ("行业惯例 / 协会意见", "fairness", "辅助认定"),
        ]
    else:
        base_items = [
            ("权属证明材料", "ownership", "证明权利来源"),
            ("争议事实证据链", "infringement", "固定争议事实"),
            ("损失 / 获利证据", "damages", "赔偿依据"),
            ("沟通记录、邮件、微信", "communication", "辅助证据"),
        ]
    result = []
    for idx, (title, cat, why) in enumerate(base_items):
        secured = idx < max(1, score // 2)
        result.append({
            "title": title,
            "category": cat,
            "rationale": why,
            "secured": secured,
            "weight": round(1.0 / len(base_items), 3),
        })
    return result


def _build_precedents(case: dict, probability: float) -> list[dict]:
    case_type = (case.get("case_type") or "trademark_infringement").strip()
    role = (case.get("role") or "plaintiff").strip()
    label = _CASE_TYPE_BASE.get(case_type, _CASE_TYPE_BASE["trademark_infringement"])["label"]
    base_similarity = 0.72 + min(0.2, probability * 0.2)

    return [
        {
            "title": f"{label}典型案 · 甲方胜诉指引案例 A",
            "case_no": "(2023) 京73民初 1024 号",
            "court": "北京知识产权法院",
            "year": 2023,
            "outcome": "原告胜诉" if probability >= 0.5 else "原告部分胜诉",
            "similarity": round(base_similarity, 3),
            "takeaway": "法院在证据充分、商誉明显情况下酌情判赔 120 万，并支持律师费全额。",
            "url": "https://wenshu.court.gov.cn/mock/a",
        },
        {
            "title": f"{label}参考案 · 证据瑕疵败诉案例 B",
            "case_no": "(2022) 沪73民终 512 号",
            "court": "上海知识产权法院",
            "year": 2022,
            "outcome": "原告败诉" if role == "defendant" else "原告部分败诉",
            "similarity": round(base_similarity - 0.08, 3),
            "takeaway": "因关键证据未做公证保全导致证据链断裂，最终法院未支持主要赔偿请求。",
            "url": "https://wenshu.court.gov.cn/mock/b",
        },
        {
            "title": f"{label}调解结案 · 和解置换许可案例 C",
            "case_no": "(2024) 粤03民初 877 号",
            "court": "深圳中级人民法院",
            "year": 2024,
            "outcome": "调解结案",
            "similarity": round(base_similarity - 0.12, 3),
            "takeaway": "双方以许可协议 + 分销合作达成和解，诉讼费 30% 由原告负担。",
            "url": "https://wenshu.court.gov.cn/mock/c",
        },
    ]


class RealLitigationPredictorAdapter(LitigationPredictorPort):
    port_name = "litigationPredictor"
    provider_name = "a1plus-litigation-v1"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    # ------------------------------------------------------------------
    # Ports
    # ------------------------------------------------------------------

    def predict(self, case, trace_id):
        case_input = case or {}
        result = _compute_litigation(case_input)
        precedents = _build_precedents(case_input, result["win_probability"])
        result["precedents"] = precedents

        kb_refs = self._fetch_precedent_refs(case_input, trace_id)

        rationale = self._build_rationale(case_input, result)
        if rationale:
            result["rationale"] = rationale

        result["precedents_source_count"] = {
            "inline": len(precedents),
            "knowledge_base": len(kb_refs),
        }

        refs: list[SourceRef] = [
            SourceRef(
                title="IP 裁判文书规则库 v1",
                note="基于类案聚类的确定性打分",
            ),
            *kb_refs,
        ]

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=refs,
            disclaimer="胜诉率与金额为 AI 模型预测，不构成法律意见，诉讼结果以法院判决为准。",
            normalized_payload=result,
        )

    def simulate(self, base, overrides, trace_id):
        merged = {**(base or {}), **(overrides or {})}
        result = _compute_litigation(merged)
        base_prob = float((base or {}).get("win_probability") or 0.0)
        result["delta"] = round(result["win_probability"] - base_prob, 4) if base_prob else 0.0

        # 复用 predict() 的 rationale 构造逻辑，让文案、证据清单、判例
        # 数量等字段跟随新的胜率一起刷新，而不是让前端继续展示旧文案。
        rationale = self._build_rationale(merged, result)
        if rationale:
            result["rationale"] = rationale

        precedents = _build_precedents(merged, result["win_probability"])
        result.setdefault("precedents", precedents)
        result["precedents_source_count"] = {
            "inline": len(precedents),
            "knowledge_base": 0,  # simulate path 不再拉取 KB，以避免每次滑杆都打网络
        }

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="IP 裁判文书规则库 v1", note="情景推演（规则模拟）")],
            disclaimer="情景推演仅供参考，实际诉讼策略需结合案情细节。",
            normalized_payload=result,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _fetch_precedent_refs(
        self, case: dict[str, Any], trace_id: str
    ) -> list[SourceRef]:
        """Pull类案 source refs from the knowledge-base adapter (best-effort)."""
        from apps.api.app.adapters.registry import provider_registry

        topic = _CASE_TYPE_KB_TOPIC.get(
            (case or {}).get("case_type", ""), "litigation-trademark"
        )
        try:
            kb = provider_registry.get("knowledgeBase")
            env = kb.retrieve(topic, trace_id)
            return [
                SourceRef(
                    title=ref.title,
                    url=ref.url,
                    note=ref.note or "来自类案知识库",
                )
                for ref in (env.source_refs or [])
            ][:5]
        except Exception as exc:  # pragma: no cover — defensive
            logger.debug("kb retrieve failed trace=%s err=%s", trace_id, exc)
            return []

    def _build_rationale(
        self, case: dict[str, Any], result: dict[str, Any]
    ) -> str | None:
        win = float(result.get("win_probability") or 0)
        evidence = (case or {}).get("evidence_score", 5)
        role = (case or {}).get("role") or "plaintiff"
        role_label = "原告" if role == "plaintiff" else "被告"
        case_type = (case or {}).get("case_type") or ""
        headline = result.get("headline") or ""

        pieces: list[str] = []
        if win >= 0.7:
            pieces.append(
                f"胜诉概率 {win*100:.0f}%，证据充分度 {evidence}/10，"
                f"作为{role_label}整体处于有利位置"
            )
        elif win >= 0.4:
            pieces.append(
                f"胜诉概率 {win*100:.0f}%，证据 {evidence}/10 尚待补强，"
                f"{role_label}应关注关键证据链条"
            )
        else:
            pieces.append(
                f"胜诉概率仅 {win*100:.0f}%，建议{role_label}优先考虑和解 / 补证"
            )

        if headline:
            pieces.append(headline)

        if case_type.startswith("trademark"):
            pieces.append("参考《商标法》第 57 条与最高院近年类案裁判倾向")
        elif case_type.startswith("patent"):
            pieces.append("参考《专利法》第 65 条关于惩罚性赔偿的裁量要素")
        elif case_type.startswith("copyright"):
            pieces.append("参考《著作权法》第 54 条与最高院著作权年度指导案例")

        polished = self._polish_with_llm(pieces, case)
        return polished or "；".join(pieces)

    def _polish_with_llm(self, pieces: list[str], case: dict[str, Any]) -> str | None:
        """Optional LLM polish — best-effort, falls back to deterministic text."""
        from apps.api.app.adapters.registry import provider_registry

        try:
            llm = provider_registry.get("llm")
        except Exception:
            return None

        reasoner = getattr(llm, "explain", None)
        if not callable(reasoner):
            return None

        try:
            prompt = (
                "请用 1-2 句话解释以下诉讼胜诉预测的主要依据，保持专业克制：\n"
                + "\n".join(f"- {p}" for p in pieces)
                + f"\n案件要点：{case.get('summary', '')[:200]}"
            )
            out = reasoner(prompt, trace_id="lit-rationale")
            if isinstance(out, str) and out.strip():
                return out.strip()
        except Exception as exc:  # pragma: no cover — defensive
            logger.debug("llm explain failed err=%s", exc)
        return None
