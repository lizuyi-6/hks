"""Adapter-level tests for the Bing public-web-search integration.

Replaces the old ``test_bing_credentials.py`` (which probed a dedicated
``bing_search_credentials`` repository that no longer exists). The new
surface area is the generic ``provider_integrations`` table routed
through :mod:`apps.api.app.db.repositories.integrations`.

Tests verify:

- Tenant-scoped Bing row is picked up and used for the HTTP request.
- Without a DB row, the adapter falls back to ``BING_SEARCH_API_KEY`` env.
- Without either, the adapter degrades to DuckDuckGo (no ``Ocp-Apim`` header).
- ``last_used_at`` is bumped on a successful resolve.
"""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet

from apps.api.app.adapters.real.public_web_search import RealPublicWebSearchAdapter
from apps.api.app.core import crypto
from apps.api.app.core.database import SessionLocal
from apps.api.app.db.models import ProviderIntegration, Tenant
from apps.api.app.db.repositories import integrations as repo


@pytest.fixture(autouse=True)
def _fresh_fernet(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    crypto.reset_fernet_cache()
    yield
    crypto.reset_fernet_cache()


@pytest.fixture
def tenant_id() -> str:
    with SessionLocal() as db:
        t = Tenant(name="Tenant", slug="tenant")
        db.add(t)
        db.commit()
        db.refresh(t)
        return t.id


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    """Record the last request so tests can assert the auth header / params."""

    last: dict = {}

    def __init__(self, *_, **__):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get(self, url: str, headers: dict, params: dict):
        type(self).last = {"url": url, "headers": headers, "params": params}
        return _FakeResponse(
            {
                "webPages": {
                    "value": [
                        {
                            "name": "result",
                            "url": "https://example.com",
                            "snippet": "snippet",
                        }
                    ]
                }
            }
        )


def test_adapter_uses_tenant_scoped_row(monkeypatch, tenant_id):
    """Tenant-scoped row in provider_integrations wins over env fallback."""
    with SessionLocal() as db:
        repo.upsert_integration(
            db,
            tenant_id=tenant_id,
            provider_key="bing_search",
            secrets={"api_key": "TENANT-KEY-xyzw"},
            config={
                "endpoint": "https://api.bing.example/search",
                "market": "en-US",
                "set_lang": "en",
            },
        )

    monkeypatch.setenv("BING_SEARCH_API_KEY", "ENV-KEY-should-be-ignored")
    monkeypatch.setattr(
        "apps.api.app.adapters.real.public_web_search.httpx.Client", _FakeClient
    )

    adapter = RealPublicWebSearchAdapter()
    envelope = adapter.search("trademark", trace_id="t", tenant_id=tenant_id)

    assert envelope.provider == "bing"
    assert _FakeClient.last["url"] == "https://api.bing.example/search"
    assert _FakeClient.last["headers"]["Ocp-Apim-Subscription-Key"] == "TENANT-KEY-xyzw"
    assert _FakeClient.last["params"]["mkt"] == "en-US"

    # resolve_integration should have bumped last_used_at.
    with SessionLocal() as db:
        row = (
            db.query(ProviderIntegration)
            .filter(
                ProviderIntegration.tenant_id == tenant_id,
                ProviderIntegration.provider_key == "bing_search",
            )
            .first()
        )
        assert row.last_used_at is not None


def test_adapter_falls_back_to_env_when_no_db_row(monkeypatch, tenant_id):
    """No tenant/global row → env var path."""
    monkeypatch.setattr(
        "apps.api.app.adapters.real.public_web_search.httpx.Client", _FakeClient
    )
    # Force the adapter's cached settings to see the env key.
    from apps.api.app.core import config

    config.get_settings.cache_clear()
    monkeypatch.setenv("BING_SEARCH_API_KEY", "ENV-ONLY-KEY")
    try:
        adapter = RealPublicWebSearchAdapter()
        adapter.search("query", trace_id="t", tenant_id=tenant_id)
        assert _FakeClient.last["headers"]["Ocp-Apim-Subscription-Key"] == "ENV-ONLY-KEY"
    finally:
        config.get_settings.cache_clear()


def test_adapter_degrades_to_duckduckgo_when_unconfigured(monkeypatch, tenant_id):
    """No DB row and no env var → DuckDuckGo fallback (no Bing call)."""
    monkeypatch.delenv("BING_SEARCH_API_KEY", raising=False)
    from apps.api.app.core import config

    config.get_settings.cache_clear()

    called = {"bing": False}

    class _ForbiddenClient(_FakeClient):
        def get(self, *a, **kw):  # noqa: ANN001
            called["bing"] = True
            raise AssertionError("Bing endpoint should not be hit in fallback mode")

    monkeypatch.setattr(
        "apps.api.app.adapters.real.public_web_search.httpx.Client", _ForbiddenClient
    )

    # DuckDuckGo fallback uses its own httpx.Client call inside the adapter; we
    # stub that out at the module level to avoid hitting the network.
    def _fake_ddg(self, query, trace_id):  # noqa: ANN001
        from apps.api.app.adapters.base import make_envelope

        return make_envelope(
            mode="real",
            provider="duckduckgo",
            trace_id=trace_id,
            source_refs=[],
            disclaimer="stub",
            normalized_payload={"results": []},
        )

    monkeypatch.setattr(
        RealPublicWebSearchAdapter, "_search_duckduckgo", _fake_ddg, raising=True
    )

    adapter = RealPublicWebSearchAdapter()
    envelope = adapter.search("query", trace_id="t", tenant_id=tenant_id)
    assert envelope.provider == "duckduckgo"
    assert called["bing"] is False
    config.get_settings.cache_clear()
