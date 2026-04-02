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
            similarity = int(
                SequenceMatcher(None, item["name"].lower(), payload.trademark_name.lower()).ratio()
                * 100
            )
            if similarity < 48:
                continue

            if payload.categories and item["category"] not in payload.categories:
                similarity = max(similarity - 8, 0)

            findings.append(
                TrademarkFinding(
                    name=item["name"],
                    category=item["category"],
                    similarity_score=similarity,
                    status=item["status"],
                    note=item["note"],
                )
            )

        findings.sort(key=lambda item: item.similarity_score, reverse=True)
        top_score = findings[0].similarity_score if findings else 0
        if top_score >= 88:
            risk_level = "red"
        elif top_score >= 65:
            risk_level = "yellow"
        else:
            risk_level = "green"

        summary = {
            "green": "未发现直接冲突项，可进入申请书生成。",
            "yellow": "存在近似商标，建议查看近似项后再决定是否申请。",
            "red": "发现明显冲突项，建议先调整商标名称。",
        }[risk_level]

        result = TrademarkCheckResult(
            risk_level=risk_level,
            summary=summary,
            recommendation=entries["recommendations"][risk_level],
            suggested_categories=payload.categories or ["35", "42"],
            findings=findings[:5],
            alternatives=entries["alternatives"].get(risk_level, []),
        )

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[
                SourceRef(
                    title="CNIPA 商标快照",
                    note="本地结构化快照，用于脚手架演示与 provider 隔离验证。",
                )
            ],
            disclaimer="结果基于公开商标快照与规则匹配，仅供参考，以官方查询系统为准。",
            normalized_payload=result,
        )

