"""Tenant-scoped provider integration CRUD.

Everything here lives on ``/integrations`` and is gated by
:func:`~apps.api.app.services.dependencies.require_tenant_admin` (for
writes) or :func:`~apps.api.app.services.dependencies.get_current_tenant`
(for the read-only masked summary).

The route never returns ciphertext or raw secrets — only ``key_hint``
and the non-sensitive ``config`` subset, matching the plan's "only the
last 4 chars ever leave the server" guarantee.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.database import get_db
from apps.api.app.db.repositories.integrations import (
    PROVIDER_SCHEMAS,
    delete_integration,
    get_decrypted_for_upsert,
    is_known_provider,
    list_masked_summaries,
    resolve_integration,
    upsert_integration,
)
from apps.api.app.services.dependencies import (
    TenantContext,
    get_current_tenant,
    require_tenant_admin,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations", tags=["integrations"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ProviderSchemaResponse(BaseModel):
    provider_key: str
    label: str
    description: str
    secret_keys: list[str]
    config_keys: list[str]
    config_defaults: dict[str, Any]
    primary_secret: str


class IntegrationSummary(BaseModel):
    provider_key: str
    configured: bool
    scope: str | None = None  # "tenant" | "global" | None
    label: str | None = None
    key_hint: str = ""
    last_used_at: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)


class IntegrationUpsertRequest(BaseModel):
    secrets: dict[str, str] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    label: str | None = None


class IntegrationTestResponse(BaseModel):
    ok: bool
    latency_ms: int
    source: str  # "db" | "env"
    reason: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tenant_id(ctx: TenantContext) -> str | None:
    return ctx.tenant.id if ctx.tenant else None


def _ensure_known(provider_key: str) -> None:
    if not is_known_provider(provider_key):
        raise HTTPException(status_code=404, detail=f"未知 provider: {provider_key}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/providers", response_model=list[ProviderSchemaResponse])
def list_provider_schemas(_: TenantContext = Depends(get_current_tenant)):
    """Return the static schema for every known provider.

    The frontend uses this to render the correct field set per provider
    form; no tenant data is read.
    """
    return [
        ProviderSchemaResponse(
            provider_key=key,
            label=schema.get("label", key),
            description=schema.get("description", ""),
            secret_keys=list(schema.get("secret_keys", [])),
            config_keys=list(schema.get("config_keys", [])),
            config_defaults=dict(schema.get("config_defaults", {})),
            primary_secret=schema.get("primary_secret", ""),
        )
        for key, schema in PROVIDER_SCHEMAS.items()
    ]


@router.get("", response_model=list[IntegrationSummary])
def list_integrations(
    ctx: TenantContext = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    """Masked summary for every provider from the caller's perspective."""
    return [IntegrationSummary(**row) for row in list_masked_summaries(db, _tenant_id(ctx))]


