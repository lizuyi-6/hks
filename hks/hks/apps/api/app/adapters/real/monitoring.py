from __future__ import annotations

import json
import logging
import ssl
from datetime import datetime, timezone

import httpx

from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.config import get_settings
from apps.api.app.core.error_handler import SystemError as APISystemError
from apps.api.app.ports.interfaces import MonitoringPort
from apps.api.app.schemas.common import SourceRef

# Narrow, named set of exceptions that represent "upstream unavailable".
# Anything outside this set is a code / data bug and must bubble up so we
# can see it instead of silently falling back to worse-quality results.
_SEARCH_RETRYABLE_EXCEPTIONS: tuple[type[BaseException], ...] = (
    httpx.HTTPError,
    ssl.SSLError,
    json.JSONDecodeError,
)

logger = logging.getLogger(__name__)

MONITORING_SYSTEM_PROMPT = """你是 A1+ IP Coworker 的侵权监控分析助手。根据搜索结果，判断是否存在潜在的商标侵权行为。

请输出 JSON 格式：
- alerts: 数组，每个元素包含 title(标题)、severity(high/medium/low)、description(描述)、source_url(来源URL)、found_at(发现时间)
- summary: 一段话总结监控结果
- recommendation: 建议的应对措施

重要提醒：所有分析仅供参考，不构成法律意见。"""

