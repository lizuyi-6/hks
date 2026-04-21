"""ProfileEngine — 需求画像引擎.

Combines:
  1. Static profile fields on the `User` (industry, stage, applicant_type).
  2. Behavioral signals (recent diagnoses, trademark checks, assets, monitoring hits).
  3. A short `raw_query` from the user (freeform intent).

Outputs:
  - A list of `UserProfileTag` rows (tag_type / tag_value / confidence)
  - A "fingerprint" dict with intent_category / urgency / budget_range / tags /
    suggested practice areas — used by the MatchingEngine as the query vector.

Keyword heuristics run first (cheap, deterministic, offline). If the query is
non-trivial (more than a few chars) and a field is still missing (intent is
'general', or budget/region unknown), an LLM fallback is attempted via
`LLMPort.analyze_text`. Any LLM failure is logged and the rule-based result
is returned unchanged so the path is always safe.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from apps.api.app.db.models import (
    IpAsset,
    JobRecord,
    ModuleResult,
    User,
    UserProfileTag,
)

logger = logging.getLogger(__name__)


# Intent keyword → category mapping. The first match wins.
INTENT_CATEGORIES: list[tuple[str, list[str]]] = [
    ("trademark", ["商标", "品牌", "logo", "店名", "注册商标", "trademark", "近似"]),
    ("patent", ["专利", "发明", "实用新型", "外观", "patent", "技术方案"]),
    ("copyright", ["软著", "著作权", "copyright", "剽窃", "版权"]),
    ("contract", ["合同", "合作协议", "NDA", "保密", "竞业", "外包协议"]),
    ("litigation", ["起诉", "应诉", "侵权", "维权", "取证", "诉讼", "仿冒"]),
    ("compliance", ["合规", "审计", "体检", "政策", "反垄断", "审核"]),
    ("dueDiligence", ["尽调", "融资", "收购", "投资", "尽职调查"]),
]


URGENCY_KEYWORDS = {
    "urgent": ["急", "尽快", "马上", "立即", "今天", "明天", "抢注", "抢先", "紧急"],
    "low": ["慢慢", "不急", "后面再说", "考虑"],
}


BUDGET_HINTS = [
    (r"([\d,]+)\s*元以下", "lt"),
    (r"([\d,]+)\s*-\s*([\d,]+)", "between"),
    (r"预算\s*([\d,]+)", "eq"),
    (r"不超过\s*([\d,]+)", "lt"),
]


PRACTICE_AREA_MAP = {
    "trademark": ["trademark", "brand", "opposition"],
    "patent": ["patent", "utility", "invention", "hardware"],
    "copyright": ["copyright", "software", "content"],
    "contract": ["contract", "commercial", "labor"],
    "litigation": ["litigation", "enforcement"],
    "compliance": ["compliance", "data", "regulatory"],
    "dueDiligence": ["m&a", "due-diligence", "finance"],
}


def detect_intent_category(text: str) -> tuple[str, float]:
    t = (text or "").lower()
    for category, kws in INTENT_CATEGORIES:
        for kw in kws:
            if kw.lower() in t:
                return category, 0.85
    return "general", 0.5


def detect_urgency(text: str) -> str:
    for kw in URGENCY_KEYWORDS["urgent"]:
        if kw in (text or ""):
            return "urgent"
    for kw in URGENCY_KEYWORDS["low"]:
        if kw in (text or ""):
            return "low"
    return "normal"


def detect_budget(text: str) -> str | None:
    for pattern, mode in BUDGET_HINTS:
        m = re.search(pattern, text or "")
        if m:
            try:
                if mode == "between":
                    return f"{m.group(1)}-{m.group(2)}"
                num = m.group(1).replace(",", "")
                return f"{mode}:{num}"
            except Exception:
                continue
    return None


def detect_region(text: str) -> str | None:
    regions = ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京", "苏州", "重庆"]
    for r in regions:
        if r in (text or ""):
            return r
    return None


# ---------------------------------------------------------------------------
# LLM 兜底抽取 — 仅在关键词方法无法给出高置信度结果时调用。
# ---------------------------------------------------------------------------

_LLM_EXTRACT_SYSTEM_PROMPT = (
    "你是法律服务需求结构化解析器。请从用户一句话需求中抽取以下字段，并严格输出 JSON：\n"
    "{\n"
    '  "intent": "trademark|patent|copyright|contract|litigation|compliance|dueDiligence|general",\n'
    '  "urgency": "urgent|normal|low",\n'
    '  "budget": "数字区间字符串 例如 lt:15000 / 5000-20000 / eq:10000，可为空",\n'
    '  "region": "城市名 例如 上海 / 北京，可为空",\n'
    '  "confidence": 0.0-1.0 数字\n'
    "}\n"
    "不要输出额外解释，不要 Markdown。"
)


def _llm_extract(raw_query: str, trace_id: str = "profile-engine") -> dict[str, Any] | None:
    """用 LLMPort.analyze_text 抽取意图/紧急度/预算/地域。失败返回 None。"""
    try:
        from apps.api.app.adapters.registry import provider_registry

        llm = provider_registry.get("llm")
        envelope = llm.analyze_text(
            system_prompt=_LLM_EXTRACT_SYSTEM_PROMPT,
            user_prompt=raw_query,
            trace_id=trace_id,
        )
        payload = getattr(envelope, "normalized_payload", None) or getattr(envelope, "normalizedPayload", None)
        if isinstance(payload, dict):
            return payload
        raw = payload if isinstance(payload, str) else None
        if raw:
            try:
                return json.loads(raw)
            except Exception:
                return None
    except Exception as exc:
        logger.info("profile LLM fallback failed: %s", exc)
        return None
    return None


def _behavior_tags(db: Session, user: User) -> list[dict[str, Any]]:
    tags: list[dict[str, Any]] = []
    since = datetime.now(timezone.utc) - timedelta(days=90)

    # Recent diagnosis runs
    diagnoses = (
        db.query(ModuleResult)
        .filter(ModuleResult.user_id == user.id)
        .filter(ModuleResult.module_type.in_(["diagnosis", "trademark_check"]))
        .filter(ModuleResult.created_at >= since)
        .order_by(ModuleResult.created_at.desc())
        .limit(5)
        .all()
    )
    if diagnoses:
        tags.append({
            "tag_type": "behavior",
            "tag_value": f"recent_tool_use:{len(diagnoses)}",
            "confidence": 0.9,
            "evidence": {"count": len(diagnoses)},
        })

    # Assets
    assets = db.query(IpAsset).filter(IpAsset.owner_id == user.id).all()
    if assets:
        by_type: dict[str, int] = {}
        for a in assets:
            by_type[a.asset_type] = by_type.get(a.asset_type, 0) + 1
        for t, c in by_type.items():
            tags.append({
                "tag_type": "asset",
                "tag_value": f"has_{t}:{c}",
                "confidence": 1.0,
                "evidence": {"count": c},
            })
        expiring = [a for a in assets if a.expires_at and a.expires_at <= datetime.now(timezone.utc) + timedelta(days=90)]
        if expiring:
            tags.append({
                "tag_type": "behavior",
                "tag_value": f"expiring_soon:{len(expiring)}",
                "confidence": 1.0,
                "evidence": {"count": len(expiring)},
            })

    # Failed / unresolved jobs = high-signal frustration
    failed = (
        db.query(JobRecord)
        .filter(JobRecord.status == "failed")
        .filter(JobRecord.created_at >= since)
        .count()
    )
    if failed:
        tags.append({
            "tag_type": "behavior",
            "tag_value": f"failed_jobs:{failed}",
            "confidence": 0.8,
            "evidence": {},
        })
    return tags


def _static_tags(user: User) -> list[dict[str, Any]]:
    tags: list[dict[str, Any]] = []
    if user.industry:
        tags.append({"tag_type": "industry", "tag_value": user.industry, "confidence": 1.0, "evidence": {}})
    if user.stage:
        tags.append({"tag_type": "stage", "tag_value": user.stage, "confidence": 1.0, "evidence": {}})
    if user.applicant_type:
        tags.append({"tag_type": "applicantType", "tag_value": user.applicant_type, "confidence": 1.0, "evidence": {}})
    if user.has_trademark:
        tags.append({"tag_type": "asset", "tag_value": "has_trademark:existing", "confidence": 1.0, "evidence": {}})
    if user.has_patent:
        tags.append({"tag_type": "asset", "tag_value": "has_patent:existing", "confidence": 1.0, "evidence": {}})
    if user.ip_focus:
        for focus in (user.ip_focus or "").split(","):
            if focus.strip():
                tags.append({"tag_type": "focus", "tag_value": focus.strip(), "confidence": 0.9, "evidence": {}})
    return tags


def build_profile_fingerprint(
    db: Session,
    user: User,
    raw_query: str,
    persist: bool = True,
) -> dict[str, Any]:
    """Analyze a raw query + user state, persist tags, return fingerprint dict."""

    intent, intent_conf = detect_intent_category(raw_query)
    urgency = detect_urgency(raw_query)
    budget = detect_budget(raw_query)
    region = detect_region(raw_query)

    # LLM 兜底：当关键词法命中较弱且用户有输入时调用一次（Doubao 已硬编码始终可用）
    llm_used = False
    if (
        (raw_query or "").strip()
        and len((raw_query or "").strip()) >= 6
        and (intent == "general" or budget is None or region is None)
    ):
        llm_result = _llm_extract(raw_query)
        if llm_result:
            llm_used = True
            l_intent = str(llm_result.get("intent") or "").strip()
            l_conf = float(llm_result.get("confidence") or 0.0)
            if intent == "general" and l_intent and l_intent != "general":
                intent = l_intent
                intent_conf = max(intent_conf, min(0.95, l_conf or 0.75))
            l_urgency = str(llm_result.get("urgency") or "").strip()
            if urgency == "normal" and l_urgency in {"urgent", "low"}:
                urgency = l_urgency
            if not budget:
                lb = llm_result.get("budget")
                if lb and isinstance(lb, str) and lb.strip():
                    budget = lb.strip()
            if not region:
                lr = llm_result.get("region")
                if lr and isinstance(lr, str) and lr.strip():
                    region = lr.strip()

    if not region:
        region = "全国"

    query_tags: list[dict[str, Any]] = [{
        "tag_type": "intent",
        "tag_value": intent,
        "confidence": intent_conf,
        "source": "query",
        "evidence": {"query": raw_query[:200]},
    }]
    if urgency != "normal":
        query_tags.append({"tag_type": "urgency", "tag_value": urgency, "confidence": 0.85, "source": "query", "evidence": {}})
    if budget:
        query_tags.append({"tag_type": "budget", "tag_value": budget, "confidence": 0.85, "source": "query", "evidence": {}})
    if region != "全国":
        query_tags.append({"tag_type": "region", "tag_value": region, "confidence": 0.9, "source": "query", "evidence": {}})

    static = [{**t, "source": "profile"} for t in _static_tags(user)]
    behavior = [{**t, "source": "behavior"} for t in _behavior_tags(db, user)]
    all_tags = query_tags + static + behavior

    if persist:
        # Upsert semantics: remove stale tags older than 30 days for this user,
        # then insert fresh ones. This keeps the table bounded and fresh.
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        db.query(UserProfileTag).filter(
            UserProfileTag.user_id == user.id,
            UserProfileTag.created_at < cutoff,
        ).delete(synchronize_session=False)
        for t in all_tags:
            db.add(UserProfileTag(
                user_id=user.id,
                tag_type=t["tag_type"],
                tag_value=t["tag_value"],
                confidence=t["confidence"],
                source=t.get("source", "system"),
                evidence=t.get("evidence") or {},
            ))
        db.commit()

    # Build the "vector" — actually a sparse dict of tags with weights for the
    # rule-based reranker. Swap for a real embedding later.
    vector_tags = set()
    vector_tags.add(intent)
    for t in all_tags:
        if t["tag_type"] in ("focus", "industry", "intent"):
            vector_tags.add(str(t["tag_value"]).lower())
    vector_tags.update(PRACTICE_AREA_MAP.get(intent, []))

    fingerprint: dict[str, Any] = {
        "intent_category": intent,
        "intent_confidence": intent_conf,
        "urgency": urgency,
        "budget": budget,
        "region": region,
        "industry": user.industry,
        "stage": user.stage,
        "tags": sorted(vector_tags),
        "tags_detailed": all_tags,
        "raw_query": raw_query,
        "suggested_practice_areas": PRACTICE_AREA_MAP.get(intent, []),
        "llm_used": llm_used,
    }
    logger.info(
        "profile fingerprint built",
        extra={"user_id": user.id, "intent": intent, "llm_used": llm_used},
    )
    return fingerprint


def list_user_tags(db: Session, user_id: str, limit: int = 50) -> list[UserProfileTag]:
    return (
        db.query(UserProfileTag)
        .filter(UserProfileTag.user_id == user_id)
        .order_by(UserProfileTag.created_at.desc())
        .limit(limit)
        .all()
    )
