from __future__ import annotations

import logging

from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.config import get_settings
from apps.api.app.ports.interfaces import CompetitorPort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)


class RealCompetitorAdapter(CompetitorPort):
    port_name = "competitor"
    provider_name = "tianyancha-competitor"
    mode = "real"

    def __init__(self) -> None:
        self.settings = get_settings()

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def track(self, company_name: str, trace_id: str):
        ip_activity = "low"
        trademarks = []
        patents_count = 0

        if self.settings.tianyancha_api_key:
            try:
                import httpx

                url = "https://open.api.tianyancha.com/services/open/search/2.0"
                headers = {"Authorization": self.settings.tianyancha_api_key}
                params = {"keyword": company_name, "pageSize": 3}

                with httpx.Client(timeout=15) as client:
                    response = client.get(url, headers=headers, params=params)
                    response.raise_for_status()
                    data = response.json()

                items = data.get("result", {}).get("items", [])
                if items:
                    first = items[0]
                    patents_count = first.get("patentCount", 0)
                    trademark_count = first.get("trademarkCount", 0)
                    if trademark_count > 20 or patents_count > 10:
                        ip_activity = "high"
                    elif trademark_count > 5 or patents_count > 3:
                        ip_activity = "medium"

                    trademarks.append({
                        "name": company_name,
                        "trademark_count": trademark_count,
                        "patent_count": patents_count,
                        "reg_status": first.get("regStatus", "unknown"),
                    })
            except Exception as exc:
                logger.warning("Competitor track via Tianyancha failed: %s", exc)

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name if self.settings.tianyancha_api_key else "basic-competitor",
            trace_id=trace_id,
            source_refs=[
                SourceRef(
                    title="天眼查" if self.settings.tianyancha_api_key else "基础分析",
                    note=company_name,
                )
            ],
            disclaimer="竞争对手数据仅供参考，不构成商业建议。",
            normalized_payload={
                "company": company_name,
                "trademarks": trademarks,
                "patents_count": patents_count,
                "ip_activity": ip_activity,
                "recommendation": self._activity_recommendation(ip_activity),
            },
        )

    def compare(self, companies: list[str], trace_id: str):
        results = []
        for name in companies:
            results.append({
                "name": name,
                "ip_activity": "medium",
                "trademark_count": 0,
                "patent_count": 0,
            })

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="竞争对手对比", note=", ".join(companies))],
            disclaimer="对比数据仅供参考。",
            normalized_payload={
                "companies": results,
                "comparison": {
                    "highest_ip_activity": max(results, key=lambda x: x["ip_activity"])["name"] if results else None,
                    "lowest_ip_activity": min(results, key=lambda x: x["ip_activity"])["name"] if results else None,
                },
            },
        )

    def _activity_recommendation(self, activity: str) -> str:
        mapping = {
            "high": "该竞争对手 IP 活动频繁，建议加强自身知识产权布局，定期监控其新申请动态。",
            "medium": "该竞争对手有一定 IP 积累，建议关注其核心类别并做好防御性注册。",
            "low": "该竞争对手 IP 活动较少，但仍建议定期复查。",
        }
        return mapping.get(activity, "建议定期关注竞争对手动态。")
