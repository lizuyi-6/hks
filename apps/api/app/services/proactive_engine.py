"""ProactiveEngine — AI 主动副驾引擎.

When the user lands on a page, the frontend FloatingAgent calls
``peek(user, route, resource_id)``. This engine:

  1. Evaluates the page-visit rules defined in :data:`PROACTIVE_TRIGGERS`
     against the user's current state (画像 / 资产 / 合规分 / 线索池 /
     订单 / 近 7 天 ``SystemEvent``).
  2. Honors per-user cooldowns and dismissal preferences
     (:class:`ProactiveDismissal` + recent :class:`ProactiveSuggestion`).
  3. For the first matched rule, asks the LLM to turn the rule's
     ``llm_brief`` + the captured context into a short, personalized
     ``{title, body}``. Falls back to the rule's static template if the
     LLM times out or errors.
  4. Persists the resulting :class:`ProactiveSuggestion` so ``execute`` /
     ``dismiss`` / feedback can refer back to it by id.

Design contract:

- Rules are pure ``condition_fn(ctx) -> dict | None``. When they match,
  they return a "signal" dict that is both stored on the suggestion and
  injected into the LLM prompt.
- Actions reuse :func:`chat_service._execute_action`. The engine never
  calls side-effect-producing tools itself — only the frontend can
  ``POST /agent/proactive/execute`` after the user clicks.
- Rules that only want to navigate somewhere can include ``kind="navigate"``
  actions; the frontend handles those without hitting the backend again.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from sqlalchemy.orm import Session

from apps.api.app.adapters.registry import provider_registry
from apps.api.app.db.models import (
    ComplianceFinding,
    ComplianceProfile,
    ConsultationSession,
    IpAsset,
    MatchingRequest,
    ProactiveDismissal,
    ProactiveSuggestion,
    ProviderLead,
    ServiceOrder,
    SystemEvent,
    User,
)

logger = logging.getLogger(__name__)


# 10 minute cache for LLM text so tab switching doesn't re-spend tokens.
_SUGGESTION_TTL_MINUTES = 10
# How long before a proactive suggestion becomes stale and is pruned.
_SUGGESTION_EXPIRES_AFTER_HOURS = 24
# Quiet hours (local clock, server TZ) — skip `peek` responses so we
# don't interrupt users off-work. Dashboard/briefing rules opt out.
_QUIET_HOURS = range(22, 24), range(0, 8)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    """Normalize a datetime to tz-aware UTC.

    SQLite strips tz on read-back even when the column is ``DateTime(timezone=True)``;
    Postgres keeps it. To stay robust across both backends (prod + test) we
    coerce naive values to UTC before doing any arithmetic against
    ``_utcnow()``.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ============================================================================
# Context aggregation
# ============================================================================


@dataclass
class ProactiveContext:
    """All the state a rule might want to inspect, built once per ``peek``."""

    user: User
    route: str
    resource_type: str | None
    resource_id: str | None
    now: datetime

    # Business state (lazy; populated on first read via helpers below).
    compliance_profile: ComplianceProfile | None = None
    recent_findings: list[ComplianceFinding] = field(default_factory=list)
    assets: list[IpAsset] = field(default_factory=list)
    recent_leads: list[ProviderLead] = field(default_factory=list)
    recent_matches: list[MatchingRequest] = field(default_factory=list)
    recent_orders: list[ServiceOrder] = field(default_factory=list)
    recent_events: list[SystemEvent] = field(default_factory=list)
    consultations: list[ConsultationSession] = field(default_factory=list)


