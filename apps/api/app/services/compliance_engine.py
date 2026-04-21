"""Compliance engine — 企业 IP 合规 SaaS.

- run_compliance_audit: 评估企业资产，生成评分 / 热力图 / 发现项
- list_policy_radar: 基于行业返回最近的政策摘要（调用 policyDigest port）
- build_report_markdown: 生成可渲染的审计报告
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.db.models import (
    ComplianceFinding,
    ComplianceProfile,
    IpAsset,
    PolicySubscription,
    SystemEvent,
    User,
)
from apps.api.app.services import event_types
from apps.api.app.services.event_bus import emit_event

logger = logging.getLogger(__name__)


class ComplianceQuotaExceeded(ValueError):
    """Raised when the current subscription tier has no audit quota left.

    Carries structured fields so the route layer can surface an actionable
    402 to the frontend (upgrade CTA) instead of a generic red toast.
    """

    def __init__(
        self,
        *,
        tier: str,
        tier_label: str,
        quota: int,
        used: int,
        message: str | None = None,
    ) -> None:
        super().__init__(
            message
            or f"当前「{tier_label}」本月合规体检额度 {quota} 次已用完，已使用 {used} 次，升级后可继续体检。"
        )
        self.tier = tier
        self.tier_label = tier_label
        self.quota = quota
        self.used = used


SUBSCRIPTION_TIERS: dict[str, dict[str, Any]] = {
    "free": {
        "tier": "free",
        "label": "免费版",
        "priceMonthly": 0,
        "monthlyAuditQuota": 3,
        "assetQuota": 10,
        "policySubscriptionQuota": 1,
        "features": [
            "每月 3 次合规体检",
            "台账上限 10 条",
            "订阅 1 个政策雷达主题",
            "基础 AI 答疑",
        ],
    },
    "pro": {
        "tier": "pro",
        "label": "专业版",
        "priceMonthly": 199,
        "monthlyAuditQuota": 30,
        "assetQuota": 200,
        "policySubscriptionQuota": 5,
        "features": [
            "每月 30 次合规体检",
            "台账上限 200 条",
            "订阅 5 个政策雷达主题",
            "场景化推送 · 每日报告",
            "AI 置信度 + 转人工律师",
        ],
    },
    "enterprise": {
        "tier": "enterprise",
        "label": "企业版",
        "priceMonthly": 999,
        "monthlyAuditQuota": -1,
        "assetQuota": -1,
        "policySubscriptionQuota": -1,
        "features": [
            "无限合规体检",
            "台账无上限",
            "政策雷达无限订阅 + 企业微信推送",
            "律所多账号协作 + 线索分派",
            "VIP 律师通道 · 1 小时响应",
            "专属客户成功经理",
        ],
    },
}


def get_tier_config(tier: str) -> dict[str, Any]:
    return SUBSCRIPTION_TIERS.get(tier, SUBSCRIPTION_TIERS["free"])


def _resolve_company_name(user: User, explicit: str | None) -> str:
    # ``ComplianceProfile.company_name`` 列非空；新用户未填企业名 / 姓名时，
    # 直接塞 None 会触发 IntegrityError，整个 POST /compliance/audit 以 500
    # 爆掉，用户侧表现为"点了没反应"。这里做一层兜底，邮箱前缀也失败就给
    # 一个明确占位，后续用户在 profile 页补齐后会覆盖。
    candidates = [
        explicit,
        getattr(user, "business_name", None),
        getattr(user, "full_name", None),
    ]
    email = getattr(user, "email", None)
    if email:
        candidates.append(email.split("@", 1)[0])
    for c in candidates:
        if c and str(c).strip():
            return str(c).strip()
    return "未命名企业"


def _find_or_create_profile(
    db: Session, user: User, company_name: str | None, industry: str | None, scale: str | None
) -> ComplianceProfile:
    profile = (
        db.query(ComplianceProfile)
        .filter(ComplianceProfile.owner_user_id == user.id)
        .order_by(ComplianceProfile.created_at.desc())
        .first()
    )
    resolved_name = _resolve_company_name(user, company_name)
    if profile is None:
        profile = ComplianceProfile(
            tenant_id=user.tenant_id,
            owner_user_id=user.id,
            company_name=resolved_name,
            industry=industry,
            scale=scale,
            subscription_tier="free",
        )
        db.add(profile)
    else:
        if company_name:
            profile.company_name = resolved_name
        elif not profile.company_name:
            profile.company_name = resolved_name
        if industry:
            profile.industry = industry
        if scale:
            profile.scale = scale
    db.flush()
    return profile


def run_compliance_audit(
    db: Session,
    *,
    user: User,
    company_name: str | None = None,
    industry: str | None = None,
    scale: str | None = None,
    trace_id: str | None = None,
) -> dict[str, Any]:
    profile = _find_or_create_profile(
        db, user, company_name or (user.business_name or user.full_name), industry or user.industry, scale
    )

    # 订阅分层配额拦截：超额直接拒绝，让"免费 / 专业 / 企业"三档真的有区别
    tier_cfg = get_tier_config(profile.subscription_tier)
    audit_quota = tier_cfg.get("monthlyAuditQuota", 0)
    if audit_quota != -1:
        usage = _month_usage(db, user, profile)
        if usage["auditsThisMonth"] >= audit_quota:
            raise ComplianceQuotaExceeded(
                tier=profile.subscription_tier,
                tier_label=tier_cfg["label"],
                quota=audit_quota,
                used=usage["auditsThisMonth"],
            )

    assets = db.query(IpAsset).filter(IpAsset.owner_id == user.id).all()
    asset_dicts = [
        {
            "id": a.id,
            "name": a.name,
            "type": a.asset_type,
            "status": a.status,
            "expires_at": a.expires_at.isoformat() if a.expires_at else None,
        }
        for a in assets
    ]

    auditor = provider_registry.get("complianceAudit")
    envelope = auditor.audit(
        company={
            "name": profile.company_name,
            "industry": profile.industry,
            "scale": profile.scale,
        },
        assets=asset_dicts,
        trace_id=trace_id or profile.id,
    )
    result = envelope.normalized_payload

    # Refresh findings (keep it idempotent — replace all findings)
    db.query(ComplianceFinding).filter(ComplianceFinding.profile_id == profile.id).delete()
    for f in result.get("findings", []):
        db.add(ComplianceFinding(
            profile_id=profile.id,
            severity=f.get("severity", "low"),
            category=f.get("category", "other"),
            title=f.get("title", ""),
            description=f.get("description"),
            remediation=f.get("remediation"),
            recommended_products=f.get("recommended_products", []),
            status="open",
        ))

    profile.compliance_score = int(result.get("score", 0))
    profile.score_breakdown = result.get("breakdown", {})
    profile.risk_heatmap = result.get("heatmap", {})
    profile.asset_summary = {
        "total": len(assets),
        "by_type": _count_assets(assets),
    }
    profile.last_audit_at = datetime.now(timezone.utc)
    # 生成 AI 一句话诊断（替换前端 DonutRing 下方原本多余的 "60" 小字）。
    # LLM 失败或未配置时自动落回规则化文案，保证 UI 永远有可读结论。
    profile.ai_summary = _build_ai_summary(
        company_name=profile.company_name,
        industry=profile.industry,
        scale=profile.scale,
        score=profile.compliance_score,
        findings=result.get("findings", []) or [],
        heatmap=profile.risk_heatmap or {},
    )

    # 合规体检完成 → 发事件给场景推送规则 scenario.compliance_score_low
    try:
        findings = result.get("findings", []) or []
        high_findings = sum(
            1 for f in findings if (f or {}).get("severity") in ("high", "critical", "red")
        )
        emit_event(
            db,
            event_type=event_types.COMPLIANCE_AUDIT_COMPLETED,
            user_id=user.id,
            tenant_id=profile.tenant_id,
            source_entity_type="compliance_profile",
            source_entity_id=profile.id,
            payload={
                "profile_id": profile.id,
                "score": int(profile.compliance_score or 0),
                "industry": profile.industry,
                "findings_count": len(findings),
                "high_severity_count": high_findings,
                "subscription_tier": profile.subscription_tier,
            },
        )
    except Exception:
        logger.exception("emit compliance.audit_completed failed for profile %s", profile.id)

    db.commit()
    db.refresh(profile)

    return {
        "profile_id": profile.id,
        "score": profile.compliance_score,
        "breakdown": profile.score_breakdown,
        "heatmap": profile.risk_heatmap,
        "summary": result.get("summary"),
        "aiSummary": profile.ai_summary,
        "findings": result.get("findings", []),
        "asset_summary": profile.asset_summary,
    }


# ---------------------------------------------------------------------------
# AI 诊断文案（替换 DonutRing 下方冗余的数字 label）
# ---------------------------------------------------------------------------


_HEATMAP_LABEL_CN = {
    "brand_protection": "品牌保护",
    "technology_protection": "技术保护",
    "software_copyright": "软件版权",
    "contract_hygiene": "合同健康",
    "policy_awareness": "政策敏感度",
}


def _build_ai_summary(
    *,
    company_name: str | None,
    industry: str | None,
    scale: str | None,
    score: int,
    findings: list[dict[str, Any]],
    heatmap: dict[str, int],
) -> str:
    """返回一句话 (≤60 字) 的合规健康诊断。

    优先调用 LLM 生成“分析 + 下一步建议”的自然语言结论；LLM 不可用 / 超时 /
    返回空时落回规则化文案，保证前端 UI 永远有可渲染的文本。
    """
    high = [f for f in findings if (f or {}).get("severity") in ("high", "critical", "red")]
    medium = [f for f in findings if (f or {}).get("severity") in ("medium", "warn", "amber")]
    weakest = _weakest_dimension(heatmap)

    rule_based = _rule_based_ai_summary(
        score=score, high=len(high), medium=len(medium), weakest=weakest, industry=industry
    )

    try:
        llm = provider_registry.get("llm")
    except Exception:  # pragma: no cover — registry may not have LLM wired
        return rule_based
    if llm is None:  # pragma: no cover — defensive
        return rule_based

    try:
        user_prompt = _format_llm_prompt(
            company_name=company_name,
            industry=industry,
            scale=scale,
            score=score,
            findings=findings,
            heatmap=heatmap,
            weakest=weakest,
        )
        system_prompt = (
            "你是一位 IP 合规分析师。请基于给定的企业合规体检数据输出"
            "一句不超过 60 个汉字的结论，要求："
            "1) 指出当前总体健康度；"
            "2) 点出最需要关注的一个维度或风险；"
            "3) 给出一个可执行的下一步建议；"
            "不要分点、不要 Markdown、不要出现分数数字、不要加引号。"
        )
        text = llm.chat(system_prompt, user_prompt) or ""
    except Exception:
        logger.info("compliance.ai_summary.llm_failed — falling back to rule text", exc_info=True)
        return rule_based

    text = text.strip().strip('"“”\'`').replace("\n", " ")
    if not text:
        return rule_based
    if len(text) > 80:
        text = text[:78].rstrip("，,.;；、 ") + "…"
    return text


def _weakest_dimension(heatmap: dict[str, int]) -> tuple[str, int] | None:
    if not heatmap:
        return None
    try:
        key, value = min(heatmap.items(), key=lambda kv: int(kv[1] or 0))
    except Exception:  # pragma: no cover — defensive
        return None
    return _HEATMAP_LABEL_CN.get(key, key), int(value or 0)


def _rule_based_ai_summary(
    *,
    score: int,
    high: int,
    medium: int,
    weakest: tuple[str, int] | None,
    industry: str | None,
) -> str:
    """确定性兜底：无 LLM 时也能给出“有营养”的一句话结论。"""
    if score >= 85:
        health = "整体健康度良好"
    elif score >= 70:
        health = "整体达标但仍有短板"
    elif score >= 50:
        health = "多项指标承压"
    else:
        health = "合规风险较高"

    focus = ""
    if weakest is not None:
        dim, val = weakest
        focus = f"，其中{dim}仅 {val} 分需优先加固"

    if high:
        action = f"；建议先处理 {high} 项高风险问题"
    elif medium:
        action = f"；建议尽快清理 {medium} 项中等风险"
    else:
        action = "；可按季度复检并持续积累资产"

    prefix = f"{industry}行业" if industry else "当前档案"
    return f"{prefix}{health}{focus}{action}。"


def _format_llm_prompt(
    *,
    company_name: str | None,
    industry: str | None,
    scale: str | None,
    score: int,
    findings: list[dict[str, Any]],
    heatmap: dict[str, int],
    weakest: tuple[str, int] | None,
) -> str:
    lines: list[str] = [
        f"企业名称: {company_name or '未提供'}",
        f"行业: {industry or '未提供'}",
        f"规模: {scale or '未提供'}",
        f"综合合规分: {score}/100",
    ]
    if heatmap:
        hm_str = "、".join(
            f"{_HEATMAP_LABEL_CN.get(k, k)}={v}" for k, v in heatmap.items()
        )
        lines.append(f"风险热力图: {hm_str}")
    if weakest is not None:
        dim, val = weakest
        lines.append(f"当前最薄弱维度: {dim}（{val} 分）")
    if findings:
        preview = "; ".join(
            f"[{f.get('severity','?')}] {f.get('title') or f.get('category') or ''}"
            for f in findings[:5]
        )
        lines.append(f"Top 发现项: {preview}")
        lines.append(f"发现项总数: {len(findings)}")
    return "\n".join(lines)


def _count_assets(assets: list[IpAsset]) -> dict[str, int]:
    out: dict[str, int] = {}
    for a in assets:
        out[a.asset_type] = out.get(a.asset_type, 0) + 1
    return out


def get_profile(db: Session, user: User) -> dict[str, Any] | None:
    profile = (
        db.query(ComplianceProfile)
        .filter(ComplianceProfile.owner_user_id == user.id)
        .order_by(ComplianceProfile.created_at.desc())
        .first()
    )
    if not profile:
        return None
    return profile_to_dict(db, profile)


def get_profile_by_id(db: Session, user: User, profile_id: str) -> dict[str, Any] | None:
    profile = db.query(ComplianceProfile).filter(ComplianceProfile.id == profile_id).first()
    if not profile:
        return None
    if profile.owner_user_id != user.id and (not user.tenant_id or profile.tenant_id != user.tenant_id):
        return None
    return profile_to_dict(db, profile)


def _month_usage(db: Session, user: User, profile: ComplianceProfile) -> dict[str, int]:
    """统计本月用量：审计次数、政策订阅、资产数。

    审计次数以 ``SystemEvent(event_type=compliance.audit_completed)`` 为准，
    每次体检都会 ``emit_event`` 一条记录。这样多次「重新体检」会自增，而不是
    卡在 ``ComplianceProfile.last_audit_at`` 只能取最后一次时间的问题上。
    """
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    audits_this_month = (
        db.query(SystemEvent)
        .filter(
            SystemEvent.event_type == event_types.COMPLIANCE_AUDIT_COMPLETED,
            SystemEvent.user_id == user.id,
            SystemEvent.created_at >= month_start,
        )
        .count()
    )
    policy_subs = (
        db.query(PolicySubscription)
        .filter(PolicySubscription.user_id == user.id, PolicySubscription.active.is_(True))
        .count()
    )
    assets_count = db.query(IpAsset).filter(IpAsset.owner_id == user.id).count()

    return {
        "auditsThisMonth": int(audits_this_month),
        "policySubscriptions": int(policy_subs),
        "assetsCount": int(assets_count),
    }


def profile_to_dict(db: Session, profile: ComplianceProfile) -> dict[str, Any]:
    findings = (
        db.query(ComplianceFinding)
        .filter(ComplianceFinding.profile_id == profile.id)
        .order_by(ComplianceFinding.severity.desc())
        .all()
    )
    tier_cfg = get_tier_config(profile.subscription_tier)
    owner = db.query(User).filter(User.id == profile.owner_user_id).first()
    usage = _month_usage(db, owner, profile) if owner else {
        "auditsThisMonth": 0, "policySubscriptions": 0, "assetsCount": 0,
    }

    return {
        "id": profile.id,
        "companyName": profile.company_name,
        "industry": profile.industry,
        "scale": profile.scale,
        "score": profile.compliance_score,
        "breakdown": profile.score_breakdown or {},
        "heatmap": profile.risk_heatmap or {},
        "assetSummary": profile.asset_summary or {},
        # 前端 DonutRing 下方展示的一句话 AI 诊断。老档案（体检前）可能为 None，
        # UI 会自动回退到按评分分级的模板文案。
        "aiSummary": profile.ai_summary,
        "subscriptionTier": profile.subscription_tier,
        "subscription": {
            **tier_cfg,
            "usage": usage,
            "available": {
                "audits": None if tier_cfg["monthlyAuditQuota"] == -1 else max(
                    0, tier_cfg["monthlyAuditQuota"] - usage["auditsThisMonth"]
                ),
                "assets": None if tier_cfg["assetQuota"] == -1 else max(
                    0, tier_cfg["assetQuota"] - usage["assetsCount"]
                ),
                "policySubscriptions": None if tier_cfg["policySubscriptionQuota"] == -1 else max(
                    0, tier_cfg["policySubscriptionQuota"] - usage["policySubscriptions"]
                ),
            },
        },
        "lastAuditAt": profile.last_audit_at.isoformat() if profile.last_audit_at else None,
        "findings": [{
            "id": f.id,
            "severity": f.severity,
            "category": f.category,
            "title": f.title,
            "description": f.description,
            "remediation": f.remediation,
            "recommendedProducts": f.recommended_products or [],
            "status": f.status,
        } for f in findings],
        "createdAt": profile.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Policy subscriptions
# ---------------------------------------------------------------------------


def list_policy_subscriptions(db: Session, user: User) -> list[dict[str, Any]]:
    rows = (
        db.query(PolicySubscription)
        .filter(PolicySubscription.user_id == user.id)
        .order_by(PolicySubscription.active.desc(), PolicySubscription.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "industry": r.industry,
            "topic": r.topic,
            "frequency": r.frequency,
            "channels": r.channels or [],
            "active": r.active,
            "lastSentAt": r.last_sent_at.isoformat() if r.last_sent_at else None,
            "createdAt": r.created_at.isoformat(),
        }
        for r in rows
    ]


def create_policy_subscription(
    db: Session,
    user: User,
    *,
    topic: str,
    industry: str | None = None,
    frequency: str = "weekly",
    channels: list[str] | None = None,
) -> dict[str, Any]:
    # 配额校验
    profile = (
        db.query(ComplianceProfile)
        .filter(ComplianceProfile.owner_user_id == user.id)
        .first()
    )
    tier = profile.subscription_tier if profile else "free"
    cfg = get_tier_config(tier)
    quota = cfg["policySubscriptionQuota"]
    if quota != -1:
        active_count = (
            db.query(PolicySubscription)
            .filter(PolicySubscription.user_id == user.id, PolicySubscription.active.is_(True))
            .count()
        )
        if active_count >= quota:
            raise ValueError(
                f"当前「{cfg['label']}」每月订阅上限为 {quota}，升级后可继续订阅。"
            )

    sub = PolicySubscription(
        user_id=user.id,
        industry=industry or user.industry,
        topic=topic,
        frequency=frequency,
        channels=channels or ["inapp"],
        active=True,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return {
        "id": sub.id,
        "industry": sub.industry,
        "topic": sub.topic,
        "frequency": sub.frequency,
        "channels": sub.channels or [],
        "active": sub.active,
        "createdAt": sub.created_at.isoformat(),
    }


def toggle_policy_subscription(db: Session, user: User, sub_id: str, active: bool) -> bool:
    sub = db.query(PolicySubscription).filter(
        PolicySubscription.id == sub_id, PolicySubscription.user_id == user.id
    ).first()
    if not sub:
        return False
    sub.active = active
    db.commit()
    return True


def upgrade_subscription(db: Session, user: User, new_tier: str) -> dict[str, Any]:
    if new_tier not in SUBSCRIPTION_TIERS:
        raise ValueError(f"未知订阅等级：{new_tier}")
    profile = (
        db.query(ComplianceProfile)
        .filter(ComplianceProfile.owner_user_id == user.id)
        .order_by(ComplianceProfile.created_at.desc())
        .first()
    )
    if not profile:
        profile = ComplianceProfile(
            tenant_id=user.tenant_id,
            owner_user_id=user.id,
            company_name=user.business_name or user.full_name,
            industry=user.industry,
            subscription_tier=new_tier,
        )
        db.add(profile)
    else:
        profile.subscription_tier = new_tier
    db.commit()
    db.refresh(profile)
    return profile_to_dict(db, profile)


def policy_radar(db: Session, user: User, industry: str | None = None) -> dict[str, Any]:
    industry = industry or user.industry or "通用"
    # LLM / provider 出错时不应把整个 Tab 打成 500：前端会渲染空白或 ErrorDisplay，
    # 用户除了刷新没有其它行动。这里统一降级到 normalize_policy_digest_payload 的
    # 默认示例内容，并在 disclaimer / provider 里标明是兜底，前端照常渲染。
    try:
        digest = provider_registry.get("policyDigest")
        envelope = digest.digest(industry, trace_id=f"policy-{user.id}")
        payload = envelope.normalized_payload or {}
        return {
            "industry": industry,
            "provider": envelope.provider,
            "retrievedAt": envelope.retrieved_at.isoformat(),
            "policies": payload.get("policies", []),
            "summary": payload.get("summary", ""),
            "disclaimer": envelope.disclaimer,
        }
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("policy_radar fallback: %s", exc)
        from apps.api.app.adapters.real.policy_digest import (
            normalize_policy_digest_payload,
        )

        payload = normalize_policy_digest_payload(None, industry)
        return {
            "industry": industry,
            "provider": "fallback",
            "retrievedAt": datetime.now(timezone.utc).isoformat(),
            "policies": payload.get("policies", []),
            "summary": payload.get("compliance_notes", ""),
            "disclaimer": "政策雷达暂不可用，展示的是示例内容，仅供参考。",
        }


def build_audit_markdown(profile_dict: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# {profile_dict['companyName']} · IP 合规体检报告")
    lines.append("")
    lines.append(f"> 合规评分：**{profile_dict['score']} / 100**")
    lines.append(f"> 行业：{profile_dict.get('industry') or '未填写'} · 规模：{profile_dict.get('scale') or '未填写'}")
    lines.append("")
    lines.append("## 一、资产总览")
    summary = profile_dict.get("assetSummary", {})
    lines.append(f"- 资产总数：{summary.get('total', 0)}")
    for t, c in (summary.get("by_type") or {}).items():
        lines.append(f"- {t}：{c}")
    lines.append("")
    lines.append("## 二、合规分项评分")
    for k, v in (profile_dict.get("breakdown") or {}).items():
        lines.append(f"- {k}：{v}")
    lines.append("")
    lines.append("## 三、风险热力图")
    for k, v in (profile_dict.get("heatmap") or {}).items():
        bar = "■" * max(0, min(int(v // 10), 10))
        lines.append(f"- {k}：{bar} ({v})")
    lines.append("")
    lines.append("## 四、合规发现")
    for i, f in enumerate(profile_dict.get("findings", []), 1):
        lines.append(f"### {i}. [{f['severity'].upper()}] {f['title']}")
        if f.get("description"):
            lines.append(f.get("description"))
        if f.get("remediation"):
            lines.append(f"**建议：** {f['remediation']}")
        if f.get("recommendedProducts"):
            lines.append(f"**推荐服务：** {', '.join(f['recommendedProducts'])}")
        lines.append("")
    lines.append("---")
    lines.append("*本报告基于用户提供的资产信息与公开规则生成，仅供参考，以官方监管要求为准。*")
    return "\n".join(lines)
