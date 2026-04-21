"""Regression — `/litigation/.../simulate` must return an up-to-date rationale.

The胜率 page used to show a percentage that diverged from the fixed rationale
text below the DonutRing, because :func:`simulate_scenario` omitted ``rationale``
and ``evidence_checklist`` from its payload. The frontend then spread the stale
``activePrediction`` on top of the simulation response, freezing the text on
the originally-persisted probability.

This test pins the backend side of the fix:

1. ``simulate_scenario`` returns ``rationale`` and ``evidence_checklist``.
2. The rationale string embeds the freshly simulated win-probability, not the
   baseline one, so the UI's text will change alongside the number.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from apps.api.app.core.database import SessionLocal
from apps.api.app.db.models import User
from apps.api.app.services.litigation_service import (
    create_case,
    run_prediction,
    simulate_scenario,
)


def _make_user(db: Session, email: str = "litigation-sim@example.com") -> User:
    user = User(
        email=email,
        full_name="Sim Tester",
        password_hash="x",
        tenant_id=None,
        role="owner",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _probability_in(text: str) -> float | None:
    """Extract the first 0-100 percentage from rationale text."""
    match = re.search(r"(\d{1,3})\s*%", text or "")
    return None if not match else int(match.group(1)) / 100.0


def test_simulate_scenario_returns_rationale_that_tracks_probability():
    db = SessionLocal()
    try:
        user = _make_user(db)
        case = create_case(
            db,
            user=user,
            payload={
                "title": "商标侵权模拟",
                "case_type": "trademark_infringement",
                "role": "plaintiff",
                "jurisdiction": "上海",
                "summary": "对方在同类商品上使用近似标识，已发函警告。",
                "evidence_score": 3,
                "claim_amount": 200000,
            },
        )
        db.commit()

        prediction = run_prediction(db, case=case)
        db.commit()
        base_prob = prediction.win_probability

        # Dramatic evidence bump: 3 -> 10 should push the win probability up.
        sim = simulate_scenario(
            db,
            prediction=prediction,
            overrides={"evidence_score": 10},
            persist=False,
        )

        assert "rationale" in sim, "simulate_scenario must expose rationale"
        assert sim["rationale"], "rationale should not be empty for a valid case"
        assert "evidence_checklist" in sim
        assert isinstance(sim["evidence_checklist"], list)

        adjusted = float(sim["adjusted_probability"])
        assert adjusted >= base_prob, (
            "evidence_score 10 should never reduce the win probability"
        )

        # The rationale text must reflect the ADJUSTED probability, not the
        # baseline one — this is the actual user-visible regression.
        quoted = _probability_in(sim["rationale"])
        if quoted is not None:
            assert abs(quoted - adjusted) < 0.02, (
                f"rationale quotes {quoted:.0%} but simulation produced "
                f"{adjusted:.0%}; text is out of sync"
            )
    finally:
        db.rollback()
        db.close()