def _build_context(
    db: Session,
    user: User,
    route: str,
    resource_type: str | None,
    resource_id: str | None,
) -> ProactiveContext:
    """Pull the minimum state the registered rules may need.

    We fetch everything with simple LIMITed queries — it's fine to over-fetch
    a little because ``peek`` runs at most once per user per 10 minutes per
    route (cache + cooldown), not per keystroke.
    """
    now = _utcnow()
    ctx = ProactiveContext(
        user=user,
        route=route or "/",
        resource_type=resource_type,
        resource_id=resource_id,
        now=now,
    )

    try:
        ctx.compliance_profile = (
            db.query(ComplianceProfile)
            .filter(ComplianceProfile.owner_user_id == user.id)
            .order_by(ComplianceProfile.updated_at.desc())
            .first()
        )
    except Exception:  # pragma: no cover — defensive
        logger.debug("proactive.ctx: compliance profile fetch failed", exc_info=True)

    if ctx.compliance_profile is not None:
        try:
            ctx.recent_findings = (
                db.query(ComplianceFinding)
                .filter(ComplianceFinding.profile_id == ctx.compliance_profile.id)
                .order_by(ComplianceFinding.created_at.desc())
                .limit(20)
                .all()
            )
        except Exception:  # pragma: no cover
            ctx.recent_findings = []

    try:
        ctx.assets = (
            db.query(IpAsset)
            .filter(IpAsset.owner_id == user.id)
            .order_by(IpAsset.created_at.desc())
            .limit(50)
            .all()
        )
    except Exception:  # pragma: no cover
        ctx.assets = []

    try:
        ctx.recent_matches = (
            db.query(MatchingRequest)
            .filter(MatchingRequest.user_id == user.id)
            .order_by(MatchingRequest.created_at.desc())
            .limit(10)
            .all()
        )
    except Exception:  # pragma: no cover
        ctx.recent_matches = []

    try:
        ctx.recent_orders = (
            db.query(ServiceOrder)
            .filter(ServiceOrder.user_id == user.id)
            .order_by(ServiceOrder.updated_at.desc())
            .limit(10)
            .all()
        )
    except Exception:  # pragma: no cover
        ctx.recent_orders = []

    # Provider-side leads: if this user happens to own a provider account,
    # surface their hot leads. We resolve via provider.user_id == user.id.
    try:
        from apps.api.app.db.models import LegalServiceProvider

        provider_ids = [
            p.id
            for p in db.query(LegalServiceProvider)
            .filter(LegalServiceProvider.user_id == user.id)
            .all()
        ]
        if provider_ids:
            ctx.recent_leads = (
                db.query(ProviderLead)
                .filter(ProviderLead.provider_id.in_(provider_ids))
                .order_by(ProviderLead.created_at.desc())
                .limit(50)
                .all()
            )
    except Exception:  # pragma: no cover
        ctx.recent_leads = []

    try:
        since = now - timedelta(days=7)
        ctx.recent_events = (
            db.query(SystemEvent)
            .filter(SystemEvent.user_id == user.id, SystemEvent.created_at >= since)
            .order_by(SystemEvent.created_at.desc())
            .limit(50)
            .all()
        )
    except Exception:  # pragma: no cover
        ctx.recent_events = []

    try:
        ctx.consultations = (
            db.query(ConsultationSession)
            .filter(ConsultationSession.user_id == user.id)
            .order_by(ConsultationSession.created_at.desc())
            .limit(10)
            .all()
        )
    except Exception:  # pragma: no cover
        ctx.consultations = []

    return ctx


# ============================================================================
# Rule registry (initial 9 triggers: 6 C-side + 2 B-side + 1 daily_briefing)
# ============================================================================


RuleFn = Callable[[ProactiveContext], dict | None]


@dataclass
class ProactiveRule:
    """Declarative "when to speak up" definition.

    ``route_prefixes`` matches ``ctx.route.startswith(...)``. Pass ``["*"]``
    to ignore the route filter (e.g. daily briefing surfaces on any page
    first-thing in the morning). ``cooldown_hours`` is per-user.
    """

    rule_key: str
    route_prefixes: list[str]
    condition: RuleFn
    llm_brief: str  # 1-sentence instruction for the LLM text generator
    fallback_title: str
    fallback_body: str
    actions: list[dict]
    cooldown_hours: int = 24
    # If True, ignore the global quiet-hours filter (e.g. daily briefing
    # itself should still be available after 10pm if user opens the app).
    allow_quiet_hours: bool = False


# ---- Rule bodies (pure, take ProactiveContext, return signal dict or None)


