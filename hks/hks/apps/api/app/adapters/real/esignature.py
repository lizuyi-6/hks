"""Real e-signature adapter (sandbox).

Generates a real PDF via the ``documentRender`` port, persists a
``DocumentRecord`` so the contract can be downloaded later, and maintains a
file-backed envelope ledger so ``status()`` returns deterministic data across
processes (useful for demos and tests).

The actual CA / eSign connector is still out of scope, but the adapter is
shaped so swapping in e-签宝 / DocuSign is a one-file replacement.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.api.app.adapters.base import make_envelope
from apps.api.app.ports.interfaces import ESignaturePort
from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)

_DEFAULT_LEDGER = Path(
    os.environ.get("A1PLUS_ESIGN_LEDGER", "./var/esign_ledger.json")
)


class RealESignatureAdapter(ESignaturePort):
    port_name = "eSignature"
    provider_name = "a1plus-esign-sandbox"
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

    def create_envelope(self, order_id, template_id, signers, trace_id):
        envelope_id = f"SIG-{order_id[:8].upper()}-{uuid.uuid4().hex[:6].upper()}"
        pdf_path, render_refs = self._render_contract(
            envelope_id, order_id, template_id, signers, trace_id
        )
        record = {
            "envelope_id": envelope_id,
            "order_id": order_id,
            "template_id": template_id,
            "signers": signers,
            "pdf_path": str(pdf_path) if pdf_path else None,
            "status": "pending",
            "created_at": _now(),
        }
        self._write(envelope_id, record)

        refs = [
            SourceRef(title="a1plus eSign envelope", note=f"ledger={self._path.name}"),
        ]
        refs.extend(render_refs)

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=refs,
            disclaimer="沙箱电子签，生成带签章 PDF 但未调用真实 CA；用于演示 / 审计。",
            normalized_payload={
                "envelope_id": envelope_id,
                "template_id": template_id,
                "signers": signers,
                "sign_url": f"/mock-esign/{envelope_id}",
                "pdf_path": record["pdf_path"],
                "status": "pending",
            },
        )

    def status(self, envelope_id, trace_id):
        record = self._read(envelope_id)
        # Demo-grade: any look-up after creation auto-advances to "signed" so
        # the UI can exercise post-sign flows without an external webhook.
        if record and record.get("status") == "pending":
            record["status"] = "signed"
            record["signed_at"] = _now()
            self._write(envelope_id, record)

        payload = record or {"envelope_id": envelope_id, "status": "unknown"}
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[
                SourceRef(title="a1plus eSign envelope status", note=str(self._path)),
            ],
            disclaimer="沙箱电子签状态；演示环境下 status() 自动推进到 signed。",
            normalized_payload=payload,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _render_contract(
        self,
        envelope_id: str,
        order_id: str,
        template_id: str,
        signers: list[dict[str, Any]] | None,
        trace_id: str,
    ) -> tuple[Path | None, list[SourceRef]]:
        """Call documentRender to produce a signed-style PDF.

        Returns ``(pdf_path, source_refs)``. Both may be empty when the
        document-render adapter is not wired (fallback path).
        """
        try:
            from apps.api.app.adapters.registry import provider_registry

            renderer = provider_registry.get("documentRender")
        except Exception as exc:  # pragma: no cover — defensive
            logger.debug("documentRender not available: %s", exc)
            return None, []

        # documentRender ports are expected to expose a render(template_id,
        # context, trace_id) → envelope with .normalized_payload.{docx,pdf}.
        render = getattr(renderer, "render", None)
        if not callable(render):
            return None, []

        context = {
            "envelope_id": envelope_id,
            "order_id": order_id,
            "signers": signers or [],
            "generated_at": _now(),
            "title": f"服务委托合同 / Service Agreement ({order_id[:8]})",
        }
        try:
            env = render(template_id or "service_agreement_v1", context, trace_id)
            payload = getattr(env, "normalized_payload", {}) or {}
            pdf_raw = payload.get("pdf_path") or payload.get("pdfPath")
            pdf_path = Path(pdf_raw) if pdf_raw else None
            refs = list(getattr(env, "source_refs", []) or [])
            return pdf_path, refs
        except Exception as exc:  # pragma: no cover — defensive
            logger.debug("documentRender render failed: %s", exc)
            return None, []

    def _read(self, envelope_id: str) -> dict[str, Any] | None:
        with self._lock:
            data = self._load()
            return data.get(envelope_id)

    def _write(self, envelope_id: str, record: dict[str, Any]) -> None:
        with self._lock:
            data = self._load()
            data[envelope_id] = record
            tmp = self._path.with_suffix(self._path.suffix + ".tmp")
            tmp.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            tmp.replace(self._path)

    def _load(self) -> dict[str, Any]:
        try:
            return json.loads(self._path.read_text(encoding="utf-8") or "{}")
        except json.JSONDecodeError:
            logger.warning("esign ledger corrupt at %s, resetting", self._path)
            return {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
