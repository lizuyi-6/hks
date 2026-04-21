"""Symmetric encryption for at-rest secrets (provider integrations).

We use Fernet (AES-128-CBC + HMAC-SHA256) from the ``cryptography`` package.
Fernet is reversible — that's intentional. API keys must be sent in
plaintext to upstream providers (Bing, Tianyancha, etc.), so a one-way
hash like SHA-256 would be useless here. Fernet lets us encrypt at rest
and decrypt at call time while still protecting the value from snapshot
leaks and non-admin DB access.

Key lifecycle:

- The KEK (key-encryption key) lives in ``APP_ENCRYPTION_KEY`` env var.
- In dev/test we silently generate an ephemeral one if the var is
  missing, so the full test suite boots without extra setup. The
  ephemeral key is logged (once) and stored back into ``os.environ`` so
  subsequent calls in the same process are stable.
- In staging/production we refuse to start without a real KEK, mirroring
  the ``APP_SECRET_KEY`` validation in :mod:`apps.api.app.core.config`.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from apps.api.app.core.config import get_settings
from apps.api.app.core.error_handler import SystemError as APISystemError

logger = logging.getLogger(__name__)

_DEV_ENVS = {"", "dev", "development", "local", "test", "testing"}
_MASK_VISIBLE_TAIL = 4
_MASK_PLACEHOLDER = "sk_…"


@lru_cache
def get_fernet() -> Fernet:
    """Return the process-wide Fernet instance.

    Cached: regenerating Fernet objects is cheap but we want stable
    behaviour across calls in the same process (e.g. tests that encrypt
    with one instance and decrypt with another).
    """
    key = os.getenv("APP_ENCRYPTION_KEY", "").strip()
    settings = get_settings()
    env = (settings.app_env or "").strip().lower()
    is_dev = env in _DEV_ENVS

    if not key:
        if not is_dev:
            raise RuntimeError(
                "APP_ENCRYPTION_KEY is required when APP_ENV=%r; generate one "
                "with `python -c \"from cryptography.fernet import Fernet; "
                "print(Fernet.generate_key().decode())\"` and put it in .env"
                % settings.app_env
            )
        key = Fernet.generate_key().decode()
        os.environ["APP_ENCRYPTION_KEY"] = key
        logger.warning(
            "APP_ENCRYPTION_KEY missing; generated ephemeral dev key "
            "(data encrypted with this key won't survive a process restart)"
        )

    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except (ValueError, TypeError) as exc:
        raise RuntimeError(
            "APP_ENCRYPTION_KEY is set but not a valid Fernet key "
            "(must be 32 url-safe base64-encoded bytes)"
        ) from exc


def reset_fernet_cache() -> None:
    """Clear the cached Fernet — used by tests that rotate the KEK."""
    get_fernet.cache_clear()


def encrypt_secrets(payload: dict) -> str:
    """Encrypt a JSON-serialisable dict to an opaque token string."""
    blob = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return get_fernet().encrypt(blob).decode("ascii")


def decrypt_secrets(token: str) -> dict:
    """Inverse of :func:`encrypt_secrets`. Raises SystemError on tampering."""
    if not token:
        return {}
    try:
        raw = get_fernet().decrypt(token.encode("ascii"))
    except InvalidToken as exc:
        raise APISystemError(
            message="凭证解密失败：密文被篡改或 APP_ENCRYPTION_KEY 不匹配",
            error_location="crypto.decrypt_secrets",
        ) from exc
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:  # pragma: no cover
        raise APISystemError(
            message="凭证解密后格式异常",
            error_location="crypto.decrypt_secrets",
        ) from exc


def mask_key(value: str | None) -> str:
    """Return a UI-safe preview such as ``sk_…abcd``.

    - ``None`` / empty string → empty string (UI shows "未配置").
    - 1..5 characters → just the placeholder (no tail, so we don't
      effectively leak the whole short string).
    - 6+ characters → ``sk_…`` + last 4 visible chars.
    """
    if not value:
        return ""
    value = str(value)
    if len(value) < _MASK_VISIBLE_TAIL + 2:
        return _MASK_PLACEHOLDER
    return f"{_MASK_PLACEHOLDER}{value[-_MASK_VISIBLE_TAIL:]}"
