"""Repository for :class:`~apps.api.app.db.models.ProviderIntegration`.

This module is the *only* place that talks to the ``provider_integrations``
table directly. Everything else — adapters, routes, tests — goes through
the helpers here so the Fernet encrypt/decrypt cycle stays in one spot.

Resolution order used by :func:`resolve_integration`:

    tenant-specific row → global row (``tenant_id IS NULL``) → ``.env`` fallback

``.env`` fallback is baked in per-provider so the existing deployments
keep working without any migration (zero-downtime rollout).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from apps.api.app.core.crypto import decrypt_secrets, encrypt_secrets, mask_key
from apps.api.app.db.models import ProviderIntegration

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Static provider schemas
# ---------------------------------------------------------------------------

PROVIDER_SCHEMAS: dict[str, dict[str, Any]] = {
    "bing_search": {
        "label": "Bing 搜索",
        "description": "Microsoft Bing Web Search v7，用于公开搜索与侵权监控。",
        "secret_keys": ["api_key"],
        "config_keys": ["endpoint", "market", "set_lang"],
        "config_defaults": {
            "endpoint": "https://api.bing.microsoft.com/v7.0/search",
            "market": "zh-CN",
            "set_lang": "zh-Hans",
        },
        "primary_secret": "api_key",
    },
    "tianyancha": {
        "label": "天眼查",
        "description": "企业工商信息查询；用于 Enterprise Lookup / Competitor Tracking。",
        "secret_keys": ["api_key"],
        "config_keys": [],
        "config_defaults": {},
        "primary_secret": "api_key",
    },
    "doubao_llm": {
        "label": "豆包 LLM (Volcengine Ark)",
        "description": "用于智能诊断、监控、分析等全部 AI 能力。",
        "secret_keys": ["api_key"],
        "config_keys": ["base_url", "model"],
        "config_defaults": {
            "base_url": "https://ark.cn-beijing.volces.com/api/coding/v3",
            "model": "Doubao-Seed-2.0-pro",
        },
        "primary_secret": "api_key",
    },
    "smtp": {
        "label": "邮件 SMTP",
        "description": "系统通知邮件发送渠道（用户密码等字段加密存储）。",
        "secret_keys": ["password"],
        "config_keys": ["host", "port", "username", "from_addr", "use_tls"],
        "config_defaults": {
            "port": 587,
            "use_tls": True,
            "from_addr": "noreply@a1plus.local",
        },
        "primary_secret": "password",
    },
}


def is_known_provider(provider_key: str) -> bool:
    return provider_key in PROVIDER_SCHEMAS


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _active_row(
    db: Session,
    tenant_id: str | None,
    provider_key: str,
) -> ProviderIntegration | None:
    """Fetch the active row for ``(tenant_id, provider_key)`` or ``None``."""
    q = db.query(ProviderIntegration).filter(
        ProviderIntegration.provider_key == provider_key,
        ProviderIntegration.active.is_(True),
    )
    if tenant_id is None:
        q = q.filter(ProviderIntegration.tenant_id.is_(None))
    else:
        q = q.filter(ProviderIntegration.tenant_id == tenant_id)
    return q.order_by(ProviderIntegration.updated_at.desc()).first()


def _best_match(
    db: Session,
    tenant_id: str | None,
    provider_key: str,
) -> ProviderIntegration | None:
    """Tenant-scoped row, then fall through to the global row."""
    if tenant_id is not None:
        row = _active_row(db, tenant_id, provider_key)
        if row is not None:
            return row
    return _active_row(db, None, provider_key)


def _env_fallback(provider_key: str, settings: Any) -> dict | None:
    """Last-resort ``.env`` / hardcoded-default read per provider.

    Returns a ``{"secrets": {...}, "config": {...}}`` dict (no DB row)
    or ``None`` when env is also empty and we should treat the provider
    as unconfigured (caller falls back to DuckDuckGo / stub / etc.).
    """
    if provider_key == "bing_search":
        api_key = getattr(settings, "bing_search_api_key", "") or ""
        if not api_key:
            return None
        return {
            "secrets": {"api_key": api_key},
            "config": {
                "endpoint": getattr(settings, "bing_search_endpoint", "")
                or "https://api.bing.microsoft.com/v7.0/search",
                "market": "zh-CN",
                "set_lang": "zh-Hans",
            },
        }

    if provider_key == "tianyancha":
        api_key = getattr(settings, "tianyancha_api_key", "") or ""
        if not api_key:
            return None
        return {"secrets": {"api_key": api_key}, "config": {}}

    if provider_key == "doubao_llm":
        # Historical hardcoded default — see apps/api/app/adapters/real/llm.py.
        # The user explicitly asked for this to live in source so we don't
        # break anyone who hasn't configured APP_ENCRYPTION_KEY yet.
        from apps.api.app.adapters.real import llm as llm_module

        return {
            "secrets": {"api_key": llm_module.DOUBAO_API_KEY},
            "config": {
                "base_url": llm_module.DOUBAO_BASE_URL,
                "model": llm_module.DOUBAO_MODEL,
            },
        }

    if provider_key == "smtp":
        password = getattr(settings, "smtp_password", "") or ""
        host = getattr(settings, "smtp_host", "") or ""
        if not (password and host):
            return None
        return {
            "secrets": {"password": password},
            "config": {
                "host": host,
                "port": int(getattr(settings, "smtp_port", 587) or 587),
                "username": getattr(settings, "smtp_username", "") or "",
                "from_addr": getattr(settings, "smtp_from", "")
                or "noreply@a1plus.local",
                "use_tls": bool(getattr(settings, "smtp_use_tls", True)),
            },
        }

    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def resolve_integration(
    db: Session,
    tenant_id: str | None,
    provider_key: str,
    settings: Any,
) -> dict | None:
    """Resolve the effective config for ``(tenant_id, provider_key)``.

    Returns a plain dict (decoupled from ORM rows so callers can close
    the Session immediately):

    .. code-block:: python

        {
            "secrets": {"api_key": "<plaintext>"},
            "config": {"endpoint": "...", ...},
            "source": "db" | "env",
            "integration_id": "<uuid>" | None,
        }

    Returns ``None`` when no layer has a credential — the caller should
    treat this as "provider unconfigured" (e.g. Bing → DuckDuckGo).

    Side effect: when a DB row is chosen, its ``last_used_at`` is bumped
    so operators can confirm the stored credential is live.
    """
    if not is_known_provider(provider_key):
        raise ValueError(f"unknown provider_key: {provider_key!r}")

    row = _best_match(db, tenant_id, provider_key)
    if row is not None:
        try:
            secrets = decrypt_secrets(row.secrets_ciphertext)
        except Exception:
            # Decryption failure leaves the env fallback intact — we'd
            # rather degrade to DDG/stub than crash the whole call path.
            logger.exception(
                "integrations.decrypt_failed tenant=%s key=%s id=%s",
                tenant_id,
                provider_key,
                row.id,
            )
            return _env_with_source(_env_fallback(provider_key, settings))
        row.last_used_at = _utcnow()
        db.commit()
        return {
            "secrets": secrets,
            "config": dict(row.config or {}),
            "source": "db",
            "integration_id": row.id,
        }

    return _env_with_source(_env_fallback(provider_key, settings))


def _env_with_source(payload: dict | None) -> dict | None:
    if payload is None:
        return None
    return {
        "secrets": payload.get("secrets", {}),
        "config": payload.get("config", {}),
        "source": "env",
        "integration_id": None,
    }


def get_masked_summary(
    db: Session,
    tenant_id: str | None,
    provider_key: str,
) -> dict:
    """Return the UI-safe summary for a single provider.

    Never touches ciphertext — the ``key_hint`` column is computed at
    write time, so we only need ``SELECT`` here.
    """
    if not is_known_provider(provider_key):
        raise ValueError(f"unknown provider_key: {provider_key!r}")

    row = _best_match(db, tenant_id, provider_key)
    if row is None:
        return {
            "provider_key": provider_key,
            "configured": False,
            "scope": None,
            "label": None,
            "key_hint": "",
            "last_used_at": None,
            "config": {},
        }
    return {
        "provider_key": provider_key,
        "configured": True,
        "scope": "tenant" if row.tenant_id else "global",
        "label": row.label,
        "key_hint": row.key_hint,
        "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
        "config": dict(row.config or {}),
    }


def list_masked_summaries(db: Session, tenant_id: str | None) -> list[dict]:
    """Masked summary for every registered provider, in ``PROVIDER_SCHEMAS`` order."""
    return [
        get_masked_summary(db, tenant_id, pk) for pk in PROVIDER_SCHEMAS.keys()
    ]


def upsert_integration(
    db: Session,
    *,
    tenant_id: str | None,
    provider_key: str,
    secrets: dict,
    config: dict | None = None,
    label: str | None = None,
) -> ProviderIntegration:
    """Create or replace the active row for ``(tenant_id, provider_key)``.

    ``secrets`` contains plaintext values for the provider's ``secret_keys``
    (e.g. ``{"api_key": "..."}``); we encrypt the whole dict with Fernet
    before writing. Any existing active row for the same slot is
    hard-deleted first so ``_best_match`` always has exactly one candidate.

    Pass an empty string for a secret key to signal "keep existing value"
    — the caller (route handler) should merge with the decrypted previous
    secrets before calling us. We defend against the empty-string leaking
    into the DB by rejecting it here.
    """
    if not is_known_provider(provider_key):
        raise ValueError(f"unknown provider_key: {provider_key!r}")

    schema = PROVIDER_SCHEMAS[provider_key]
    primary = schema["primary_secret"]

    missing = [k for k in schema["secret_keys"] if not secrets.get(k)]
    if missing:
        raise ValueError(
            f"provider {provider_key!r} missing required secret(s): {missing}"
        )

    merged_config = dict(schema.get("config_defaults", {}))
    merged_config.update({k: v for k, v in (config or {}).items() if v is not None})
    # Drop keys not in the schema so random user input doesn't bloat config.
    if schema["config_keys"]:
        merged_config = {
            k: v for k, v in merged_config.items() if k in schema["config_keys"]
        }

    ciphertext = encrypt_secrets({k: secrets[k] for k in schema["secret_keys"]})
    hint = mask_key(secrets.get(primary, ""))

    # Deactivate / delete any prior row for this slot so there's only ever
    # one "active" row per (tenant, provider).
    if tenant_id is None:
        prior_q = db.query(ProviderIntegration).filter(
            ProviderIntegration.tenant_id.is_(None),
            ProviderIntegration.provider_key == provider_key,
        )
    else:
        prior_q = db.query(ProviderIntegration).filter(
            ProviderIntegration.tenant_id == tenant_id,
            ProviderIntegration.provider_key == provider_key,
        )
    for existing in prior_q.all():
        db.delete(existing)
    db.flush()

    row = ProviderIntegration(
        tenant_id=tenant_id,
        provider_key=provider_key,
        label=label,
        secrets_ciphertext=ciphertext,
        config=merged_config,
        key_hint=hint,
        active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_integration(
    db: Session,
    tenant_id: str | None,
    provider_key: str,
) -> bool:
    """Remove the tenant-scoped row (or global row if ``tenant_id is None``).

    Returns ``True`` iff a row was deleted. After deletion the caller
    falls back to the global row (if any) or the ``.env`` layer.
    """
    if not is_known_provider(provider_key):
        raise ValueError(f"unknown provider_key: {provider_key!r}")

    if tenant_id is None:
        q = db.query(ProviderIntegration).filter(
            ProviderIntegration.tenant_id.is_(None),
            ProviderIntegration.provider_key == provider_key,
        )
    else:
        q = db.query(ProviderIntegration).filter(
            ProviderIntegration.tenant_id == tenant_id,
            ProviderIntegration.provider_key == provider_key,
        )
    rows = q.all()
    if not rows:
        return False
    for row in rows:
        db.delete(row)
    db.commit()
    return True


def get_decrypted_for_upsert(
    db: Session,
    tenant_id: str | None,
    provider_key: str,
) -> dict:
    """Return the plaintext secrets of the current active row, or ``{}``.

    Used by route handlers to implement "blank input = keep existing"
    semantics: if the user submits an empty ``api_key`` field, we need
    to merge in the previous decrypted value before re-encrypting.
    """
    if not is_known_provider(provider_key):
        raise ValueError(f"unknown provider_key: {provider_key!r}")

    if tenant_id is None:
        row = _active_row(db, None, provider_key)
    else:
        row = _active_row(db, tenant_id, provider_key)
    if row is None:
        return {}
    try:
        return decrypt_secrets(row.secrets_ciphertext)
    except Exception:
        logger.exception(
            "integrations.prefetch_decrypt_failed tenant=%s key=%s",
            tenant_id,
            provider_key,
        )
        return {}
