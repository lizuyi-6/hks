"""Unit tests for the pluggable compliance sub-audit framework (D3)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from apps.api.app.adapters.real.compliance_audit import RealComplianceAuditAdapter
from apps.api.app.adapters.real.compliance_subaudits import (
    _REGISTRY,
    SubAuditContext,
    SubAuditResult,
    enabled_subaudits,
    register_subaudit,
    registered_names,
)


def test_builtin_plugins_registered():
    names = registered_names()
    for expected in ("policy_radar", "trademark_status", "copyright_expiry"):
        assert expected in names, f"missing built-in plugin {expected}"


def test_real_adapter_runs_all_plugins_and_merges_findings():
    adapter = RealComplianceAuditAdapter()
    # Expiring trademark + pending trademark + expired copyright → each
    # plug-in should produce at least one finding.
    soon = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
    envelope = adapter.audit(
        company={"name": "Acme", "industry": "信息技术", "scale": "SMB"},
        assets=[
            {"id": "tm1", "name": "Brand A", "type": "trademark", "status": "pending"},
            {
                "id": "tm2",
                "name": "Brand B",
                "type": "trademark",
                "status": "registered",
                "expires_at": soon,
            },
            {
                "id": "cw1",
                "name": "Manual",
                "type": "copyright",
                "expires_at": "2000-01-01T00:00:00+00:00",
            },
        ],
        trace_id="test-d3",
    )

    payload = envelope.normalized_payload
    meta = payload.get("meta", {})
    assert "trademark_status" in meta["subAuditsRun"]
    assert "copyright_expiry" in meta["subAuditsRun"]

    categories = {f.get("category") for f in payload["findings"]}
    assert "trademark" in categories
    assert "copyright" in categories

    # heatmap must have accumulated something for the domains we triggered.
    heatmap = payload.get("heatmap") or {}
    assert heatmap.get("trademark", 0) > 0
    assert heatmap.get("copyright", 0) > 0


def test_third_party_plugin_can_register_and_run():
    """Anyone importing the package can register a new plug-in without
    touching the adapter."""

    class _DummyPlugin:
        name = "dummy_test_plugin"
        category = "dummy"

        def run(self, ctx: SubAuditContext) -> SubAuditResult:
            return SubAuditResult(
                findings=[
                    {
                        "severity": "low",
                        "category": self.category,
                        "title": "dummy finding",
                    }
                ],
                heatmap_delta={"dummy": 5},
            )

    register_subaudit(_DummyPlugin())
    try:
        assert "dummy_test_plugin" in registered_names()
        assert "dummy_test_plugin" in {p.name for p in enabled_subaudits()}

        adapter = RealComplianceAuditAdapter()
        envelope = adapter.audit(
            company={"name": "X", "industry": "通用"},
            assets=[],
            trace_id="dummy-trace",
        )
        meta = envelope.normalized_payload.get("meta", {})
        assert "dummy_test_plugin" in meta["subAuditsRun"]
        titles = {f.get("title") for f in envelope.normalized_payload["findings"]}
        assert "dummy finding" in titles
    finally:
        _REGISTRY.pop("dummy_test_plugin", None)


def test_env_disabled_plugins_are_skipped(monkeypatch):
    monkeypatch.setenv("COMPLIANCE_SUBAUDITS_DISABLED", "trademark_status")
    names = {p.name for p in enabled_subaudits()}
    assert "trademark_status" not in names
    assert "copyright_expiry" in names
