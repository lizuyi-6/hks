"""Tests for the proactive copilot engine (unit-level).

The LLM client lookup is monkeypatched so we exercise the rule matching
and fallback copy paths without hitting Doubao. For the three validated
end-to-end scenarios (合规分下降 / 资产到期 / 热线索老化) we assert both
that a suggestion is produced and that cooldown / dismissal suppress it
on the second call.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from apps.api.app.core.database import SessionLocal
from apps.api.app.core.security import create_access_token, hash_password
from apps.api.app.db.models import (
    ComplianceFinding,
    ComplianceProfile,
    IpAsset,
    LegalServiceProvider,
    ProactiveDismissal,
    ProactiveSuggestion,
    ProviderLead,
    SystemEvent,
    User,
)
from apps.api.app.services import proactive_engine


@pytest.fixture
def user_and_headers() -> tuple[User, dict[str, str]]:
    db = SessionLocal()
    try:
        user = User(
            email="proactive@example.com",
            full_name="Proactive Tester",
            password_hash=hash_password("password123"),
            business_name="测试科技",
            industry="saas",
            stage="growth",
            role="owner",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        token = create_access_token(user.id, role="owner")
    finally:
        db.close()
    return user, {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _stub_llm_and_clock(monkeypatch: pytest.MonkeyPatch):
    """Force proactive_engine to use the fallback template and skip the
    quiet-hours filter so tests are deterministic regardless of wall clock."""

    class _Registry:
        def get(self, _key: str):  # pragma: no cover — trivial
            raise RuntimeError("LLM disabled in tests")

    monkeypatch.setattr(proactive_engine, "provider_registry", _Registry())
    monkeypatch.setattr(proactive_engine, "_in_quiet_hours", lambda _now: False)


# ---------- rule: enterprise.compliance_score_drop --------------------------


def test_compliance_score_drop_produces_suggestion(user_and_headers):
    user, _ = user_and_headers
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        # Current profile at 74; a previous audit event recorded at 82.
        profile = ComplianceProfile(
            owner_user_id=user.id,
            company_name="测试科技",
            compliance_score=74,
            last_audit_at=now,
        )
        db.add(profile)
        db.flush()
        db.add(
            SystemEvent(
                user_id=user.id,
                event_type="compliance.audit_completed",
                source_entity_type="compliance_profile",
                source_entity_id=profile.id,
                payload={"score": 82},
                created_at=now - timedelta(days=3),
            )
        )
        db.add(
            ComplianceFinding(
                profile_id=profile.id,
                severity="high",
                category="data",
                title="个人信息出境缺备案",
            )
        )
        db.commit()

        result = proactive_engine.peek(db, user=user, route="/enterprise")
        assert result is not None
        assert result["ruleKey"] == "enterprise.compliance_score_drop"
        assert result["sourceMode"] == "fallback"  # LLM stubbed out

        # Cooldown: the second peek within 24h returns the cached suggestion.
        result2 = proactive_engine.peek(db, user=user, route="/enterprise")
        assert result2 is not None
        assert result2["id"] == result["id"]
    finally:
        db.close()


# ---------- rule: assets.expiring_within_90d --------------------------------


def test_asset_expiring_triggers(user_and_headers):
    user, _ = user_and_headers
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        db.add(
            IpAsset(
                owner_id=user.id,
                name="A1+ 核心商标",
                asset_type="trademark",
                status="active",
                expires_at=now + timedelta(days=45),
            )
        )
        db.commit()

        result = proactive_engine.peek(db, user=user, route="/assets")
        assert result is not None
        assert result["ruleKey"] == "assets.expiring_within_90d"
        # Actions include a primary match_lawyer and a navigate.
        kinds = {a.get("kind") for a in result["actions"]}
        assert "primary" in kinds
    finally:
        db.close()


# ---------- rule: provider.hot_lead_aging -----------------------------------


def test_provider_hot_lead_aging(user_and_headers):
    user, _ = user_and_headers
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        provider = LegalServiceProvider(
            user_id=user.id,
            name="测试律师",
            regions=["CN"],
            practice_areas=["trademark"],
        )
        db.add(provider)
        db.flush()
        # An aging hot lead: >24h old, still in "new", unclaimed, unviewed.
        lead = ProviderLead(
            provider_id=provider.id,
            user_id=user.id,
            score=85.0,
            temperature="hot",
            status="new",
            created_at=now - timedelta(hours=36),
        )
        db.add(lead)
        db.commit()

        result = proactive_engine.peek(db, user=user, route="/provider")
        assert result is not None
        assert result["ruleKey"] == "provider.hot_lead_aging"
    finally:
        db.close()


# ---------- dismissal suppression -------------------------------------------


def test_dismissal_rule_forever_suppresses_future_peeks(user_and_headers):
    user, _ = user_and_headers
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        db.add(
            IpAsset(
                owner_id=user.id,
                name="即将到期商标",
                asset_type="trademark",
                status="active",
                expires_at=now + timedelta(days=30),
            )
        )
        db.commit()

        first = proactive_engine.peek(db, user=user, route="/assets")
        assert first is not None

        proactive_engine.dismiss(
            db,
            user=user,
            suggestion_id=first["id"],
            scope="rule_forever",
        )

        # A fresh peek even after cooldown window should be suppressed
        # because of the dismissal.
        db.query(ProactiveSuggestion).filter(
            ProactiveSuggestion.id == first["id"]
        ).update({"created_at": now - timedelta(hours=25)})
        db.commit()

        second = proactive_engine.peek(db, user=user, route="/assets")
        assert second is None
    finally:
        db.close()


# ---------- route layer wires correctly -------------------------------------


def test_peek_http_route(client: TestClient, user_and_headers):
    _, headers = user_and_headers
    resp = client.post(
        "/agent/proactive/peek",
        json={"route": "/dashboard"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    # No triggering state yet → empty.
    assert "suggestion" in body


def test_dismiss_http_route(client: TestClient, user_and_headers):
    user, headers = user_and_headers
    # Seed a suggestion straight into the DB so we can dismiss it via HTTP.
    db = SessionLocal()
    try:
        s = ProactiveSuggestion(
            user_id=user.id,
            rule_key="enterprise.compliance_score_drop",
            route="/enterprise",
            title="t",
            body="b",
            actions_json=[],
        )
        db.add(s)
        db.commit()
        db.refresh(s)
        sid = s.id
    finally:
        db.close()

    resp = client.post(
        "/agent/proactive/dismiss",
        json={"suggestionId": sid, "scope": "today"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["scope"] == "today"

    # A `today` dismissal writes a dismissal row.
    db = SessionLocal()
    try:
        rows = (
            db.query(ProactiveDismissal)
            .filter(
                ProactiveDismissal.user_id == user.id,
                ProactiveDismissal.rule_key == "enterprise.compliance_score_drop",
            )
            .all()
        )
        assert len(rows) == 1
        assert rows[0].scope == "today"
    finally:
        db.close()


def test_feedback_http_route(client: TestClient, user_and_headers):
    user, headers = user_and_headers
    db = SessionLocal()
    try:
        s = ProactiveSuggestion(
            user_id=user.id,
            rule_key="dashboard.daily_briefing",
            route="/dashboard",
            title="t",
            body="b",
            actions_json=[],
        )
        db.add(s)
        db.commit()
        db.refresh(s)
        sid = s.id
    finally:
        db.close()

    resp = client.post(
        "/agent/proactive/feedback",
        json={"suggestionId": sid, "feedback": "up"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["feedback"] == "up"
