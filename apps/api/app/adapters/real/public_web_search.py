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
        return True, "fallback: no BING_SEARCH_API_KEY, using DuckDuckGo search"

    def search(self, query: str, trace_id: str):
        if self.settings.bing_search_api_key:
            return self._search_bing(query, trace_id)
        return self._search_duckduckgo(query, trace_id)

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
            logger.warning("Bing search failed: %s, falling back to DuckDuckGo", exc)
            return self._search_duckduckgo(query, trace_id)

    def _search_duckduckgo(self, query: str, trace_id: str):
        try:
            results = []
            with httpx.Client(timeout=15, follow_redirects=True) as client:
                resp = client.get(
                    "https://html.duckduckgo.com/html/",
                    params={"q": query},
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    },
                )
                resp.raise_for_status()

            from urllib.parse import unquote, urlparse, parse_qs
            import re as _re
            pattern = _re.compile(
                r'<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>'
                r'.*?<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
                _re.DOTALL,
            )
            for m in pattern.finditer(resp.text):
                raw_url = m.group(1)
                # Extract real URL from DuckDuckGo redirect
                if "uddg=" in raw_url:
                    parsed = urlparse(raw_url)
                    qs = parse_qs(parsed.query)
                    url = unquote(qs.get("uddg", [raw_url])[0])
                else:
                    url = raw_url
                title = _re.sub(r"<[^>]+>", "", m.group(2)).strip()
                snippet = _re.sub(r"<[^>]+>", "", m.group(3)).strip()
                results.append({"title": title, "url": url, "snippet": snippet})

            return make_envelope(
                mode=self.mode,
                provider="duckduckgo",
                trace_id=trace_id,
                source_refs=[
                    SourceRef(title="DuckDuckGo Search", note=f"查询: {query}")
                ],
                disclaimer="搜索结果来源于 DuckDuckGo，仅供参考。",
                normalized_payload={
                    "query": query,
                    "result_count": len(results),
                    "results": results,
                },
            )
        except Exception as exc:
            logger.warning("DuckDuckGo search failed: %s, returning placeholder", exc)
            return self._search_placeholder(query, trace_id)

    def _search_placeholder(self, query: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider="placeholder",
            trace_id=trace_id,
            source_refs=[SourceRef(title="公开搜索", note=query)],
            disclaimer="未配置搜索 API，返回示例结果。配置 BING_SEARCH_API_KEY 后可获取真实搜索数据。",
            normalized_payload={
                "query": query,
                "result_count": 2,
                "results": [
                    {"title": f"搜索结果示例 - {query}", "url": "https://example.com", "snippet": "请配置 BING_SEARCH_API_KEY 以获取真实搜索结果。"},
                    {"title": "相关资讯示例", "url": "https://example.com/news", "snippet": "此处展示示例数据。"},
                ],
            },
        )