def _rule_compliance_score_drop(ctx: ProactiveContext) -> dict | None:
    profile = ctx.compliance_profile
    if profile is None or profile.compliance_score <= 0:
        return None

    # Look at the previous audit implicit in the last couple of
    # compliance.audit_completed events for this user.
    prev_score: int | None = None
    for ev in ctx.recent_events:
        if ev.event_type != "compliance.audit_completed":
            continue
        if ev.source_entity_id == profile.id:
            # skip the current profile's most recent event (which is the
            # one matching profile.compliance_score)
            payload_score = (ev.payload or {}).get("score")
            if payload_score is None or int(payload_score) == profile.compliance_score:
                continue
            prev_score = int(payload_score)
            break

    if prev_score is None or prev_score <= profile.compliance_score:
        return None

    drop = prev_score - profile.compliance_score
    if drop < 5:
        return None

    high_findings = [f for f in ctx.recent_findings if f.severity in {"critical", "high"}]
    return {
        "current_score": profile.compliance_score,
        "previous_score": prev_score,
        "drop": drop,
        "high_findings": len(high_findings),
        "top_findings": [f.title for f in high_findings[:3]],
        "profile_id": profile.id,
    }


def _rule_asset_expiring(ctx: ProactiveContext) -> dict | None:
    expiring: list[IpAsset] = []
    for a in ctx.assets:
        exp = _aware(a.expires_at)
        if exp is None:
            continue
        days = (exp - ctx.now).days
        if 0 <= days <= 90:
            expiring.append(a)
    if not expiring:
        return None
    first = expiring[0]
    first_exp = _aware(first.expires_at)
    return {
        "expiring_count": len(expiring),
        "earliest_asset": {
            "id": first.id,
            "name": first.name,
            "type": first.asset_type,
            "days_until_expiry": (first_exp - ctx.now).days if first_exp else None,
        },
        "asset_names": [a.name for a in expiring[:3]],
    }


def _rule_asset_added_no_scan(ctx: ProactiveContext) -> dict | None:
    if not ctx.assets:
        return None
    cutoff = ctx.now - timedelta(days=7)
    recent_new = [
        a for a in ctx.assets if a.created_at and _aware(a.created_at) >= cutoff
    ]
    if not recent_new:
        return None
    # Suppress if user has run a compliance audit after the new asset was added.
    if ctx.compliance_profile and ctx.compliance_profile.last_audit_at:
        last_audit = _aware(ctx.compliance_profile.last_audit_at)
        first_created = _aware(recent_new[0].created_at)
        if last_audit and first_created and last_audit >= first_created:
            return None
    return {
        "new_asset_count": len(recent_new),
        "asset_names": [a.name for a in recent_new[:3]],
    }


def _rule_matched_no_consult(ctx: ProactiveContext) -> dict | None:
    if not ctx.recent_matches:
        return None
    # Any match in the last 14 days?
    cutoff = ctx.now - timedelta(days=14)
    recent = [m for m in ctx.recent_matches if _aware(m.created_at) >= cutoff]
    if not recent:
        return None
    # Any consultation started after the earliest recent match?
    earliest = min(_aware(m.created_at) for m in recent)
    follow_up = [c for c in ctx.consultations if _aware(c.created_at) >= earliest]
    if follow_up:
        return None
    m = recent[0]
    return {
        "matches_count": len(recent),
        "last_intent": m.intent_category,
        "last_query": (m.raw_query or "")[:80],
        "last_match_id": m.id,
    }


def _rule_consult_empty_urgent(ctx: ProactiveContext) -> dict | None:
    # The user is on /consult with no active session — offer a starter based
    # on the strongest recent signal (asset expiring / compliance drop /
    # recent match). Keeps the empty state from being dead silent.
    if not ctx.route.startswith("/consult"):
        return None
    # If they have an active consultation already, do nothing.
    active = [c for c in ctx.consultations if c.status in ("ai_active", "ai_live")]
    if active:
        return None

    # Find the most urgent starter seed.
    expiring_signal = _rule_asset_expiring(ctx)
    drop_signal = _rule_compliance_score_drop(ctx)
    match_signal = _rule_matched_no_consult(ctx)

    seed = None
    reason = None
    if expiring_signal and expiring_signal["earliest_asset"].get("days_until_expiry") is not None:
        seed = expiring_signal["earliest_asset"]["name"]
        reason = "asset_expiring"
    elif drop_signal:
        seed = "企业合规分下降"
        reason = "compliance_drop"
    elif match_signal:
        seed = match_signal["last_query"] or match_signal["last_intent"]
        reason = "matched_no_consult"

    if not seed:
        return None
    return {"seed": seed, "reason": reason}


