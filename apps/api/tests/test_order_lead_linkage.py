"""U2 regression — creating / completing orders should move the linked
ProviderLead through quoted → won so the acquisition funnel stays accurate.
"""
from __future__ import annotations

from apps.api.app.core.database import SessionLocal
from apps.api.app.db.models import (
    LegalServiceProvider,
    MatchingRequest,
    ProviderLead,
    ServiceProduct,
    User,
)
from apps.api.app.services.order_service import (
    accept_and_release,
    begin_delivery,
    complete_delivery,
    create_order_from_match,
    escrow_hold,
    issue_quote,
    sign_contract,
)


def _seed_env(db, *, lead_status: str = "new") -> tuple[User, LegalServiceProvider, ProviderLead]:
    user = User(
        email="client@example.com",
        full_name="Client",
        password_hash="x",
    )
    db.add(user)
    db.flush()

    provider = LegalServiceProvider(
        name="律所 A",
        user_id=user.id,
        provider_type="firm",
        regions=["上海"],
        practice_areas=["trademark"],
        featured_tags=["trademark"],
    )
    db.add(provider)
    db.flush()

    product = ServiceProduct(
        provider_id=provider.id,
        name="商标注册全流程",
        category="trademark",
        price=3800,
        status="active",
    )
    db.add(product)

    matching = MatchingRequest(
        user_id=user.id,
        raw_query="想注册跨境电商商标",
        intent_category="trademark",
        urgency="normal",
        region="上海",
        status="matched",
        profile_snapshot={"tags": ["trademark"]},
    )
    db.add(matching)
    db.flush()

    lead = ProviderLead(
        provider_id=provider.id,
        user_id=user.id,
        matching_request_id=matching.id,
        score=0.9,
        temperature="hot",
        status=lead_status,
        snapshot={"raw_query": matching.raw_query},
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return user, provider, lead


def test_create_order_marks_lead_quoted():
    with SessionLocal() as db:
        user, provider, lead = _seed_env(db)
        order = create_order_from_match(
            db,
            user_id=user.id,
            provider_id=provider.id,
            matching_request_id=lead.matching_request_id,
        )
        db.refresh(lead)
        # Freshly created order should already bump the lead to ``quoted``
        # so the funnel reflects actual engagement.
        assert lead.status == "quoted"
        assert order.notes.get("lead_id") == lead.id


def test_close_order_marks_lead_won():
    with SessionLocal() as db:
        user, provider, lead = _seed_env(db, lead_status="claimed")
        order = create_order_from_match(
            db,
            user_id=user.id,
            provider_id=provider.id,
            matching_request_id=lead.matching_request_id,
        )
        # Walk through the full state machine to close().
        issue_quote(db, order, amount=4200)
        sign_contract(db, order)
        escrow_hold(db, order)
        begin_delivery(db, order)
        complete_delivery(db, order, deliverables=[{"title": "申请书"}])
        accept_and_release(db, order, rating=5)

        db.refresh(lead)
        assert lead.status == "won"
        assert order.status == "closed"


def test_terminal_lead_is_not_touched_by_new_order():
    """A ``won`` lead should not be re-linked if the client starts a new order."""
    with SessionLocal() as db:
        user, provider, lead = _seed_env(db, lead_status="won")
        order = create_order_from_match(
            db,
            user_id=user.id,
            provider_id=provider.id,
            matching_request_id=lead.matching_request_id,
        )
        db.refresh(lead)
        assert lead.status == "won"  # unchanged
        # notes.lead_id may be empty because no open lead was found.
        assert order.notes.get("lead_id") in (None, "")
