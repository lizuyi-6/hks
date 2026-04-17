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
        return True, None

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
        """Fallback to DuckDuckGo search when Bing is not configured."""
        try:
            import httpx
            from urllib.parse import unquote, urlparse, parse_qs
            import re as _re
            import ssl

            results = []
            # Create SSL context that allows us to connect even with some SSL issues
            ssl_context = ssl.create_default_context()
            ssl_context.set_ciphers('DEFAULT@SECLEVEL=1')

            with httpx.Client(
                timeout=15,
                follow_redirects=True,
                verify=ssl_context,
                http2=False,
            ) as client:
                resp = client.get(
                    "https://html.duckduckgo.com/html/",
                    params={"q": f"{query} 商标 侵权"},
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                        "Accept-Encoding": "gzip, deflate, br",
                        "DNT": "1",
                        "Connection": "keep-alive",
                    },
                )
                resp.raise_for_status()

            pattern = _re.compile(
                r'<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>'
                r'.*?<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
                _re.DOTALL,
            )
            for m in pattern.finditer(resp.text):
                raw_url = m.group(1)
                if "uddg=" in raw_url:
                    parsed = urlparse(raw_url)
                    qs = parse_qs(parsed.query)
                    url = unquote(qs.get("uddg", [raw_url])[0])
                else:
                    url = raw_url
                title = _re.sub(r"<[^>]+>", "", m.group(2)).strip()
                snippet = _re.sub(r"<[^>]+>", "", m.group(3)).strip()
                results.append({"title": title, "url": url, "snippet": snippet})

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
                provider="duckduckgo-monitoring",
                trace_id=trace_id,
                source_refs=[SourceRef(title="DuckDuckGo 侵权监控", note=f"查询: {query}")],
                disclaimer="监控结果基于 DuckDuckGo 搜索数据，仅供参考，不构成法律意见。",
                normalized_payload={
                    "query": query,
                    "alerts": alerts,
                    "total": len(alerts),
                    "high_count": sum(1 for a in alerts if a["severity"] == "high"),
                },
            )
        except Exception as exc:
            logger.warning("DuckDuckGo monitoring failed: %s", exc)
            return make_envelope(
                mode=self.mode,
                provider="local-scan",
                trace_id=trace_id,
                source_refs=[SourceRef(title="本地扫描", note="搜索服务不可用")],
                disclaimer="搜索服务暂时不可用，返回基础扫描结果。",
                normalized_payload={
                    "query": query,
                    "alerts": [],
                    "total": 0,
                    "high_count": 0,
                    "message": "搜索服务暂时不可用，请稍后重试。",
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
