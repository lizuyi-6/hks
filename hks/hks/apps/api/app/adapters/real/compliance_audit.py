"""Real compliance audit adapter.

Computes a baseline compliance score + findings from company/asset metadata,
then lets every registered :mod:`compliance_subaudits` plug-in augment the
result (policy radar, trademark status, copyright expiry, …).
"""
from __future__ import annotations

import logging
from typing import Any

from apps.api.app.adapters.base import make_envelope
from apps.api.app.adapters.real.compliance_subaudits import (
    SubAuditContext,
    enabled_subaudits,
    registered_names,
)
from apps.api.app.ports.interfaces import ComplianceAuditPort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)


def _compute_baseline(company: dict | None, assets: list | None) -> dict[str, Any]:
    asset_types = [
        (a or {}).get("type") or (a or {}).get("asset_type") for a in (assets or [])
    ]
    has_trademark = any(t == "trademark" for t in asset_types)
    has_patent = any(t == "patent" for t in asset_types)
    has_copyright = any(t in ("copyright", "soft-copyright") for t in asset_types)

    industry = (company or {}).get("industry", "")

    score = 60
    findings: list[dict] = []
    breakdown = {
        "trademark": 15,
        "patent": 15,
        "copyright": 10,
        "contract": 10,
        "policy": 10,
    }

    if not has_trademark:
        findings.append({
            "severity": "high",
            "category": "trademark",
            "title": "未发现已注册商标",
            "description": "企业核心品牌尚未完成商标注册，存在品牌被抢注风险。",
            "remediation": "建议优先注册主品牌 35/9/42 类，覆盖核心业务。",
            "recommended_products": ["trademark.basic", "trademark.full"],
        })
        score -= 20
        breakdown["trademark"] = 0

    if industry in ("软件", "SaaS", "AI", "互联网") and not has_copyright:
        findings.append({
            "severity": "medium",
            "category": "copyright",
            "title": "软著空白",
            "description": "技术型企业缺少软件著作权登记，影响政策申报和资产评估。",
            "remediation": "建议登记核心系统软著 1-3 项。",
            "recommended_products": ["copyright.software"],
        })
        score -= 10
        breakdown["copyright"] = 0

    if industry in ("硬件", "制造", "医疗", "AI") and not has_patent:
        findings.append({
            "severity": "medium",
            "category": "patent",
            "title": "核心技术未专利化",
            "description": "存在核心技术未提交专利保护的风险，竞品复用成本低。",
            "remediation": "建议尽快评估可专利点，撰写 1-2 项实用新型或发明专利。",
            "recommended_products": ["patent.assess", "patent.draft"],
        })
        score -= 12

    findings.append({
        "severity": "low",
        "category": "contract",
        "title": "合作协议中 IP 归属条款建议专项审查",
        "description": "外包 / 咨询 / 雇佣合同中 IP 归属条款是常见争议点。",
        "remediation": "上传代表性合同，平台律师可 24 小时内出审查意见。",
        "recommended_products": ["contract.review"],
    })

    findings.append({
        "severity": "low",
        "category": "policy",
        "title": "行业政策订阅未开启",
        "description": "建议订阅「政策雷达」，第一时间获取补贴、合规新规。",
        "remediation": "开通政策雷达订阅（免费）。",
        "recommended_products": ["policy.radar"],
    })

    heatmap = {
        "brand_protection": 20 if not has_trademark else 80,
        "technology_protection": 30 if not has_patent else 70,
        "software_copyright": 40 if not has_copyright else 85,
        "contract_hygiene": 60,
        "policy_awareness": 55,
    }

    return {
        "score": max(score, 10),
        "breakdown": breakdown,
        "heatmap": heatmap,
        "findings": findings,
    }


class RealComplianceAuditAdapter(ComplianceAuditPort):
    port_name = "complianceAudit"
    provider_name = "a1plus-compliance-v1"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def audit(self, company, assets, trace_id):
        baseline = _compute_baseline(company, assets)

        findings: list[dict[str, Any]] = list(baseline["findings"])
        heatmap: dict[str, Any] = dict(baseline["heatmap"])
        extra_refs: list[SourceRef] = []
        plugins_run: list[str] = []

        ctx = SubAuditContext(
            company=company or {},
            assets=list(assets or []),
            trace_id=trace_id,
            prior_findings=findings,
        )

        for plugin in enabled_subaudits():
            try:
                result = plugin.run(ctx)
            except Exception:
                logger.exception("sub-audit plugin %s crashed", plugin.name)
                continue
            if not result:
                continue
            if result.findings:
                findings.extend(result.findings)
                ctx.prior_findings = findings
            if result.source_refs:
                extra_refs.extend(result.source_refs)
            for k, v in (result.heatmap_delta or {}).items():
                current = int(heatmap.get(k, 0) or 0)
                heatmap[k] = min(100, current + int(v))
            plugins_run.append(plugin.name)

        high_count = sum(
            1
            for f in findings
            if (f or {}).get("severity") in ("high", "critical", "red")
        )

        payload: dict[str, Any] = {
            "score": baseline["score"],
            "breakdown": baseline["breakdown"],
            "heatmap": heatmap,
            "findings": findings,
            "summary": (
                f"共识别 {len(findings)} 条合规要点，其中高风险 {high_count} 条。"
                + (
                    f"（已运行 {len(plugins_run)} 个子审计插件：{', '.join(plugins_run)}）"
                    if plugins_run
                    else ""
                )
            ),
            "meta": {
                "subAuditsRun": plugins_run,
                "subAuditsRegistered": registered_names(),
            },
        }

        source_refs: list[SourceRef] = [
            SourceRef(title="IP 合规审计规则库 v1", note="基于行业普遍要点"),
            *extra_refs,
        ]

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=source_refs,
            disclaimer="合规评分与发现仅供参考，以官方政策与专业律师意见为准。",
            normalized_payload=payload,
        )
