from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.config import get_settings
from apps.api.app.ports.interfaces import MonitoringPort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)

MONITORING_SYSTEM_PROMPT = """你是 A1+ IP Coworker 的侵权监控分析助手。根据搜索结果，判断是否存在潜在的商标侵权行为。

请输出 JSON 格式：
- alerts: 数组，每个元素包含 title(标题)、severity(high/medium/low)、description(描述)、source_url(来源URL)、found_at(发现时间)
- summary: 一段话总结监控结果
- recommendation: 建议的应对措施

重要提醒：所有分析仅供参考，不构成法律意见。"""


class RealMonitoringAdapter(MonitoringPort):
    port_name = "monitoring"
    provider_name = "bing-search-monitoring"
    mode = "real"

    def __init__(self) -> None:
        self.settings = get_settings()

    def availability(self) -> tuple[bool, str | None]:
        if self.settings.bing_search_api_key:
            return True, None
        return True, "fallback: no BING_SEARCH_API_KEY, using local scan"

    def scan(self, query: str, trace_id: str):
        if self.settings.bing_search_api_key:
            return self._scan_bing(query, trace_id)
        return self._scan_local(query, trace_id)

    def _scan_bing(self, query: str, trace_id: str):
        try:
            import httpx

            headers = {"Ocp-Apim-Subscription-Key": self.settings.bing_search_api_key}
            params = {"q": f"{query} 商标 侵权", "count": 10, "mkt": "zh-CN"}

            with httpx.Client(timeout=15) as client:
                response = client.get(
                    self.settings.bing_search_endpoint,
                    headers=headers,
                    params=params,
                )
                response.raise_for_status()
                data = response.json()

            results = []
            for item in data.get("webPages", {}).get("value", []):
                results.append({
                    "title": item.get("name", ""),
                    "url": item.get("url", ""),
                    "snippet": item.get("snippet", ""),
                })

            alerts = []
            for r in results[:5]:
                snippet_lower = r["snippet"].lower()
                severity = "low"
                if any(kw in snippet_lower for kw in ["侵权", "假冒", "盗用", "山寨"]):
                    severity = "high"
                elif any(kw in snippet_lower for kw in ["近似", "类似", "模仿"]):
                    severity = "medium"
                alerts.append({
                    "title": r["title"],
                    "severity": severity,
                    "description": r["snippet"],
                    "source_url": r["url"],
                    "found_at": datetime.now(timezone.utc).isoformat(),
                })

            return make_envelope(
                mode=self.mode,
                provider="bing-search",
                trace_id=trace_id,
                source_refs=[SourceRef(title="Bing 侵权监控", note=f"查询: {query}")],
                disclaimer="监控结果基于公开搜索数据，仅供参考，不构成法律意见。",
                normalized_payload={
                    "query": query,
                    "alerts": alerts,
                    "total": len(alerts),
                    "high_count": sum(1 for a in alerts if a["severity"] == "high"),
                },
            )
        except Exception as exc:
            logger.warning("Bing monitoring scan failed: %s", exc)
            return self._scan_local(query, trace_id)

    def _scan_local(self, query: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider="local-scan",
            trace_id=trace_id,
            source_refs=[SourceRef(title="本地扫描", note="未配置搜索 API")],
            disclaimer="未配置搜索 API，返回基础扫描结果。配置 BING_SEARCH_API_KEY 后可获取真实监控数据。",
            normalized_payload={
                "query": query,
                "alerts": [],
                "total": 0,
                "high_count": 0,
                "message": "请配置搜索 API 以启用真实侵权监控。",
            },
        )

    def get_alerts(self, user_id: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="侵权监控", note="用户告警列表")],
            disclaimer="告警数据仅供参考。",
            normalized_payload={"alerts": [], "total": 0},
        )
