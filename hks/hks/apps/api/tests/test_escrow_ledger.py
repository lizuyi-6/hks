"""R4 regression — real escrow adapter's file-backed state machine."""
from __future__ import annotations

import json

import pytest

from apps.api.app.adapters.real.escrow import RealPaymentEscrowAdapter


def test_escrow_happy_path(tmp_path):
    ledger = tmp_path / "escrow.json"
    adapter = RealPaymentEscrowAdapter(ledger_path=ledger)

    hold = adapter.hold("order-abcdef01", amount=1000, trace_id="t1")
    assert hold.normalized_payload["status"] == "held"

    release = adapter.release("order-abcdef01", trace_id="t2")
    assert release.normalized_payload["status"] == "released"

    # Ledger should contain the history of transitions.
    data = json.loads(ledger.read_text(encoding="utf-8"))
    record = data["order-abcdef01"]
    states = [h["state"] for h in record["history"]]
    assert states == ["held", "released"]


def test_escrow_refund_path(tmp_path):
    adapter = RealPaymentEscrowAdapter(ledger_path=tmp_path / "e.json")
    adapter.hold("o1", amount=500, trace_id="t")
    refund = adapter.refund("o1", trace_id="t")
    assert refund.normalized_payload["status"] == "refunded"


def test_escrow_illegal_transition(tmp_path):
    adapter = RealPaymentEscrowAdapter(ledger_path=tmp_path / "e.json")
    # release without a prior hold should fail loudly.
    with pytest.raises(ValueError):
        adapter.release("missing", trace_id="t")


def test_escrow_double_hold_rejected(tmp_path):
    adapter = RealPaymentEscrowAdapter(ledger_path=tmp_path / "e.json")
    adapter.hold("o2", amount=100, trace_id="t")
    with pytest.raises(ValueError):
        adapter.hold("o2", amount=100, trace_id="t")
