"""Unit tests for the stability / network hardening pass (2026-04).

These exercise the pure/stateless helpers that were added or rewritten
when fixing recurring AI + network instability:

- ``_iter_sse_payloads`` — manual SSE parsing with packet boundary tolerance
- ``emit_event(..., idempotent=True)`` — dedup of system events
- ``_read_snapshot`` — cached snapshot load + actionable error on missing file
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from apps.api.app.adapters.real.llm import _iter_sse_payloads
from apps.api.app.adapters.real.trademark_search import _load_snapshot, _read_snapshot
from apps.api.app.core.database import SessionLocal
from apps.api.app.core.error_handler import SystemError as APISystemError
from apps.api.app.db.models import SystemEvent
from apps.api.app.services.event_bus import emit_event


# ---------------------------------------------------------------------------
# _iter_sse_payloads
# ---------------------------------------------------------------------------


class _FakeAiterBytes:
    """Minimal stand-in for ``httpx.Response`` that only exposes ``aiter_bytes``."""

    def __init__(self, chunks: list[bytes]):
        self._chunks = chunks

    async def aiter_bytes(self):  # noqa: D401 — matches httpx signature
        for chunk in self._chunks:
            yield chunk


def _drain(chunks: list[bytes]) -> list[str]:
    async def _run() -> list[str]:
        return [p async for p in _iter_sse_payloads(_FakeAiterBytes(chunks))]

    return asyncio.run(_run())


def test_iter_sse_payloads_joins_across_chunk_boundary():
    # Payload split mid-JSON — we must still deliver the full event once
    # the terminating blank line arrives.
    payloads = _drain([b'data: {"delt', b'a":"hello"}\n\n'])
    assert payloads == ['{"delta":"hello"}']


def test_iter_sse_payloads_handles_crlf_and_no_space():
    # Accept CRLF line endings and ``data:`` without a trailing space.
    payloads = _drain([b'data:{"x":1}\r\n\r\ndata: {"x":2}\r\n\r\n'])
    assert payloads == ['{"x":1}', '{"x":2}']


def test_iter_sse_payloads_flushes_trailing_event_without_blank_line():
    # Some upstreams close the connection without the final ``\n\n``.
    payloads = _drain([b'data: {"done":true}'])
    assert payloads == ['{"done":true}']


def test_iter_sse_payloads_ignores_non_data_fields():
    # ``event:`` / ``id:`` / ``:comment`` lines must not leak into the data stream.
    payloads = _drain([b': keepalive\nevent: ping\ndata: {"k":1}\n\n'])
    assert payloads == ['{"k":1}']


# ---------------------------------------------------------------------------
# emit_event idempotency
# ---------------------------------------------------------------------------


def test_emit_event_idempotent_returns_existing_row():
    db = SessionLocal()
    try:
        first = emit_event(
            db,
            event_type="diagnosis.completed",
            source_entity_type="job",
            source_entity_id="job-123",
            payload={"attempt": 1},
            idempotent=True,
        )
        db.commit()

        second = emit_event(
            db,
            event_type="diagnosis.completed",
            source_entity_type="job",
            source_entity_id="job-123",
            payload={"attempt": 2},
            idempotent=True,
        )
        db.commit()

        # Same row, no duplicate inserted.
        assert first.id == second.id
        assert (
            db.query(SystemEvent)
            .filter(SystemEvent.source_entity_id == "job-123")
            .count()
            == 1
        )
    finally:
        db.close()


def test_emit_event_non_idempotent_inserts_duplicates():
    db = SessionLocal()
    try:
        emit_event(
            db,
            event_type="diagnosis.completed",
            source_entity_type="job",
            source_entity_id="job-xyz",
            payload={},
        )
        emit_event(
            db,
            event_type="diagnosis.completed",
            source_entity_type="job",
            source_entity_id="job-xyz",
            payload={},
        )
        db.commit()

        assert (
            db.query(SystemEvent)
            .filter(SystemEvent.source_entity_id == "job-xyz")
            .count()
            == 2
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Trademark snapshot loader
# ---------------------------------------------------------------------------


def test_read_snapshot_raises_system_error_when_missing(tmp_path: Path):
    _load_snapshot.cache_clear()  # isolate from other tests
    missing = tmp_path / "nope.json"
    with pytest.raises(APISystemError) as exc_info:
        _read_snapshot(missing)
    assert "商标快照" in exc_info.value.message


def test_read_snapshot_raises_system_error_when_corrupt(tmp_path: Path):
    _load_snapshot.cache_clear()
    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    with pytest.raises(APISystemError) as exc_info:
        _read_snapshot(broken)
    assert "格式损坏" in exc_info.value.message


def test_read_snapshot_caches_by_mtime(tmp_path: Path):
    _load_snapshot.cache_clear()
    snap = tmp_path / "snap.json"
    snap.write_text(json.dumps({"entries": []}), encoding="utf-8")
    first = _read_snapshot(snap)
    assert first == {"entries": []}

    # Overwriting the file bumps mtime → cache miss → fresh contents served.
    import os
    import time

    time.sleep(0.01)
    snap.write_text(json.dumps({"entries": [{"name": "x"}]}), encoding="utf-8")
    # Force mtime change on filesystems that don't tick fast enough.
    new_mtime = snap.stat().st_mtime + 1
    os.utime(snap, (new_mtime, new_mtime))

    second = _read_snapshot(snap)
    assert second == {"entries": [{"name": "x"}]}
