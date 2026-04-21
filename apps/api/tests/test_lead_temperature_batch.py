"""D5 regression — lead.temperature_recompute batch job."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from apps.api.app.core.database import SessionLocal
from apps.api.app.db.models import (
    JobRecord,
    LegalServiceProvider,
    MatchingRequest,
    ProviderLead,
    User,
)
from apps.api.app.services.jobs import enqueue_job, process_job


def _seed_lead(
    db,
    *,
    score: float = 85,
    urgency: str = "urgent",
    status: str = "new",
    temperature: str | None = None,
    snapshot: dict | None = None,
) -> ProviderLead:
    user = User(email=f"c-{score}@example.com", full_name="C", password_hash="x")
    db.add(user)
    db.flush()

    provider = LegalServiceProvider(
        name="律所",
        user_id=user.id,
        provider_type="firm",
        regions=["上海"],
        practice_areas=["trademark"],
        featured_tags=["trademark"],
    )
    db.add(provider)
    db.flush()

    matching = MatchingRequest(
        user_id=user.id,
        raw_query="q",
        intent_category="trademark",
        urgency=urgency,
        region="上海",
        status="matched",
        profile_snapshot={},
    )
    db.add(matching)
    db.flush()

    lead = ProviderLead(
        provider_id=provider.id,
        user_id=user.id,
        matching_request_id=matching.id,
        score=score,
        temperature=temperature or "warm",
        status=status,
        snapshot=snapshot or {},
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


def test_temperature_recompute_job_updates_snapshot_signals():
    with SessionLocal() as db:
        lead = _seed_lead(db, score=95, urgency="urgent", temperature="cold")

        job = enqueue_job(
            db,
            job_type="lead.temperature_recompute",
            payload={"limit": 50},
        )
        processed = process_job(db, job)

        assert processed.status == "completed"
        assert isinstance(processed.result, dict)
        assert processed.result["processed"] >= 1

        db.refresh(lead)
        # With score=95 + urgency=urgent the lead should land in hot/warm —
        # never remain "cold" once it's been recomputed.
        assert lead.temperature in {"hot", "warm"}
        snap = lead.snapshot or {}
        assert "temperature_signals" in snap
        assert "components" in snap["temperature_signals"]
        assert "updated_at" in snap["temperature_signals"]


def test_temperature_recompute_skips_fresh_leads():
    """only_stale_hours should skip leads whose signals were refreshed
    within the window. Prevents the cron from thrashing every hour."""
    with SessionLocal() as db:
        fresh_iso = datetime.now(timezone.utc).isoformat()
        lead = _seed_lead(
            db,
            score=40,
            urgency="flexible",
            temperature="warm",
            snapshot={
                "temperature_signals": {
                    "composite": 0.5,
                    "components": {},
                    "updated_at": fresh_iso,
                }
            },
        )

        job = enqueue_job(
            db,
            job_type="lead.temperature_recompute",
            payload={"limit": 50, "only_stale_hours": 6},
        )
        processed = process_job(db, job)
        assert processed.status == "completed"
        result = processed.result or {}
        assert result.get("staleSkipped", 0) >= 1

        db.refresh(lead)
        # temperature must stay what we seeded since the batch skipped it.
        assert lead.temperature == "warm"


def test_temperature_recompute_handles_stale_leads():
    with SessionLocal() as db:
        old_iso = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        lead = _seed_lead(
            db,
            score=10,
            urgency="flexible",
            temperature="hot",
            snapshot={
                "temperature_signals": {
                    "composite": 0.9,
                    "components": {},
                    "updated_at": old_iso,
                }
            },
        )

        job = enqueue_job(
            db,
            job_type="lead.temperature_recompute",
            payload={"limit": 50, "only_stale_hours": 6},
        )
        process_job(db, job)

        db.refresh(lead)
        # After recompute the low-score/low-urgency lead must fall out of hot.
        assert lead.temperature in {"warm", "cool", "cold"}


def test_closed_leads_are_not_touched():
    with SessionLocal() as db:
        lead = _seed_lead(db, score=50, urgency="normal", status="won")
        original_temp = lead.temperature

        job = enqueue_job(
            db, job_type="lead.temperature_recompute", payload={"limit": 50}
        )
        process_job(db, job)
        db.refresh(lead)
        assert lead.temperature == original_temp