def _rule_provider_hot_lead_aging(ctx: ProactiveContext) -> dict | None:
    if not ctx.recent_leads:
        return None
    hot_aging = []
    cutoff = ctx.now - timedelta(hours=24)
    for lead in ctx.recent_leads:
        if lead.status not in ("new", "claimed"):
            continue
        if lead.temperature != "hot":
            continue
        if _aware(lead.created_at) > cutoff:
            continue
        # "Unresponded" = never viewed or claimed.
        if lead.claimed_at is None and lead.last_viewed_at is None:
            hot_aging.append(lead)
    if not hot_aging:
        return None
    return {"hot_aging_count": len(hot_aging), "lead_ids": [l.id for l in hot_aging[:5]]}


def _rule_order_silent(ctx: ProactiveContext) -> dict | None:
    if not ctx.recent_orders:
        return None
    cutoff = ctx.now - timedelta(hours=48)
    silent: list[ServiceOrder] = []
    for o in ctx.recent_orders:
        if o.status in ("closed", "cancelled", "delivered"):
            continue
        upd = _aware(o.updated_at)
        if upd and upd <= cutoff:
            silent.append(o)
    if not silent:
        return None
    first = silent[0]
    return {
        "silent_count": len(silent),
        "top_order_id": first.id,
        "top_order_no": first.order_no,
        "top_order_status": first.status,
    }


def _rule_daily_briefing(ctx: ProactiveContext) -> dict | None:
    # A lightweight digest: summarize a handful of interesting recent events
    # (<= 7 days). This is the only rule that runs from any page.
    if not ctx.recent_events:
        return None
    interesting = [
        ev
        for ev in ctx.recent_events
        if ev.event_type
        in (
            "compliance.audit_completed",
            "monitoring.alert",
            "asset.expiring_soon",
            "litigation.predicted",
            "matching.requested",
            "provider.lead_created",
            "policy.digest_ready",
        )
    ]
    if len(interesting) < 2:
        return None
    highlights = []
    for ev in interesting[:5]:
        payload = ev.payload or {}
        title = payload.get("title") or ev.event_type
        detail = payload.get("detail")
        highlights.append(
            {
                "event_type": ev.event_type,
                "title": title,
                "detail": detail,
                "at": ev.created_at.isoformat(),
            }
        )
    return {"event_count": len(interesting), "highlights": highlights}


