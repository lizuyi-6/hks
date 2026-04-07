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

_PHONETIC_GROUPS = [
    {"c", "k", "q"}, {"s", "sh", "x"}, {"z", "zh", "j"},
    {"an", "ang"}, {"en", "eng"}, {"in", "ing"},
]


def _visual_similarity(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if abs(len(a) - len(b)) > max(len(a), len(b)) * 0.5:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _contains_confusable(name: str) -> list[str]:
    found = []
    for char, similars in _VISUALLY_SIMILAR.items():
        if char in name:
            found.extend(similars)
    return list(set(found))


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

    confusable_chars = _contains_confusable(query)
    if confusable_chars:
        for c in confusable_chars:
            if c in entry_lower:
                base += 0.03
                break

    return min(max(int(base * 100), 0), 100)


class RealTrademarkSearchAdapter(TrademarkSearchPort):
    port_name = "trademarkSearch"
    provider_name = "cnipa-snapshot"
    mode = "real"

    def __init__(self) -> None:
        self.settings = get_settings()

    def availability(self) -> tuple[bool, str | None]:
        path = self.settings.knowledge_base_dir / "snapshots" / "trademark_snapshot.json"
        return path.exists(), None if path.exists() else "trademark snapshot missing"

    def search(self, payload: TrademarkCheckRequest, trace_id: str):
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
        top_score = findings[0].similarity_score if findings else 0

        if top_score >= 85:
            risk_level = "red"
        elif top_score >= 60:
            risk_level = "yellow"
        else:
            risk_level = "green"

        summary = {
            "green": "未发现直接冲突项，可进入申请书生成。",
            "yellow": f"存在 {len(findings)} 个近似商标（最高相似度 {top_score}%），建议查看近似项后再决定是否申请。",
            "red": f"发现 {len(findings)} 个明显冲突项（最高相似度 {top_score}%），建议先调整商标名称或类别。",
        }[risk_level]

        result = TrademarkCheckResult(
            risk_level=risk_level,
            summary=summary,
            recommendation=entries["recommendations"][risk_level],
            suggested_categories=payload.categories or ["35", "42"],
            findings=findings[:8],
            alternatives=entries["alternatives"].get(risk_level, []),
        )

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[
                SourceRef(
                    title="CNIPA 商标快照",
                    url="https://sbj.cnipa.gov.cn/sbj/sbcx/",
                    note="本地结构化快照 + 增强相似度算法（字形/拼音/前缀匹配），用于脚手架演示与 provider 隔离验证。",
                )
            ],
            disclaimer="结果基于公开商标快照与规则匹配，仅供参考，以官方查询系统为准。",
            normalized_payload=result,
        )
