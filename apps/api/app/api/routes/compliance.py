from __future__ import annotations

import re
from pathlib import Path
from tempfile import gettempdir
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.database import get_db
from apps.api.app.core.md_renderer import md_to_docx, md_to_pdf
from apps.api.app.db.models import User
from apps.api.app.services.compliance_engine import (
    SUBSCRIPTION_TIERS,
    ComplianceQuotaExceeded,
    build_audit_markdown,
    create_policy_subscription,
    get_profile,
    get_profile_by_id,
    get_tier_config,
    list_policy_subscriptions,
    policy_radar,
    run_compliance_audit,
    toggle_policy_subscription,
    upgrade_subscription,
)
from apps.api.app.services.dependencies import get_current_user

router = APIRouter(prefix="/compliance", tags=["compliance"])


class AuditBody(BaseModel):
    companyName: str | None = None
    industry: str | None = None
    scale: str | None = None


@router.get("/profile")
def read_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 无档案时返回 null，而不是 ``{}``。前端据此走"首次体检"空态引导，
    # 避免把空对象当作合法 profile 渲染时读到 undefined.findings 报错。
    return get_profile(db, user)


@router.post("/audit")
def run_audit(
    body: AuditBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        result = run_compliance_audit(
            db, user=user,
            company_name=body.companyName,
            industry=body.industry,
            scale=body.scale,
        )
    except ComplianceQuotaExceeded as e:
        # 结构化 detail，前端据此渲染"升级订阅"按钮而不是一条干瘪的红字。
        raise HTTPException(
            status_code=402,
            detail={
                "code": "compliance.audit.quota_exceeded",
                "message": str(e),
                "tier": e.tier,
                "tierLabel": e.tier_label,
                "quota": e.quota,
                "used": e.used,
            },
        ) from e
    except ValueError as e:
        # 其它可预见的业务错误（如非法 tier）保持 402 语义。
        raise HTTPException(status_code=402, detail=str(e)) from e
    return result


@router.get("/profile/{profile_id}")
def read_profile_by_id(
    profile_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = get_profile_by_id(db, user, profile_id)
    if not data:
        raise HTTPException(status_code=404, detail="合规档案不存在")
    return data


def _report_out_dir() -> Path:
    """Where to stage transient DOCX/PDF report files."""
    try:
        target = Path(get_settings().generated_dir) / "compliance-reports"
    except Exception:  # pragma: no cover - settings always resolve
        target = Path(gettempdir()) / "compliance-reports"
    target.mkdir(parents=True, exist_ok=True)
    return target


def _safe_report_basename(data: dict) -> str:
    name = (data.get("companyName") or "compliance") + "-report"
    name = re.sub(r"[^\w\u4e00-\u9fff\-]+", "_", name)[:60]
    return name or "compliance-report"


@router.get("/profile/{profile_id}/report")
def download_report(
    profile_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Legacy endpoint kept for callers that expect raw Markdown.

    New code should hit the ``.md/.docx/.pdf`` variants below.
    """
    data = get_profile_by_id(db, user, profile_id)
    if not data:
        raise HTTPException(status_code=404, detail="合规档案不存在")
    md = build_audit_markdown(data)
    return Response(content=md, media_type="text/markdown; charset=utf-8")


@router.get("/profile/{profile_id}/report.{ext}")
def download_report_formatted(
    profile_id: str,
    ext: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Multi-format download: ``ext`` ∈ {md, docx, pdf}.

    Everything is driven from the same Markdown source so Word and PDF
    always stay in sync with the Markdown view.
    """
    ext = (ext or "").lower()
    if ext not in {"md", "docx", "pdf"}:
        raise HTTPException(status_code=400, detail="仅支持 md / docx / pdf 三种格式")
    data = get_profile_by_id(db, user, profile_id)
    if not data:
        raise HTTPException(status_code=404, detail="合规档案不存在")

    md = build_audit_markdown(data)
    basename = _safe_report_basename(data)
    download_name = f"{basename}.{ext}"

    if ext == "md":
        return Response(
            content=md,
            media_type="text/markdown; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{download_name}"',
            },
        )

    out_dir = _report_out_dir()
    out_path = out_dir / f"{basename}-{uuid4().hex[:8]}.{ext}"
    if ext == "docx":
        md_to_docx(md, out_path)
        media_type = (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
    else:
        md_to_pdf(md, out_path)
        media_type = "application/pdf"

    return FileResponse(
        path=out_path,
        media_type=media_type,
        filename=download_name,
    )


@router.get("/policy-radar")
def get_policy_radar(
    industry: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return policy_radar(db, user, industry=industry)


@router.get("/sub-audits")
def list_sub_audits(user: User = Depends(get_current_user)):
    """Expose the currently-registered compliance sub-audit plug-ins.

    Useful for ops UIs to show which "domain lenses" are wired in and which
    ones have been disabled via ``COMPLIANCE_SUBAUDITS_DISABLED``.
    """
    import os

    from apps.api.app.adapters.real.compliance_subaudits import (
        _REGISTRY,
        enabled_subaudits,
    )

    disabled = {
        p.strip()
        for p in (os.getenv("COMPLIANCE_SUBAUDITS_DISABLED") or "").split(",")
        if p.strip()
    }
    enabled = {p.name for p in enabled_subaudits()}
    return {
        "plugins": [
            {
                "name": name,
                "category": plugin.category,
                "enabled": name in enabled,
            }
            for name, plugin in _REGISTRY.items()
        ],
        "disabledViaEnv": sorted(disabled),
    }


# ---------------------------------------------------------------------------
# Subscription (合规 SaaS 配额)
# ---------------------------------------------------------------------------


@router.get("/subscription/tiers")
def list_tiers():
    return list(SUBSCRIPTION_TIERS.values())


@router.get("/subscription")
def read_subscription(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = get_profile(db, user)
    if not data:
        cfg = get_tier_config("free")
        return {
            "subscription": {
                **cfg,
                "usage": {"auditsThisMonth": 0, "policySubscriptions": 0, "assetsCount": 0},
                "available": {
                    "audits": cfg["monthlyAuditQuota"],
                    "assets": cfg["assetQuota"],
                    "policySubscriptions": cfg["policySubscriptionQuota"],
                },
            }
        }
    return {"subscription": data.get("subscription"), "companyName": data.get("companyName")}


class UpgradeBody(BaseModel):
    tier: str


@router.post("/subscription/upgrade")
def upgrade(
    body: UpgradeBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return upgrade_subscription(db, user, body.tier)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ---------------------------------------------------------------------------
# Policy subscriptions
# ---------------------------------------------------------------------------


@router.get("/policy-subscriptions")
def list_subscriptions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return list_policy_subscriptions(db, user)


class PolicySubscribeBody(BaseModel):
    topic: str
    industry: str | None = None
    frequency: str = "weekly"
    channels: list[str] | None = None


@router.post("/policy-subscriptions")
def subscribe_policy(
    body: PolicySubscribeBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return create_policy_subscription(
            db,
            user,
            topic=body.topic,
            industry=body.industry,
            frequency=body.frequency,
            channels=body.channels,
        )
    except ValueError as e:
        raise HTTPException(status_code=402, detail=str(e)) from e


class ToggleSubscriptionBody(BaseModel):
    active: bool


@router.post("/policy-subscriptions/{sub_id}/toggle")
def toggle_subscription(
    sub_id: str,
    body: ToggleSubscriptionBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ok = toggle_policy_subscription(db, user, sub_id, active=body.active)
    if not ok:
        raise HTTPException(status_code=404, detail="订阅不存在")
    return {"ok": True, "active": body.active}