PROACTIVE_TRIGGERS: list[ProactiveRule] = [
    ProactiveRule(
        rule_key="enterprise.compliance_score_drop",
        route_prefixes=["/enterprise"],
        condition=_rule_compliance_score_drop,
        llm_brief=(
            "用户的企业 IP 合规分最近下降了。请用一句话告诉用户：分数从多少"
            "降到了多少、主要因为哪些高危发现，并建议重跑一次体检。"
        ),
        fallback_title="合规分有下降，要不要重跑一次体检？",
        fallback_body="最近一次体检出现新的高危发现，建议重新扫描确认修复进度。",
        actions=[
            {
                "id": "run_audit",
                "label": "立即体检",
                "tool": "compliance_scan",
                "params": {},
                "kind": "primary",
            },
            {
                "id": "view_findings",
                "label": "查看发现项",
                "tool": None,
                "params": {"href": "/enterprise"},
                "kind": "navigate",
            },
        ],
    ),
    ProactiveRule(
        rule_key="assets.expiring_within_90d",
        route_prefixes=["/assets", "/dashboard", "/enterprise"],
        condition=_rule_asset_expiring,
        llm_brief=(
            "用户有 IP 资产 90 天内到期。请用一句话提醒：最早到期的资产是什么、"
            "还剩多少天、建议现在委托律师办理续展。"
        ),
        fallback_title="有资产快到期了，要不要现在安排续展？",
        fallback_body="90 天内有资产即将到期，越靠近截止日越贵，建议提前委托律师办理。",
        actions=[
            {
                "id": "match_lawyer",
                "label": "匹配续展律师",
                "tool": "find_lawyer",
                "params": {"raw_query": "帮我办理续展"},
                "kind": "primary",
            },
            {
                "id": "view_assets",
                "label": "查看资产",
                "tool": None,
                "params": {"href": "/assets"},
                "kind": "navigate",
            },
        ],
    ),
    ProactiveRule(
        rule_key="assets.asset_added_no_scan",
        route_prefixes=["/assets", "/dashboard"],
        condition=_rule_asset_added_no_scan,
        llm_brief=(
            "用户最近 7 天新增了 IP 资产但还没跑过合规体检。请鼓励用户花 1 分钟"
            "跑一次，以便把新资产纳入评分。"
        ),
        fallback_title="新资产入账了，1 分钟跑一次合规体检？",
        fallback_body="新入账的资产还没纳入合规评分，现在体检一次可以把它们一起评估进去。",
        actions=[
            {
                "id": "run_audit",
                "label": "立即体检",
                "tool": "compliance_scan",
                "params": {},
                "kind": "primary",
            },
        ],
    ),
    ProactiveRule(
        rule_key="match.matched_no_consult_14d",
        route_prefixes=["/match", "/dashboard"],
        condition=_rule_matched_no_consult,
        llm_brief=(
            "用户最近 14 天发起过匹配但没有发起咨询或订单。请一句话提醒："
            "要不要直接约一位匹配到的律师聊聊？"
        ),
        fallback_title="匹配过几位律师，要不要直接聊一下？",
        fallback_body="上次匹配后没有跟进动作，直接发起 AI 首诊 + 一键转人工最省事。",
        actions=[
            {
                "id": "start_consult",
                "label": "发起咨询",
                "tool": "start_consultation",
                "params": {"topic": "继续上次的匹配", "channel": "ai"},
                "kind": "primary",
            },
            {
                "id": "view_match",
                "label": "查看匹配",
                "tool": None,
                "params": {"href": "/match"},
                "kind": "navigate",
            },
        ],
    ),
    ProactiveRule(
        rule_key="consult.empty_with_urgent_signal",
        route_prefixes=["/consult"],
        condition=_rule_consult_empty_urgent,
        llm_brief=(
            "用户打开了咨询页但还没开口说话。基于 seed 字段提到的最强信号，"
            "主动用一句话开场（像资深律师同事），并建议一个具体的下一步动作。"
        ),
        fallback_title="我注意到有件事你可能想先聊",
        fallback_body="根据你最近的状态，有一些能立刻推进的动作——要不要一起看看？",
        actions=[
            {
                "id": "start_consult",
                "label": "开始聊",
                "tool": "start_consultation",
                "params": {"topic": "根据当前状态主动发起", "channel": "ai"},
                "kind": "primary",
            },
        ],
        # Consult page surfaces are useful even late at night (emergencies).
        allow_quiet_hours=True,
        cooldown_hours=6,
    ),
    ProactiveRule(
        rule_key="provider.hot_lead_aging",
        route_prefixes=["/provider"],
        condition=_rule_provider_hot_lead_aging,
        llm_brief=(
            "律师端：有 🔥 热线索超过 24 小时没响应。请用一句话提醒："
            "具体有几条老化、响应越快签单概率越高，建议马上去看看。"
        ),
        fallback_title="有几条热线索超过 24 小时没响应了",
        fallback_body="线索温度越高越怕凉，建议先把这几条认领或至少点开看看。",
        actions=[
            {
                "id": "view_leads",
                "label": "打开线索池",
                "tool": None,
                "params": {"href": "/provider?tab=leads&temperature=hot"},
                "kind": "primary",
            },
        ],
        cooldown_hours=12,
    ),
    ProactiveRule(
        rule_key="provider.order_silent_48h",
        route_prefixes=["/provider", "/orders"],
        condition=_rule_order_silent,
        llm_brief=(
            "有订单 48 小时没有推进（非终态）。请用一句话提醒用户，"
            "并建议打开订单确认下一步里程碑。"
        ),
        fallback_title="有订单 48 小时没动，要不要跟进一下？",
        fallback_body="订单卡在中间状态最容易流失，去确认下一步动作或联系对方都可以。",
        actions=[
            {
                "id": "view_orders",
                "label": "打开订单",
                "tool": None,
                "params": {"href": "/orders"},
                "kind": "primary",
            },
        ],
        cooldown_hours=12,
    ),
    ProactiveRule(
        rule_key="dashboard.daily_briefing",
        route_prefixes=["/dashboard", "/"],
        condition=_rule_daily_briefing,
        llm_brief=(
            "用户今天第一次打开工作台。请基于 highlights（最近 7 天的重要事件）"
            "写「今日三件值得关注的事」，每件一句话 + 一个轻量的下一步建议。"
            "整体语气简洁、有温度，像秘书的晨会纪要。"
        ),
        fallback_title="早上好，今天有几件事值得关注",
        fallback_body="最近 7 天积累了几条重要事件，打开工作台仪表盘快速浏览即可。",
        actions=[
            {
                "id": "view_dashboard",
                "label": "打开仪表盘",
                "tool": None,
                "params": {"href": "/dashboard"},
                "kind": "primary",
            },
        ],
        cooldown_hours=24,
        allow_quiet_hours=True,
    ),
]


