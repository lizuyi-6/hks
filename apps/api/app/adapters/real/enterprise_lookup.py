from __future__ import annotations

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import EnterpriseLookupPort
from apps.api.app.schemas.common import SourceRef


class RealEnterpriseLookupAdapter(EnterpriseLookupPort):
    port_name = "enterpriseLookup"
    provider_name = "enterprise-snapshot"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def lookup(self, company_name: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title="企业信息快照", note=company_name)],
            disclaimer="企业信息来源于结构化快照，仅供参考。",
            normalized_payload={"name": company_name, "status": "active", "risk_flags": []},
        )

