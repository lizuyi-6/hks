"""Unit tests for :mod:`apps.api.app.core.crypto`."""

from __future__ import annotations

import os

import pytest
from cryptography.fernet import Fernet

from apps.api.app.core import crypto
from apps.api.app.core.error_handler import SystemError as APISystemError


@pytest.fixture
def with_test_key(monkeypatch: pytest.MonkeyPatch):
    """Set a deterministic Fernet key and reset the module cache."""
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("APP_ENCRYPTION_KEY", key)
    # The lru_cache on get_fernet is computed at import time for test runs that
    # already touched the module; clear it so our monkeypatched value wins.
    crypto.reset_fernet_cache()
    yield key
    crypto.reset_fernet_cache()


def test_encrypt_decrypt_round_trip(with_test_key: str) -> None:
    payload = {"api_key": "sk-hello-12345", "note": "üñïçødé 🗝"}
    token = crypto.encrypt_secrets(payload)
    assert token and token != str(payload), "ciphertext must not equal plaintext"
    assert "sk-hello-12345" not in token, "plaintext leaked into ciphertext"

    assert crypto.decrypt_secrets(token) == payload


def test_decrypt_empty_returns_empty_dict(with_test_key: str) -> None:
    assert crypto.decrypt_secrets("") == {}


def test_decrypt_tampered_raises(with_test_key: str) -> None:
    token = crypto.encrypt_secrets({"api_key": "whatever"})
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    with pytest.raises(APISystemError):
        crypto.decrypt_secrets(tampered)


def test_decrypt_with_wrong_key_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    # Encrypt with key A
    key_a = Fernet.generate_key().decode()
    monkeypatch.setenv("APP_ENCRYPTION_KEY", key_a)
    crypto.reset_fernet_cache()
    token = crypto.encrypt_secrets({"api_key": "x"})

    # Swap in key B, which should now fail to decrypt the old token.
    key_b = Fernet.generate_key().decode()
    monkeypatch.setenv("APP_ENCRYPTION_KEY", key_b)
    crypto.reset_fernet_cache()
    with pytest.raises(APISystemError):
        crypto.decrypt_secrets(token)


def test_mask_key_short_value_uses_placeholder() -> None:
    assert crypto.mask_key("") == ""
    assert crypto.mask_key(None) == ""
    # Values shorter than 4 visible chars fall back to placeholder only.
    assert crypto.mask_key("abc").startswith("sk_")


def test_mask_key_reveals_only_last_four() -> None:
    masked = crypto.mask_key("sk-super-secret-abcd1234")
    assert masked.endswith("1234")
    assert "sk-super-secret" not in masked


def test_missing_key_in_dev_is_generated(monkeypatch: pytest.MonkeyPatch) -> None:
    # Simulate "development" environment with no APP_ENCRYPTION_KEY — crypto
    # should self-heal with an ephemeral key rather than crash startup.
    monkeypatch.delenv("APP_ENCRYPTION_KEY", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    crypto.reset_fernet_cache()
    f = crypto.get_fernet()
    assert f is not None
    # And the generated key gets exported so subsequent calls in the same
    # process see the same Fernet instance.
    assert os.environ.get("APP_ENCRYPTION_KEY")


def test_missing_key_in_production_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("APP_ENCRYPTION_KEY", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    # get_settings() also enforces a non-default APP_SECRET_KEY in prod; give
    # it one so we're actually exercising crypto's check, not the auth one.
    monkeypatch.setenv("APP_SECRET_KEY", "a" * 64)
    crypto.reset_fernet_cache()
    from apps.api.app.core import config

    config.get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="APP_ENCRYPTION_KEY"):
            crypto.get_fernet()
    finally:
        config.get_settings.cache_clear()
        crypto.reset_fernet_cache()
