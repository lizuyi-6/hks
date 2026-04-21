"""HTTP-layer tests for ``/integrations`` routes."""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from apps.api.app.core import crypto
from apps.api.app.core.database import SessionLocal
from apps.api.app.core.security import create_access_token, hash_password
from apps.api.app.db.models import Tenant, User


@pytest.fixture(autouse=True)
def _fresh_fernet(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    crypto.reset_fernet_cache()
    yield
    crypto.reset_fernet_cache()


def _make_member_headers() -> tuple[dict[str, str], str]:
    """Register a non-admin user directly in the DB (role=member).

    The default /auth/register path grants ``owner`` (see auth.register_user);
    we need a tenant member to exercise the 403 branch of require_tenant_admin.
    """
    db = SessionLocal()
    try:
        tenant = Tenant(name="Member Co", slug="member-co")
        db.add(tenant)
        db.flush()
        user = User(
            email="member@example.com",
            full_name="Member",
            password_hash=hash_password("password123"),
            tenant_id=tenant.id,
            role="member",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        token = create_access_token(user.id, tenant_id=tenant.id, role="member")
    finally:
        db.close()
    return {"Authorization": f"Bearer {token}"}, tenant.id


def test_list_providers_returns_all_four_schemas(client: TestClient, auth_headers):
    resp = client.get("/integrations/providers", headers=auth_headers)
    assert resp.status_code == 200
    keys = {row["provider_key"] for row in resp.json()}
    assert keys == {"bing_search", "tianyancha", "doubao_llm", "smtp"}


def test_list_integrations_starts_empty(client: TestClient, auth_headers):
    resp = client.get("/integrations", headers=auth_headers)
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 4
    for row in rows:
        assert row["configured"] is False
        assert row["key_hint"] == ""


def test_upsert_and_mask_round_trip(client: TestClient, auth_headers):
    resp = client.put(
        "/integrations/bing_search",
        headers=auth_headers,
        json={
            "secrets": {"api_key": "super-secret-abcdef1234"},
            "config": {"market": "en-US"},
            "label": "prod",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is True
    assert body["scope"] == "tenant"
    assert body["label"] == "prod"
    assert body["key_hint"].endswith("1234")
    # Plaintext MUST NOT appear in the response.
    assert "super-secret" not in resp.text

    # list endpoint should reflect the upsert.
    listing = client.get("/integrations", headers=auth_headers).json()
    bing = next(row for row in listing if row["provider_key"] == "bing_search")
    assert bing["configured"] is True
    assert bing["config"].get("market") == "en-US"


def test_upsert_blank_secret_preserves_existing(client: TestClient, auth_headers):
    client.put(
        "/integrations/bing_search",
        headers=auth_headers,
        json={"secrets": {"api_key": "original-key-wxyz9876"}, "config": {}, "label": None},
    )
    # Second call with empty api_key but updated config should keep the key.
    resp = client.put(
        "/integrations/bing_search",
        headers=auth_headers,
        json={"secrets": {"api_key": ""}, "config": {"market": "ja-JP"}, "label": None},
    )
    assert resp.status_code == 200
    assert resp.json()["key_hint"].endswith("9876")
    assert resp.json()["config"].get("market") == "ja-JP"


def test_upsert_rejects_unknown_provider(client: TestClient, auth_headers):
    resp = client.put(
        "/integrations/made_up",
        headers=auth_headers,
        json={"secrets": {"api_key": "x"}, "config": {}, "label": None},
    )
    assert resp.status_code == 404


def test_upsert_with_no_prior_and_blank_secret_fails(client: TestClient, auth_headers):
    resp = client.put(
        "/integrations/tianyancha",
        headers=auth_headers,
        json={"secrets": {"api_key": ""}, "config": {}, "label": None},
    )
    assert resp.status_code == 400


def test_delete_removes_tenant_row(client: TestClient, auth_headers):
    client.put(
        "/integrations/smtp",
        headers=auth_headers,
        json={
            "secrets": {"password": "hunter2"},
            "config": {"host": "smtp.example.com", "port": 465, "use_tls": False},
            "label": None,
        },
    )
    resp = client.delete("/integrations/smtp", headers=auth_headers)
    assert resp.status_code == 204
    # Subsequent GET shows it unconfigured again.
    listing = client.get("/integrations", headers=auth_headers).json()
    smtp = next(row for row in listing if row["provider_key"] == "smtp")
    assert smtp["configured"] is False


def test_member_cannot_write_integrations(client: TestClient):
    headers, _tenant_id = _make_member_headers()
    # Reads are fine...
    assert client.get("/integrations", headers=headers).status_code == 200

    # ...but writes return 403.
    resp = client.put(
        "/integrations/bing_search",
        headers=headers,
        json={"secrets": {"api_key": "x"}, "config": {}, "label": None},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "需要租户管理员权限"

    assert (
        client.delete("/integrations/bing_search", headers=headers).status_code == 403
    )
    assert (
        client.post("/integrations/bing_search/test", headers=headers).status_code == 403
    )


def test_test_endpoint_reports_no_cred(client: TestClient, auth_headers):
    # No cred configured → 404 + friendly message.
    resp = client.post("/integrations/bing_search/test", headers=auth_headers)
    assert resp.status_code == 404
