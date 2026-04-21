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
        # DB rows may still satisfy the request at call time; we can't
        # know here (availability() has no tenant context) so we just
        # flag that the env layer is empty.
        return True, (
            "fallback: no BING_SEARCH_API_KEY and no global "
            "provider_integrations(bing_search) row; will use DuckDuckGo "
            "unless a tenant-scoped integration exists at call time"
        )

    def search(self, query: str, trace_id: str, tenant_id: str | None = None):
        cfg = self._resolve_config(tenant_id)
        if cfg is not None:
            return self._search_bing(query, trace_id, cfg)
        return self._search_duckduckgo(query, trace_id)

    def _resolve_config(self, tenant_id: str | None) -> dict | None:
        """Look up effective Bing config (DB → .env) for this call."""
        # Imported lazily so the registry can be constructed without a
        # live DB (e.g. during module import in CLI / tests that don't
        # touch the monitoring path).
        from apps.api.app.core.database import SessionLocal
        from apps.api.app.db.repositories.integrations import resolve_integration

        db = SessionLocal()
        try:
            return resolve_integration(db, tenant_id, "bing_search", self.settings)
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning(
                "public_web_search.bing.resolve_failed tenant=%s error=%s",
                tenant_id,
                exc,
            )
            return None
        finally:
            db.close()

    def _search_bing(self, query: str, trace_id: str, cfg: dict):
        try:
            config = cfg.get("config", {}) or {}
            secrets = cfg.get("secrets", {}) or {}
            endpoint = config.get("endpoint") or "https://api.bing.microsoft.com/v7.0/search"
            headers = {"Ocp-Apim-Subscription-Key": secrets.get("api_key", "")}
            params = {
                "q": query,
                "count": 10,
                "mkt": config.get("market", "zh-CN"),
                "setLang": config.get("set_lang", "zh-Hans"),
            }

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

            note = f"查询: {query} · 凭证: {cfg.get('source', 'db')}"
            return make_envelope(
                mode=self.mode,
                provider=self.provider_name,
                trace_id=trace_id,
                source_refs=[
                    SourceRef(
                        title="Bing Web Search",
                        note=note,
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
            import ssl

            results = []
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
                    params={"q": query},
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                        "DNT": "1",
                        "Connection": "keep-alive",
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
            disclaimer="未配置搜索 API，返回示例结果。在企业工作台「集成配置」中登记 Bing Search 凭证，或设置 BING_SEARCH_API_KEY 环境变量后可获取真实搜索数据。",
            normalized_payload={
                "query": query,
                "result_count": 2,
                "results": [
                    {"title": f"搜索结果示例 - {query}", "url": "https://example.com", "snippet": "请在「集成配置」中登记 Bing Search 凭证以获取真实搜索结果。"},
                    {"title": "相关资讯示例", "url": "https://example.com/news", "snippet": "此处展示示例数据。"},
                ],
            },
        )
