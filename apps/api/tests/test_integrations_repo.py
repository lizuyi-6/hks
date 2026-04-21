"""Repository-level tests for :mod:`~apps.api.app.db.repositories.integrations`.

These tests lean on the SQLite test DB created by ``conftest.reset_database``
and focus on the invariants that can't be verified from the HTTP layer alone:

- resolve_integration order: tenant → global → env fallback
- blank-secret rejection on upsert
- decrypt failure gracefully degrades to env, never raises
- delete returns the correct boolean and cascades cleanup
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet

from apps.api.app.core import crypto
from apps.api.app.core.database import SessionLocal
from apps.api.app.db.models import Tenant
from apps.api.app.db.repositories import integrations as repo


@pytest.fixture(autouse=True)
def _fresh_fernet(monkeypatch: pytest.MonkeyPatch):
    """Each test gets a deterministic, stable KEK."""
    monkeypatch.setenv("APP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    crypto.reset_fernet_cache()
    yield
    crypto.reset_fernet_cache()


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def tenant_id(db) -> str:
    t = Tenant(name="Acme", slug="acme")
    db.add(t)
    db.commit()
    db.refresh(t)
    return t.id


EMPTY_SETTINGS = SimpleNamespace(
    bing_search_api_key="",
    bing_search_endpoint="",
    tianyancha_api_key="",
    smtp_password="",
    smtp_host="",
    smtp_port=587,
    smtp_username="",
    smtp_from="",
    smtp_use_tls=True,
)


def test_resolve_returns_none_when_no_source(db, tenant_id):
    # All layers empty → unconfigured.
    assert repo.resolve_integration(db, tenant_id, "bing_search", EMPTY_SETTINGS) is None


def test_resolve_falls_back_to_env(db, tenant_id):
    settings = SimpleNamespace(**{**EMPTY_SETTINGS.__dict__, "bing_search_api_key": "ENV-KEY"})
    result = repo.resolve_integration(db, tenant_id, "bing_search", settings)
    assert result is not None
    assert result["source"] == "env"
    assert result["secrets"] == {"api_key": "ENV-KEY"}
    assert result["integration_id"] is None


def test_resolve_prefers_global_over_env(db, tenant_id):
    repo.upsert_integration(
        db,
        tenant_id=None,
        provider_key="bing_search",
        secrets={"api_key": "GLOBAL-KEY"},
    )
    settings = SimpleNamespace(**{**EMPTY_SETTINGS.__dict__, "bing_search_api_key": "ENV-KEY"})
    result = repo.resolve_integration(db, tenant_id, "bing_search", settings)
    assert result is not None
    assert result["source"] == "db"
    assert result["secrets"]["api_key"] == "GLOBAL-KEY"


def test_resolve_prefers_tenant_over_global(db, tenant_id):
    repo.upsert_integration(
        db,
        tenant_id=None,
        provider_key="bing_search",
        secrets={"api_key": "GLOBAL-KEY"},
    )
    repo.upsert_integration(
        db,
        tenant_id=tenant_id,
        provider_key="bing_search",
        secrets={"api_key": "TENANT-KEY"},
    )
    result = repo.resolve_integration(db, tenant_id, "bing_search", EMPTY_SETTINGS)
    assert result["secrets"]["api_key"] == "TENANT-KEY"
    assert result["source"] == "db"


def test_upsert_replaces_prior_active_row(db, tenant_id):
    repo.upsert_integration(
        db,
        tenant_id=tenant_id,
        provider_key="bing_search",
        secrets={"api_key": "first"},
    )
    repo.upsert_integration(
        db,
        tenant_id=tenant_id,
        provider_key="bing_search",
        secrets={"api_key": "second"},
    )
    result = repo.resolve_integration(db, tenant_id, "bing_search", EMPTY_SETTINGS)
    assert result["secrets"]["api_key"] == "second"
    # Only one active row should exist to keep masked_summary deterministic.
    from apps.api.app.db.models import ProviderIntegration

    rows = (
        db.query(ProviderIntegration)
        .filter(
            ProviderIntegration.tenant_id == tenant_id,
            ProviderIntegration.provider_key == "bing_search",
        )
        .all()
    )
    assert len(rows) == 1


def test_upsert_rejects_missing_primary_secret(db, tenant_id):
    with pytest.raises(ValueError, match="missing required secret"):
        repo.upsert_integration(
            db,
            tenant_id=tenant_id,
            provider_key="bing_search",
            secrets={"api_key": ""},
        )


def test_masked_summary_exposes_only_tail(db, tenant_id):
    repo.upsert_integration(
        db,
        tenant_id=tenant_id,
        provider_key="bing_search",
        secrets={"api_key": "super-secret-key-abcdef1234"},
    )
    summary = repo.get_masked_summary(db, tenant_id, "bing_search")
    assert summary["configured"] is True
    assert summary["scope"] == "tenant"
    assert summary["key_hint"].endswith("1234")
    # The rest of the plaintext must NOT appear in the masked preview.
    assert "super-secret" not in summary["key_hint"]


def test_list_masked_summaries_covers_all_providers(db, tenant_id):
    summaries = repo.list_masked_summaries(db, tenant_id)
    keys = {row["provider_key"] for row in summaries}
    assert keys == {"bing_search", "tianyancha", "doubao_llm", "smtp"}
    # None configured → all configured == False.
    assert all(row["configured"] is False for row in summaries)


def test_delete_returns_true_only_when_row_existed(db, tenant_id):
    assert repo.delete_integration(db, tenant_id, "bing_search") is False
    repo.upsert_integration(
        db,
        tenant_id=tenant_id,
        provider_key="bing_search",
        secrets={"api_key": "x"},
    )
    assert repo.delete_integration(db, tenant_id, "bing_search") is True
    # After deletion, resolve falls back.
    assert repo.resolve_integration(db, tenant_id, "bing_search", EMPTY_SETTINGS) is None


def test_resolve_decrypt_failure_degrades_to_env(db, tenant_id, monkeypatch):
    """If ciphertext can't be decrypted (rotated KEK), fall back to env —
    we'd rather serve the old env value than crash the request chain."""
    repo.upsert_integration(
        db,
        tenant_id=tenant_id,
        provider_key="bing_search",
        secrets={"api_key": "TENANT-KEY"},
    )
    # Rotate the KEK without re-encrypting — the DB row is now undecryptable.
    monkeypatch.setenv("APP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    crypto.reset_fernet_cache()

    settings = SimpleNamespace(**{**EMPTY_SETTINGS.__dict__, "bing_search_api_key": "ENV-FALLBACK"})
    result = repo.resolve_integration(db, tenant_id, "bing_search", settings)
    assert result is not None
    assert result["source"] == "env"
    assert result["secrets"]["api_key"] == "ENV-FALLBACK"


def test_get_decrypted_for_upsert_round_trips(db, tenant_id):
    repo.upsert_integration(
        db,
        tenant_id=tenant_id,
        provider_key="smtp",
        secrets={"password": "pw"},
        config={"host": "smtp.example.com", "port": 465, "use_tls": False},
    )
    previous = repo.get_decrypted_for_upsert(db, tenant_id, "smtp")
    assert previous == {"password": "pw"}


def test_unknown_provider_rejected_everywhere(db, tenant_id):
    with pytest.raises(ValueError):
        repo.resolve_integration(db, tenant_id, "nope", EMPTY_SETTINGS)
    with pytest.raises(ValueError):
        repo.get_masked_summary(db, tenant_id, "nope")
    with pytest.raises(ValueError):
        repo.upsert_integration(db, tenant_id=tenant_id, provider_key="nope", secrets={})
    with pytest.raises(ValueError):
        repo.delete_integration(db, tenant_id, "nope")
