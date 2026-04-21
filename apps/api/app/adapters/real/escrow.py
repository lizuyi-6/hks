"""Real escrow payment adapter (sandbox, file-backed ledger).

This is still a sandbox — we don't talk to 支付宝/微信/银联 — but we maintain a
proper finite-state machine over a local JSON ledger so the behaviour is
observable and audit-friendly. When a production PSP is wired in the shape
stays the same: callers only see envelopes, never the ledger file path.

State machine:
    idle → held → released        (happy path, escrow.hold then escrow.release)
    idle → held → refunded        (cancellation path)
Illegal transitions raise ``ValueError`` so the order service can surface a
precise error, rather than silently succeeding like the mock did.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import PaymentEscrowPort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)

_DEFAULT_LEDGER = Path(
    os.environ.get("A1PLUS_ESCROW_LEDGER", "./var/escrow_ledger.json")
)

_VALID_TRANSITIONS: dict[str, set[str]] = {
    "idle": {"held"},
    "held": {"released", "refunded"},
    "released": set(),
    "refunded": set(),
}


class RealPaymentEscrowAdapter(PaymentEscrowPort):
    port_name = "paymentEscrow"
    provider_name = "a1plus-escrow-sandbox"
    mode = "real"

    def __init__(self, ledger_path: Path | None = None) -> None:
        self._path = Path(ledger_path) if ledger_path else _DEFAULT_LEDGER
        self._lock = threading.Lock()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        if not self._path.exists():
            self._path.write_text("{}", encoding="utf-8")

    # ------------------------------------------------------------------
    # Ports
    # ------------------------------------------------------------------

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def hold(self, order_id, amount, trace_id):
        record = self._transition(
            order_id,
            to_state="held",
            patch={
                "amount": int(amount),
                "escrow_ref": f"ESC-{order_id[:8].upper()}",
                "held_at": _now(),
            },
        )
        return self._envelope("hold", trace_id, record)

    def release(self, order_id, trace_id):
        record = self._transition(
            order_id,
            to_state="released",
            patch={"released_at": _now()},
        )
        return self._envelope("release", trace_id, record)

    def refund(self, order_id, trace_id):
        record = self._transition(
            order_id,
            to_state="refunded",
            patch={"refunded_at": _now()},
        )
        return self._envelope("refund", trace_id, record)

    # ------------------------------------------------------------------
    # Ledger helpers
    # ------------------------------------------------------------------

    def _load(self) -> dict[str, Any]:
        try:
            return json.loads(self._path.read_text(encoding="utf-8") or "{}")
        except json.JSONDecodeError:
            logger.warning("escrow ledger corrupt at %s, resetting", self._path)
            return {}

    def _save(self, data: dict[str, Any]) -> None:
        # Write-then-rename for atomicity on most filesystems.
        tmp = self._path.with_suffix(self._path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self._path)

    def _transition(
        self, order_id: str, *, to_state: str, patch: dict[str, Any]
    ) -> dict[str, Any]:
        with self._lock:
            data = self._load()
            record = data.get(order_id) or {
                "order_id": order_id,
                "state": "idle",
                "history": [],
            }
            current = record.get("state", "idle")
            if to_state not in _VALID_TRANSITIONS.get(current, set()):
                raise ValueError(
                    f"escrow: invalid transition {current} → {to_state} for {order_id}"
                )
            record.update(patch)
            record["state"] = to_state
            history = list(record.get("history") or [])
            history.append({"state": to_state, "at": _now()})
            record["history"] = history
            data[order_id] = record
            self._save(data)
            return record

    def _envelope(self, action: str, trace_id: str, record: dict[str, Any]):
        status_map = {"held": "held", "released": "released", "refunded": "refunded"}
        payload = {
            "order_id": record["order_id"],
            "amount": record.get("amount"),
            "escrow_ref": record.get("escrow_ref"),
            "status": status_map.get(record["state"], record["state"]),
            "history": record.get("history", []),
        }
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title=f"a1plus escrow ledger ({action})", note=str(self._path))],
            disclaimer="沙箱托管账本，未产生真实资金流，仅用于演示 / 审计。",
            normalized_payload=payload,
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
