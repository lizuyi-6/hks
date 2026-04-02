from __future__ import annotations

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import PublicWebSearchPort
from apps.api.app.schemas.common import SourceRef


class RealPublicWebSearchAdapter(PublicWebSearchPort):
    port_name = "publicWebSearch"
    provider_name = "public-search-snapshot"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def search(self, query: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="公开检索快照", note=query)],
            disclaimer="公开检索结果仅用于辅助判断。",
            normalized_payload=[
                {"title": f"{query} 相关公开结果 1", "url": "https://example.com/1"},
                {"title": f"{query} 相关公开结果 2", "url": "https://example.com/2"},
            ],
        )