MONITORING_NO_SEARCH_PROMPT = """你是 A1+ IP Coworker 的侵权监控分析助手。由于外部搜索服务暂时不可用，请根据商标名称和一般行业知识，提供潜在的侵权风险分析。

请输出 JSON 格式：
- alerts: 数组，每个元素包含 title(标题)、severity(high/medium/low)、description(描述)、source_url(留空字符串)、found_at(当前时间ISO格式)
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
        # ``fallback_refs`` accumulates breadcrumbs that get attached to the
        # final envelope so operators can tell at a glance that the result
        # came from a degraded path (e.g. Bing failed → DuckDuckGo) without
        # digging through server logs.
        fallback_refs: list[SourceRef] = []

        if self.settings.bing_search_api_key:
            search_results = self._fetch_bing(query, trace_id, fallback_refs)
        else:
            search_results = self._fetch_duckduckgo(query, trace_id, fallback_refs)

        if search_results is not None:
            return self._analyze_with_llm(
                query, search_results, MONITORING_SYSTEM_PROMPT, trace_id, fallback_refs
            )

        # Search completely unavailable — ask LLM to analyze based on knowledge
        return self._analyze_with_llm_no_search(query, trace_id, fallback_refs)

    # ------------------------------------------------------------------
    # Search helpers (return list[dict] | None; None = service unavailable)
    # ------------------------------------------------------------------

    def _fetch_bing(self, query: str, trace_id: str, fallback_refs: list[SourceRef]):
        try:
            headers = {"Ocp-Apim-Subscription-Key": self.settings.bing_search_api_key}
            params = {"q": f"{query} 商标 侵权", "count": 10, "mkt": "zh-CN"}

            with httpx.Client(timeout=30) as client:
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
            return results
        except _SEARCH_RETRYABLE_EXCEPTIONS as exc:
            # Only upstream / transport failures should trigger the DDG
            # fallback; everything else (programmer errors) must bubble up.
            logger.warning("monitoring.bing.failed error=%s", exc)
            fallback_refs.append(
                SourceRef(
                    title="fallback",
                    note=f"bing_failed:{type(exc).__name__}",
                )
            )
            return self._fetch_duckduckgo(query, trace_id, fallback_refs)

    def _fetch_duckduckgo(self, query: str, trace_id: str, fallback_refs: list[SourceRef]):
        from urllib.parse import unquote, urlparse, parse_qs
        import re as _re

        try:
            # SECURITY: SECLEVEL=1 is only applied to this DuckDuckGo HTML
            # fallback. We scope it to a dedicated Client so it can't leak
            # into other outbound calls in the same process.
            ssl_context = ssl.create_default_context()
            ssl_context.set_ciphers("DEFAULT@SECLEVEL=1")

            with httpx.Client(
                timeout=30,
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
            results = []
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
            return results if results else None
        except _SEARCH_RETRYABLE_EXCEPTIONS as exc:
            logger.warning("monitoring.ddg.failed error=%s", exc)
            fallback_refs.append(
                SourceRef(title="fallback", note=f"ddg_failed:{type(exc).__name__}")
            )
            return None

    # ------------------------------------------------------------------
    # LLM analysis helpers
    # ------------------------------------------------------------------

    def _analyze_with_llm(
        self,
        query: str,
        search_results: list[dict],
        system_prompt: str,
        trace_id: str,
        fallback_refs: list[SourceRef],
    ):
        """Use LLM to analyze search results for infringement risks."""
        from apps.api.app.adapters.registry import provider_registry

        search_summary = json.dumps(search_results[:10], ensure_ascii=False, indent=2)
        user_prompt = f"商标名称：{query}\n\n搜索结果：\n{search_summary}\n\n请根据以上搜索结果分析侵权风险。"

        llm = provider_registry.get("llm")
        try:
            llm_result = llm.analyze_text(system_prompt, user_prompt, trace_id)
        except Exception as exc:
            # LLM unavailable (rate limit, transient upstream error, etc.):
            # we still have real search results, so the rule-based engine
            # can produce a useful envelope. Record the fallback so the
            # UI / logs can surface "degraded AI" state.
            logger.warning("monitoring.llm.failed falling_back=rule_based error=%s", exc)
            fallback_refs.append(
                SourceRef(title="fallback", note=f"llm_failed:{type(exc).__name__}")
            )
            return self._rule_based_alerts(query, search_results, trace_id, fallback_refs)
        payload = llm_result.normalized_payload

        if isinstance(payload, dict) and "alerts" in payload:
            alerts = payload.get("alerts", [])
            return make_envelope(
                mode=self.mode,
                provider="llm-monitoring",
                trace_id=trace_id,
                source_refs=[
                    SourceRef(title="LLM 侵权监控", note=f"查询: {query}"),
                    *fallback_refs,
                ],
                disclaimer="监控结果由 AI 分析生成，仅供参考，不构成法律意见。",
                normalized_payload={
                    "query": query,
                    "alerts": alerts,
                    "total": len(alerts),
                    "high_count": sum(1 for a in alerts if a.get("severity") == "high"),
                    "summary": payload.get("summary", ""),
                    "recommendation": payload.get("recommendation", ""),
                },
            )

        # LLM returned unexpected format — fall back to rule-based analysis.
        fallback_refs.append(SourceRef(title="fallback", note="llm_format_unexpected"))
        return self._rule_based_alerts(query, search_results, trace_id, fallback_refs)

    def _analyze_with_llm_no_search(
        self,
        query: str,
        trace_id: str,
        fallback_refs: list[SourceRef],
    ):
        """LLM analysis when search service is unavailable."""
        from apps.api.app.adapters.registry import provider_registry

        user_prompt = f"商标名称：{query}\n\n请分析该商标可能面临的侵权风险，提供一般性建议。"
        llm = provider_registry.get("llm")
        try:
            llm_result = llm.analyze_text(MONITORING_NO_SEARCH_PROMPT, user_prompt, trace_id)
        except Exception as exc:
            # Both search AND LLM are unavailable. Per CLAUDE.md "LLM
            # failure = user-visible error", we surface this as a real
            # error instead of silently returning an empty alerts list
            # that users interpret as "all clear".
            logger.warning("monitoring.llm_no_search.failed error=%s", exc)
            raise APISystemError(
                message="侵权监控暂时不可用：搜索服务与 AI 分析同时失败，请稍后重试",
                error_location="monitoring.scan",
            ) from exc
        payload = llm_result.normalized_payload

        if isinstance(payload, dict) and "alerts" in payload:
            alerts = payload.get("alerts", [])
            return make_envelope(
                mode=self.mode,
                provider="llm-monitoring",
                trace_id=trace_id,
                source_refs=[
                    SourceRef(title="LLM 侵权监控 (无搜索)", note=f"查询: {query}"),
                    *fallback_refs,
                ],
                disclaimer="搜索服务不可用，结果由 AI 基于知识分析生成，仅供参考。",
                normalized_payload={
                    "query": query,
                    "alerts": alerts,
                    "total": len(alerts),
                    "high_count": sum(1 for a in alerts if a.get("severity") == "high"),
                    "summary": payload.get("summary", ""),
                    "recommendation": payload.get("recommendation", ""),
                },
            )

        # Search unavailable AND LLM returned unexpected payload → align
        # with CLAUDE.md and surface the failure so the client can show a
        # proper error instead of an empty alert list that looks like "all
        # clear".
        raise APISystemError(
            message="侵权监控暂时不可用：搜索服务失败，AI 分析返回格式异常",
            error_location="monitoring.scan",
        )

    def _rule_based_alerts(
        self,
        query: str,
        search_results: list[dict],
        trace_id: str,
        fallback_refs: list[SourceRef] | None = None,
    ):
        """Rule-based fallback for alert generation from search results."""
        alerts = []
        for r in search_results[:5]:
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
            source_refs=[
                SourceRef(title="DuckDuckGo 侵权监控", note=f"查询: {query}"),
                *(fallback_refs or []),
            ],
            disclaimer="监控结果基于公开搜索数据，仅供参考，不构成法律意见。",
            normalized_payload={
                "query": query,
                "alerts": alerts,
                "total": len(alerts),
                "high_count": sum(1 for a in alerts if a["severity"] == "high"),
            },
        )

    def get_alerts(self, user_id: str, trace_id: str):
        """Replay historical monitoring alerts from the SystemEvent log.

        ``monitoring.alert`` events are emitted by the job processor each time
        a ``monitoring.scan`` job completes with findings. We re-hydrate the
        original alerts by reading the associated ``JobRecord.result`` so the
        API returns real data rather than an empty stub.
        """
        try:
            from apps.api.app.core.database import SessionLocal
            from apps.api.app.db.models import JobRecord, SystemEvent
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning("get_alerts import failed: %s", exc)
            return self._empty_alerts_envelope(trace_id, reason="db_unavailable")

        db = SessionLocal()
        try:
            events = (
                db.query(SystemEvent)
                .filter(
                    SystemEvent.event_type == "monitoring.alert",
                    SystemEvent.user_id == user_id,
                )
                .order_by(SystemEvent.created_at.desc())
                .limit(30)
                .all()
            )

            flat_alerts: list[dict] = []
            for ev in events:
                job_id = (ev.payload or {}).get("job_id") or ev.source_entity_id
                if not job_id:
                    continue
                job = db.query(JobRecord).filter(JobRecord.id == job_id).first()
                if not job or not job.result:
                    continue
                result = job.result or {}
                normalized = result.get("normalizedPayload") or result
                alerts = normalized.get("alerts") or []
                query = normalized.get("query") or ""
                for a in alerts:
                    flat_alerts.append({
                        "query": query,
                        "title": a.get("title"),
                        "severity": a.get("severity", "low"),
                        "description": a.get("description"),
                        "source_url": a.get("source_url"),
                        "found_at": a.get("found_at") or ev.created_at.isoformat(),
                        "event_id": ev.id,
                        "job_id": job.id,
                    })

            flat_alerts.sort(
                key=lambda a: a.get("found_at") or "", reverse=True
            )
            payload = {
                "alerts": flat_alerts,
                "total": len(flat_alerts),
                "high_count": sum(
                    1 for a in flat_alerts if a.get("severity") == "high"
                ),
                "source_events": len(events),
            }
            return make_envelope(
                mode=self.mode,
                provider=self.provider_name,
                trace_id=trace_id,
                source_refs=[
                    SourceRef(
                        title="SystemEvent monitoring.alert 回放",
                        note=f"events={len(events)} alerts={len(flat_alerts)}",
                    ),
                ],
                disclaimer="告警数据来自历史监控任务，仅供参考。",
                normalized_payload=payload,
            )
        finally:
            db.close()

    def _empty_alerts_envelope(self, trace_id: str, reason: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="侵权监控", note=reason)],
            disclaimer="告警数据仅供参考。",
            normalized_payload={"alerts": [], "total": 0, "high_count": 0},
        )