@router.put("/{provider_key}", response_model=IntegrationSummary)
def upsert_provider(
    provider_key: str,
    body: IntegrationUpsertRequest,
    ctx: TenantContext = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Create or replace the tenant-scoped row for ``provider_key``.

    Blank secret fields preserve the existing value (so users can update
    ``config`` without re-typing the API key). If no prior value exists,
    blank secrets are rejected.
    """
    _ensure_known(provider_key)
    tenant_id = _tenant_id(ctx)
    if tenant_id is None:
        raise HTTPException(status_code=400, detail="当前账号未绑定租户，无法写入集成配置")

    schema = PROVIDER_SCHEMAS[provider_key]
    previous = get_decrypted_for_upsert(db, tenant_id, provider_key)

    merged_secrets: dict[str, str] = {}
    for key in schema["secret_keys"]:
        incoming = (body.secrets or {}).get(key, "")
        if incoming:
            merged_secrets[key] = incoming
        elif previous.get(key):
            merged_secrets[key] = previous[key]
        # else: leave missing so repo raises a clear ValueError

    try:
        row = upsert_integration(
            db,
            tenant_id=tenant_id,
            provider_key=provider_key,
            secrets=merged_secrets,
            config=body.config or {},
            label=body.label,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return IntegrationSummary(
        provider_key=row.provider_key,
        configured=True,
        scope="tenant",
        label=row.label,
        key_hint=row.key_hint,
        last_used_at=row.last_used_at.isoformat() if row.last_used_at else None,
        config=dict(row.config or {}),
    )


@router.delete("/{provider_key}", status_code=204)
def delete_provider(
    provider_key: str,
    ctx: TenantContext = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Remove the tenant-scoped integration row; caller falls back to global/.env."""
    _ensure_known(provider_key)
    tenant_id = _tenant_id(ctx)
    if tenant_id is None:
        raise HTTPException(status_code=400, detail="当前账号未绑定租户，无集成可删除")
    deleted = delete_integration(db, tenant_id, provider_key)
    if not deleted:
        # Soft 404 — idempotent delete is friendlier than a hard error
        # when the UI clicks "reset to default" twice in a row.
        logger.info(
            "integrations.delete.noop tenant=%s key=%s", tenant_id, provider_key
        )
    return None


@router.post("/{provider_key}/test", response_model=IntegrationTestResponse)
def test_provider(
    provider_key: str,
    ctx: TenantContext = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    """Run a lightweight connectivity probe for ``provider_key``.

    Each probe is intentionally minimal (Bing: ``q=ping&count=1``; SMTP:
    ``smtp.noop()``; Doubao: 1-token completion; Tianyancha: search with
    ``pageSize=1``) so the user gets a deterministic "is my key wired?"
    signal without burning real budget.
    """
    _ensure_known(provider_key)
    cfg = resolve_integration(db, _tenant_id(ctx), provider_key, get_settings())
    if cfg is None:
        raise HTTPException(status_code=404, detail="未配置凭证，无法测试连通性")

    t0 = time.perf_counter()
    try:
        _probe_provider(provider_key, cfg)
        return IntegrationTestResponse(
            ok=True,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            source=cfg.get("source", "unknown"),
        )
    except Exception as exc:
        logger.warning(
            "integrations.test_failed key=%s source=%s error=%s",
            provider_key,
            cfg.get("source"),
            exc,
        )
        return IntegrationTestResponse(
            ok=False,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            source=cfg.get("source", "unknown"),
            reason=str(exc)[:200],
        )


# ---------------------------------------------------------------------------
# Connectivity probes
# ---------------------------------------------------------------------------

def _probe_provider(provider_key: str, cfg: dict) -> None:
    """Raise on failure; return ``None`` on success."""
    secrets = cfg.get("secrets", {}) or {}
    config = cfg.get("config", {}) or {}

    if provider_key == "bing_search":
        endpoint = config.get("endpoint") or "https://api.bing.microsoft.com/v7.0/search"
        with httpx.Client(timeout=10) as client:
            resp = client.get(
                endpoint,
                headers={"Ocp-Apim-Subscription-Key": secrets.get("api_key", "")},
                params={"q": "ping", "count": 1, "mkt": config.get("market", "zh-CN")},
            )
        resp.raise_for_status()
        return

    if provider_key == "tianyancha":
        with httpx.Client(timeout=10) as client:
            resp = client.get(
                "https://open.api.tianyancha.com/services/open/search/2.0",
                headers={"Authorization": secrets.get("api_key", "")},
                params={"keyword": "ping", "pageSize": 1},
            )
        resp.raise_for_status()
        # Tianyancha returns errorCode=0 on success; surface non-zero as failure.
        try:
            body = resp.json()
        except Exception:
            return
        error_code = body.get("error_code") if isinstance(body, dict) else None
        if error_code not in (0, None):
            raise RuntimeError(f"tianyancha error_code={error_code}: {body.get('reason')}")
        return

    if provider_key == "doubao_llm":
        base_url = (config.get("base_url") or "").rstrip("/")
        with httpx.Client(timeout=15) as client:
            resp = client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {secrets.get('api_key', '')}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": config.get("model", "Doubao-Seed-2.0-pro"),
                    "messages": [
                        {"role": "system", "content": "ping"},
                        {"role": "user", "content": "ping"},
                    ],
                    "max_tokens": 1,
                    "temperature": 0,
                },
            )
        resp.raise_for_status()
        return

    if provider_key == "smtp":
        import smtplib

        host = config.get("host") or ""
        port = int(config.get("port") or 587)
        use_tls = bool(config.get("use_tls") if config.get("use_tls") is not None else True)
        username = config.get("username") or ""
        password = secrets.get("password") or ""
        if not host:
            raise RuntimeError("smtp.host 为空")
        if use_tls:
            server = smtplib.SMTP(host, port, timeout=10)
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        try:
            if username and password:
                server.login(username, password)
            server.noop()
        finally:
            try:
                server.quit()
            except Exception:
                pass
        return

    raise RuntimeError(f"未实现 {provider_key} 的连通性探测")