def _match_rule(ctx: ProactiveContext) -> tuple[ProactiveRule, dict] | None:
    """Return the first rule that matches (rule, signal), or None."""
    for rule in PROACTIVE_TRIGGERS:
        if rule.route_prefixes and "*" not in rule.route_prefixes:
            if not any(ctx.route.startswith(p) for p in rule.route_prefixes):
                continue
        try:
            signal = rule.condition(ctx)
        except Exception as exc:  # pragma: no cover — rule-level safety
            logger.warning("proactive rule failed key=%s err=%s", rule.rule_key, exc)
            continue
        if signal:
            return rule, signal
    return None


# ============================================================================
# Cooldown / dismissal filtering
# ============================================================================


def _in_quiet_hours(now: datetime) -> bool:
    hour = now.hour
    for window in _QUIET_HOURS:
        if hour in window:
            return True
    return False


def _is_suppressed(db: Session, user_id: str, rule_key: str, cooldown_hours: int) -> bool:
    now = _utcnow()

    # Dismissals
    dismissals = (
        db.query(ProactiveDismissal)
        .filter(
            ProactiveDismissal.user_id == user_id,
            ProactiveDismissal.rule_key == rule_key,
        )
        .all()
    )
    for d in dismissals:
        if d.scope == "rule_forever":
            return True
        if d.scope == "today" and d.until_at and d.until_at > now:
            return True

    # Cooldown: same rule fired within cooldown window.
    cutoff = now - timedelta(hours=cooldown_hours)
    existing = (
        db.query(ProactiveSuggestion)
        .filter(
            ProactiveSuggestion.user_id == user_id,
            ProactiveSuggestion.rule_key == rule_key,
            ProactiveSuggestion.created_at >= cutoff,
            ProactiveSuggestion.status != "dismissed",
        )
        .first()
    )
    if existing is not None:
        return True

    return False


def _get_reusable_suggestion(
    db: Session, user_id: str, rule_key: str, route: str
) -> ProactiveSuggestion | None:
    """Return a still-fresh suggestion we can replay (cache)."""
    cutoff = _utcnow() - timedelta(minutes=_SUGGESTION_TTL_MINUTES)
    return (
        db.query(ProactiveSuggestion)
        .filter(
            ProactiveSuggestion.user_id == user_id,
            ProactiveSuggestion.rule_key == rule_key,
            ProactiveSuggestion.route == route,
            ProactiveSuggestion.status == "pending",
            ProactiveSuggestion.created_at >= cutoff,
        )
        .order_by(ProactiveSuggestion.created_at.desc())
        .first()
    )


# ============================================================================
# LLM text generation (with fallback)
# ============================================================================


_LLM_SYSTEM_PROMPT = (
    "你是 A1+ 法务大脑的主动副驾。用户刚打开某个页面，规则命中了一个需要"
    "你主动提醒他的场景。请基于 rule_brief 描述的意图 + signal 里的事实，"
    "写一张**非常简短**的建议卡。\n\n"
    "严格输出 JSON：{\"title\": <=30 汉字标题, \"body\": <=80 汉字正文}。\n"
    "- title 要有行动号召，body 给一个具体原因或 1 个下一步建议。\n"
    "- 不要加免责声明、不要加表情符号、不要重复 signal 里的数字以外的冗词。\n"
    "- 口吻：像坐在你旁边的资深同事，一句点醒。"
)


