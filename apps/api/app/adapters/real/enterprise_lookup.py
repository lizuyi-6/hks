from __future__ import annotations

import logging

import httpx

from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.config import get_settings
from apps.api.app.ports.interfaces import EnterpriseLookupPort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)


class RealEnterpriseLookupAdapter(EnterpriseLookupPort):
    port_name = "enterpriseLookup"
    provider_name = "tianyancha"
    mode = "real"

    def __init__(self) -> None:
        self.settings = get_settings()

    def availability(self) -> tuple[bool, str | None]:
        if self.settings.tianyancha_api_key:
            return True, None
        return True, (
            "fallback: TIANAYANCHA_API_KEY/provider_integrations(tianyancha) "
            "unset — returning basic info unless tenant has an integration"
        )

    def _resolve_cfg(self, tenant_id: str | None) -> dict | None:
        from apps.api.app.core.database import SessionLocal
        from apps.api.app.db.repositories.integrations import resolve_integration

        db = SessionLocal()
        try:
            return resolve_integration(db, tenant_id, "tianyancha", self.settings)
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning(
                "enterprise_lookup.tianyancha.resolve_failed tenant=%s error=%s",
                tenant_id,
                exc,
            )
            return None
        finally:
            db.close()

    def lookup(
        self,
        company_name: str,
        trace_id: str,
        tenant_id: str | None = None,
    ):
        cfg = self._resolve_cfg(tenant_id)
        if cfg and cfg.get("secrets", {}).get("api_key"):
            return self._lookup_tianyancha(company_name, trace_id, cfg)
        return self._lookup_basic(company_name, trace_id)

    def _lookup_tianyancha(self, company_name: str, trace_id: str, cfg: dict):
        try:
            api_key = cfg["secrets"]["api_key"]
            url = "https://open.api.tianyancha.com/services/open/search/2.0"
            headers = {"Authorization": api_key}
            params = {"keyword": company_name, "pageSize": 5}

            with httpx.Client(timeout=15) as client:
                response = client.get(url, headers=headers, params=params)
                response.raise_for_status()
                data = response.json()

            items = data.get("result", {}).get("items", [])
            if not items:
                return self._lookup_basic(company_name, trace_id)

            first = items[0]
            risk_flags = []
            if first.get("regStatus") not in ("存续", "在业"):
                risk_flags.append(f"企业状态异常: {first.get('regStatus', '未知')}")
            if first.get("isDishonest") == "1":
                risk_flags.append("存在失信记录")
            if first.get("punishCount", 0) > 0:
                risk_flags.append(f"行政处罚 {first['punishCount']} 次")

            return make_envelope(
                mode=self.mode,
                provider=self.provider_name,
                trace_id=trace_id,
                source_refs=[
                    SourceRef(
                        title="天眼查",
                        url=f"https://www.tianyancha.com/search?key={company_name}",
                        note=company_name,
                    )
                ],
                disclaimer="企业信息来源于天眼查公开数据，仅供参考。",
                normalized_payload={
                    "name": first.get("name", company_name),
                    "legal_person": first.get("legalPersonName", ""),
                    "reg_capital": first.get("regCapital", ""),
                    "status": first.get("regStatus", "unknown"),
                    "establish_date": first.get("estiblishTime", ""),
                    "risk_flags": risk_flags,
                    "credit_code": first.get("creditCode", ""),
                },
            )
        except Exception as exc:
            logger.warning("Tianyancha lookup failed: %s, falling back", exc)
            return self._lookup_basic(company_name, trace_id)

    def _lookup_basic(self, company_name: str, trace_id: str):
        return make_envelope(
            mode=self.mode,
            provider="enterprise-basic",
            trace_id=trace_id,
            source_refs=[SourceRef(title="企业信息", note=company_name)],
            disclaimer="未配置企业数据 API，返回基础信息。接入天眼查 API 后可获取完整数据。",
            normalized_payload={
                "name": company_name,
                "status": "active",
                "risk_flags": [],
            },
        )
