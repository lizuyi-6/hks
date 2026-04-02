from __future__ import annotations

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import MonitoringPort
from apps.api.app.schemas.common import SourceRef


class RealMonitoringAdapter(MonitoringPort):
    port_name = "monitoring"
    provider_name = "public-search-placeholder"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return False, "监控抓取需显式启用 feature flag 与授权数据源"

    def scan(self, query: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="监控占位", note=query)],
            disclaimer="监控模块首版仅保留骨架，未启用真实抓取。",
            normalized_payload={"query": query, "alerts": []},
        )