def _compose_with_llm(
    rule: ProactiveRule,
    signal: dict,
    ctx: ProactiveContext,
    trace_id: str,
) -> tuple[str, str, str]:
    """Return (title, body, source_mode). Falls back on any LLM error."""
    try:
        llm = provider_registry.get("llm")
    except Exception:
        return rule.fallback_title, rule.fallback_body, "fallback"

    user_prompt = json.dumps(
        {
            "rule_brief": rule.llm_brief,
            "route": ctx.route,
            "user_profile": {
                "full_name": ctx.user.full_name,
                "business_name": ctx.user.business_name,
                "industry": ctx.user.industry,
                "stage": ctx.user.stage,
            },
            "signal": signal,
        },
        ensure_ascii=False,
    )

    try:
        envelope = llm.analyze_text(
            _LLM_SYSTEM_PROMPT,
            user_prompt,
            trace_id,
            tenant_id=ctx.user.tenant_id,
        )
    except Exception as exc:
        logger.warning(
            "proactive.llm.failed rule=%s err=%s", rule.rule_key, exc
        )
        return rule.fallback_title, rule.fallback_body, "fallback"

    parsed = envelope.normalized_payload or {}
    title = str(parsed.get("title") or "").strip()
    body = str(parsed.get("body") or "").strip()
    if not title:
        return rule.fallback_title, rule.fallback_body, "fallback"
    if len(title) > 60:
        title = title[:60]
    if len(body) > 200:
        body = body[:200]
    return title, body or rule.fallback_body, "llm"


# ============================================================================
# Public API: peek / execute / dismiss / feedback
# ============================================================================


def peek(
    db: Session,
    *,
    user: User,
    route: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    trace_id: str = "proactive",
) -> dict | None:
    """Look at the user's current state and maybe return a suggestion.

    Returns ``None`` when no rule matches, when all matching rules are
    suppressed (cooldown / dismissed), or when we're in quiet hours.
    Otherwise returns a dict suitable for the ``/agent/proactive/peek``
    route, including the persisted suggestion id.
    """
    ctx = _build_context(db, user, route, resource_type, resource_id)
    matched = _match_rule(ctx)
    if matched is None:
        return None

    rule, signal = matched

    if _in_quiet_hours(ctx.now) and not rule.allow_quiet_hours:
        return None

    if _is_suppressed(db, user.id, rule.rule_key, rule.cooldown_hours):
        # Even if suppressed for the cooldown window, we still want to replay
        # a fresh cached copy so the UI can redisplay (e.g. user reopened the
        # page within 10 minutes).
        cached = _get_reusable_suggestion(db, user.id, rule.rule_key, ctx.route)
        if cached is not None:
            return _suggestion_to_dict(cached)
        return None

    title, body, source_mode = _compose_with_llm(rule, signal, ctx, trace_id)

    suggestion = ProactiveSuggestion(
        user_id=user.id,
        tenant_id=user.tenant_id,
        rule_key=rule.rule_key,
        route=ctx.route,
        resource_type=resource_type,
        resource_id=resource_id,
        title=title,
        body=body,
        actions_json=list(rule.actions),
        context_snapshot={"signal": signal},
        source_mode=source_mode,
        status="pending",
        expires_at=ctx.now + timedelta(hours=_SUGGESTION_EXPIRES_AFTER_HOURS),
    )
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)
    return _suggestion_to_dict(suggestion)


def _suggestion_to_dict(s: ProactiveSuggestion) -> dict:
    return {
        "id": s.id,
        "ruleKey": s.rule_key,
        "route": s.route,
        "title": s.title,
        "body": s.body,
        "actions": s.actions_json or [],
        "sourceMode": s.source_mode,
        "status": s.status,
        "feedback": s.feedback,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
        "expiresAt": s.expires_at.isoformat() if s.expires_at else None,
    }


