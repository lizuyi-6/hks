from __future__ import annotations

import logging

import httpx

from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.config import get_settings
from apps.api.app.ports.interfaces import PublicWebSearchPort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)


class RealPublicWebSearchAdapter(PublicWebSearchPort):
    port_name = "publicWebSearch"
    provider_name = "bing"
    mode = "real"

    def __init__(self) -> None:
        self.settings = get_settings()

    def availability(self) -> tuple[bool, str | None]:
        if self.settings.bing_search_api_key:
            return True, None
        return True, "fallback: no BING_SEARCH_API_KEY, returning placeholder results"

    def search(self, query: str, trace_id: str):
        if self.settings.bing_search_api_key:
            return self._search_bing(query, trace_id)
        return self._search_placeholder(query, trace_id)

    def _search_bing(self, query: str, trace_id: str):
        try:
            endpoint = self.settings.bing_search_endpoint
            headers = {"Ocp-Apim-Subscription-Key": self.settings.bing_search_api_key}
            params = {"q": query, "count": 10, "mkt": "zh-CN", "setLang": "zh-Hans"}

            with httpx.Client(timeout=15) as client:
                response = client.get(endpoint, headers=headers, params=params)
                response.raise_for_status()
                data = response.json()

            results = []
            for item in data.get("webPages", {}).get("value", []):
                results.append({
                    "title": item.get("name", ""),
                    "url": item.get("url", ""),
                    "snippet": item.get("snippet", ""),
                })

            return make_envelope(
                mode=self.mode,
                provider=self.provider_name,
                trace_id=trace_id,
                source_refs=[
                    SourceRef(
                        title="Bing Web Search",
                        note=f"查询: {query}",
                    )
                ],
                disclaimer="搜索结果来源于 Bing，仅供参考。",
                normalized_payload={
                    "query": query,
                    "result_count": len(results),
                    "results": results,
                },
            )
        except Exception as exc:
            logger.warning("Bing search failed: %s, falling back", exc)
            return self._search_placeholder(query, trace_id)

    def _search_placeholder(self, query: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider="placeholder",
            trace_id=trace_id,
            source_refs=[SourceRef(title="公开搜索", note=query)],
            disclaimer="未配置 Bing Search API，返回示例结果。配置 BING_SEARCH_API_KEY 后可获取真实搜索数据。",
            normalized_payload={
                "query": query,
                "result_count": 2,
                "results": [
                    {"title": f"搜索结果示例 - {query}", "url": "https://example.com", "snippet": "请配置 BING_SEARCH_API_KEY 以获取真实搜索结果。"},
                    {"title": "相关资讯示例", "url": "https://example.com/news", "snippet": "此处展示示例数据。"},
                ],
            },
        )
