"""Built-in compliance sub-audit plug-ins.

Each plug-in focuses on a single "domain lens" so that adding or muting an
audit only touches one file. The two originally-hardcoded overlays (policy
radar + trademark status) live here, and a new copyright-expiry lens has
been added to demonstrate the plug-in surface.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from apps.api.app.schemas.common import SourceRef

from . import SubAuditContext, SubAuditResult, register_subaudit

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1) Policy radar overlay
# ---------------------------------------------------------------------------


class PolicyRadarSubAudit:
    name = "policy_radar"
    category = "policy"

    def run(self, ctx: SubAuditContext) -> SubAuditResult:
        result = SubAuditResult()
        industry = (ctx.company or {}).get("industry") or ""
        if not industry:
            return result

        from apps.api.app.adapters.registry import provider_registry

        try:
            policy_envelope = provider_registry.get("policyDigest").digest(
                industry, trace_id=ctx.trace_id
            )
        except Exception:
            logger.exception("policy_digest enrichment failed in policy_radar sub-audit")
            return result

        policy_payload = policy_envelope.normalized_payload or {}
        policies_obj = (
            policy_payload
            if isinstance(policy_payload, dict)
            else getattr(policy_payload, "model_dump", lambda: {})()
        )
        policies = policies_obj.get("policies", []) if isinstance(policies_obj, dict) else []
        high_impact: list[dict[str, Any]] = [
            p
            for p in policies
            if str((p or {}).get("impact", "")).lower() in ("high", "critical")
            or (p or {}).get("severity") in ("high", "critical", "red")
        ][:3]

        if high_impact:
            titles = "、".join(
                [str((p or {}).get("title", "（无标题）")) for p in high_impact]
            )
            result.findings.append(
                {
                    "severity": "medium",
                    "category": self.category,
                    "title": f"行业新政策可能影响合规：{titles}",
                    "description": "政策雷达检出对本行业高影响的新规，建议评估对现有合规策略的冲击。",
                    "remediation": "订阅政策雷达并安排专项合规评审。",
                    "recommended_products": ["policy.radar", "compliance.audit"],
                }
            )
            result.heatmap_delta[self.category] = 10

        for p in high_impact:
            result.source_refs.append(
                SourceRef(
                    title=f"政策雷达 · {(p or {}).get('title', '未知政策')}",
                    url=(p or {}).get("url"),
                    note=(p or {}).get("summary") or (p or {}).get("issued_by"),
                )
            )
        return result


register_subaudit(PolicyRadarSubAudit())


# ---------------------------------------------------------------------------
# 2) Trademark status overlay
# ---------------------------------------------------------------------------


class TrademarkStatusSubAudit:
    name = "trademark_status"
    category = "trademark"

    def run(self, ctx: SubAuditContext) -> SubAuditResult:
        result = SubAuditResult()
        now = datetime.now(timezone.utc)
        soon_cutoff = now + timedelta(days=30)

        pending: list[str] = []
        expiring: list[str] = []

        for a in ctx.assets or []:
            asset_type = a.get("type") or a.get("asset_type")
            if asset_type != "trademark":
                continue
            status = (a.get("status") or "").lower()
            if status in ("pending", "in_review", "examining"):
                pending.append(a.get("name") or a.get("id") or "未命名商标")
            expires_at_raw = a.get("expires_at") or a.get("expiresAt")
            if expires_at_raw:
                try:
                    expires_at = (
                        datetime.fromisoformat(
                            expires_at_raw.replace("Z", "+00:00")
                        )
                        if isinstance(expires_at_raw, str)
                        else expires_at_raw
                    )
                    if expires_at.tzinfo is None:
                        expires_at = expires_at.replace(tzinfo=timezone.utc)
                    if now <= expires_at <= soon_cutoff:
                        expiring.append(a.get("name") or a.get("id") or "未命名商标")
                except Exception:
                    pass

        if pending:
            result.findings.append(
                {
                    "severity": "low",
                    "category": self.category,
                    "title": f"待审商标 {len(pending)} 件",
                    "description": (
                        "以下商标尚在审查中，请关注审查进度及时应对驳回通知："
                        + "、".join(pending[:5])
                    ),
                    "remediation": "开启商标监控 & 驳回补救提醒。",
                    "recommended_products": [
                        "trademark.monitor",
                        "trademark.rejection_response",
                    ],
                }
            )
            result.source_refs.append(
                SourceRef(
                    title=f"企业资产台账 · 待审商标 {len(pending)} 件",
                    note="以 IpAsset.status = pending / in_review 聚合统计",
                )
            )
            result.heatmap_delta[self.category] = max(
                result.heatmap_delta.get(self.category, 0), 5
            )

        if expiring:
            result.findings.append(
                {
                    "severity": "high",
                    "category": self.category,
                    "title": f"{len(expiring)} 件商标将在 30 天内到期",
                    "description": (
                        "建议尽快启动续展流程，避免权利中断：" + "、".join(expiring[:5])
                    ),
                    "remediation": "平台已上架续展代办服务，可一键委托。",
                    "recommended_products": ["trademark.renewal"],
                }
            )
            result.source_refs.append(
                SourceRef(
                    title=f"企业资产台账 · 30 天内到期商标 {len(expiring)} 件",
                    note="以 IpAsset.expires_at ≤ now+30d 聚合统计",
                )
            )
            result.heatmap_delta[self.category] = max(
                result.heatmap_delta.get(self.category, 0), 20
            )

        return result


register_subaudit(TrademarkStatusSubAudit())


# ---------------------------------------------------------------------------
# 3) Copyright expiry overlay (NEW)
# ---------------------------------------------------------------------------


class CopyrightExpirySubAudit:
    """Surface copyright / software-copyright assets that are expiring or
    already expired. Copyrights are typically 50 years but the asset table
    uses ``expires_at`` as a generic renewal hint, so this plug-in treats
    any entry with ``expires_at`` within 90d as a risk.
    """

    name = "copyright_expiry"
    category = "copyright"
    _WINDOW_DAYS = 90

    def run(self, ctx: SubAuditContext) -> SubAuditResult:
        result = SubAuditResult()
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=self._WINDOW_DAYS)
        soon: list[str] = []
        expired: list[str] = []

        for a in ctx.assets or []:
            asset_type = a.get("type") or a.get("asset_type") or ""
            if asset_type not in ("copyright", "software_copyright"):
                continue
            raw = a.get("expires_at") or a.get("expiresAt")
            if not raw:
                continue
            try:
                exp = (
                    datetime.fromisoformat(raw.replace("Z", "+00:00"))
                    if isinstance(raw, str)
                    else raw
                )
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
            except Exception:
                continue
            name = a.get("name") or a.get("id") or "未命名作品"
            if exp < now:
                expired.append(name)
            elif exp <= cutoff:
                soon.append(name)

        if expired:
            result.findings.append(
                {
                    "severity": "high",
                    "category": self.category,
                    "title": f"{len(expired)} 件著作权登记已过期",
                    "description": (
                        "以下作品登记已过期，涉及证据链可能失效："
                        + "、".join(expired[:5])
                    ),
                    "remediation": "建议重新登记或办理续登。",
                    "recommended_products": ["copyright.registration"],
                }
            )
            result.source_refs.append(
                SourceRef(
                    title=f"企业资产台账 · 过期著作权 {len(expired)} 件",
                    note="以 IpAsset.expires_at < now 聚合统计",
                )
            )
            result.heatmap_delta[self.category] = 25
        if soon:
            result.findings.append(
                {
                    "severity": "medium",
                    "category": self.category,
                    "title": f"{len(soon)} 件著作权将在 {self._WINDOW_DAYS} 天内到期",
                    "description": (
                        "建议提前准备续登材料，避免证据链断档："
                        + "、".join(soon[:5])
                    ),
                    "remediation": "预约著作权续登代办。",
                    "recommended_products": ["copyright.registration"],
                }
            )
            result.source_refs.append(
                SourceRef(
                    title=f"企业资产台账 · 即将到期著作权 {len(soon)} 件",
                    note=f"以 IpAsset.expires_at ≤ now+{self._WINDOW_DAYS}d 聚合统计",
                )
            )
            result.heatmap_delta[self.category] = max(
                result.heatmap_delta.get(self.category, 0), 10
            )

        return result


register_subaudit(CopyrightExpirySubAudit())