def dismiss(
    db: Session,
    *,
    user: User,
    suggestion_id: str,
    scope: str,
) -> ProactiveSuggestion:
    """Record a dismissal. ``scope`` ∈ {``once`` / ``today`` / ``rule_forever``}."""
    if scope not in ("once", "today", "rule_forever"):
        raise ValueError("invalid dismiss scope")

    suggestion = (
        db.query(ProactiveSuggestion)
        .filter(
            ProactiveSuggestion.id == suggestion_id,
            ProactiveSuggestion.user_id == user.id,
        )
        .first()
    )
    if suggestion is None:
        raise ValueError("suggestion not found")

    suggestion.status = "dismissed"

    if scope in ("today", "rule_forever"):
        until_at = None
        if scope == "today":
            until_at = _utcnow() + timedelta(hours=24)
        # Upsert: delete existing (user, rule_key, scope) then insert so the
        # unique constraint isn't violated across repeat dismissals.
        db.query(ProactiveDismissal).filter(
            ProactiveDismissal.user_id == user.id,
            ProactiveDismissal.rule_key == suggestion.rule_key,
            ProactiveDismissal.scope == scope,
        ).delete(synchronize_session=False)
        db.add(
            ProactiveDismissal(
                user_id=user.id,
                rule_key=suggestion.rule_key,
                scope=scope,
                until_at=until_at,
            )
        )

    db.commit()
    db.refresh(suggestion)
    return suggestion


def record_feedback(
    db: Session,
    *,
    user: User,
    suggestion_id: str,
    feedback: str,
) -> ProactiveSuggestion:
    """Record 👍/👎 on a suggestion. Purely signal for future rule iteration."""
    if feedback not in ("up", "down"):
        raise ValueError("feedback must be 'up' or 'down'")
    suggestion = (
        db.query(ProactiveSuggestion)
        .filter(
            ProactiveSuggestion.id == suggestion_id,
            ProactiveSuggestion.user_id == user.id,
        )
        .first()
    )
    if suggestion is None:
        raise ValueError("suggestion not found")
    suggestion.feedback = feedback
    db.commit()
    db.refresh(suggestion)
    return suggestion


async def execute(
    db: Session,
    *,
    user: User,
    suggestion_id: str,
    action_id: str,
    trace_id: str,
) -> dict:
    """Execute the chosen action on a proactive suggestion.

    Delegates to :func:`chat_service._execute_action` so we don't duplicate
    the 12-tool dispatch table. Marks the suggestion as ``executed`` with
    the captured result so the UI can reflect progress / detail urls.
    """
    suggestion = (
        db.query(ProactiveSuggestion)
        .filter(
            ProactiveSuggestion.id == suggestion_id,
            ProactiveSuggestion.user_id == user.id,
        )
        .first()
    )
    if suggestion is None:
        raise ValueError("suggestion not found")

    action = next(
        (a for a in (suggestion.actions_json or []) if a.get("id") == action_id),
        None,
    )
    if action is None:
        raise ValueError("action not found on suggestion")

    tool = action.get("tool")
    params = dict(action.get("params") or {})

    # Navigate-only actions have no server side-effect. We just mark the
    # suggestion accepted and return the href for the client to route to.
    if not tool or action.get("kind") == "navigate":
        suggestion.status = "accepted"
        suggestion.executed_action = None
        suggestion.executed_result = {"href": params.get("href")}
        db.commit()
        db.refresh(suggestion)
        return {
            "ok": True,
            "kind": "navigate",
            "href": params.get("href"),
            "suggestion": _suggestion_to_dict(suggestion),
        }

    # Import locally to avoid a circular module dependency — chat_service
    # imports event_bus which is fine, but proactive_engine being imported
    # from chat_service would loop if we pulled it at module top.
    from apps.api.app.services.chat_service import _execute_action

    try:
        tool_result = await _execute_action(tool, params, user, db, trace_id)
    except Exception as exc:
        logger.exception(
            "proactive.execute.failed rule=%s tool=%s", suggestion.rule_key, tool
        )
        suggestion.status = "pending"  # still retryable
        db.commit()
        return {
            "ok": False,
            "error": "工具调用失败，请稍后重试",
            "detail": str(exc)[:200],
        }

    suggestion.status = "executed"
    suggestion.executed_action = tool
    suggestion.executed_result = tool_result
    db.commit()
    db.refresh(suggestion)

    return {
        "ok": True,
        "kind": "tool",
        "tool": tool,
        "result": tool_result,
        "suggestion": _suggestion_to_dict(suggestion),
    }
