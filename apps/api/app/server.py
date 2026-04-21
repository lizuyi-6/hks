import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import inspect, text

from apps.api.app.api.routes import (
    agent_proactive,
    analytics,
    assets,
    auth,
    automation,
    chat,
    compliance,
    consultations,
    diagnosis,
    integrations,
    jobs,
    leads,
    litigation,
    matching,
    module_results,
    notifications,
    notifications_stream,
    orders,
    placeholders,
    profile,
    providers,
    reminders,
    stream,
    suggestions,
    system,
    trademarks,
    upload,
    workflows,
)
from apps.api.app.core.database import Base, engine
from apps.api.app.core.error_handler import register_error_handlers
from apps.api.app.core.logging import configure_logging


_log = logging.getLogger(__name__)


def _lightweight_migrate() -> None:
    """Apply best-effort ALTER TABLE for columns added after initial table creation.

    `Base.metadata.create_all()` only creates missing tables — it never issues
    `ALTER TABLE` for columns added to an already-existing table. In the demo /
    dev SQLite and docker-compose Postgres setups this causes
    `OperationalError: no such column` / `UndefinedColumn` after new columns
    land. A proper Alembic migration is out of scope for the demo rig;
    we introspect and patch only the known cases on both backends.
    """

    backend = engine.url.get_backend_name()
    if backend not in ("sqlite", "postgresql"):
        return

    insp = inspect(engine)
    try:
        existing_tables = set(insp.get_table_names())
    except Exception as exc:  # pragma: no cover — defensive
        _log.warning("lightweight migrate: table inspect failed: %s", exc)
        return

    # (table, column, sqlite DDL, postgres DDL)
    patches: list[tuple[str, str, str, str]] = [
        (
            "provider_leads",
            "assignee_id",
            "ALTER TABLE provider_leads ADD COLUMN assignee_id VARCHAR(36)",
            "ALTER TABLE provider_leads ADD COLUMN IF NOT EXISTS assignee_id VARCHAR(36)",
        ),
        (
            "provider_leads",
            "assigned_at",
            "ALTER TABLE provider_leads ADD COLUMN assigned_at DATETIME",
            "ALTER TABLE provider_leads ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ",
        ),
        (
            "legal_service_providers",
            "tag_vec",
            "ALTER TABLE legal_service_providers ADD COLUMN tag_vec JSON DEFAULT '{}'",
            "ALTER TABLE legal_service_providers ADD COLUMN IF NOT EXISTS tag_vec JSON DEFAULT '{}'::json",
        ),
        (
            "legal_service_providers",
            "tag_vec_updated_at",
            "ALTER TABLE legal_service_providers ADD COLUMN tag_vec_updated_at DATETIME",
            "ALTER TABLE legal_service_providers ADD COLUMN IF NOT EXISTS tag_vec_updated_at TIMESTAMPTZ",
        ),
        (
            # 企业合规评分的 AI 一句话诊断（替换 DonutRing 下方冗余的 label 数字）。
            # 老库里没有这一列，缺了就直接跑 SELECT * 会崩。
            "compliance_profiles",
            "ai_summary",
            "ALTER TABLE compliance_profiles ADD COLUMN ai_summary TEXT",
            "ALTER TABLE compliance_profiles ADD COLUMN IF NOT EXISTS ai_summary TEXT",
        ),
    ]

    with engine.begin() as conn:
        for table, column, sqlite_ddl, postgres_ddl in patches:
            if table not in existing_tables:
                continue
            cols = {c["name"] for c in insp.get_columns(table)}
            if column in cols:
                continue
            ddl = sqlite_ddl if backend == "sqlite" else postgres_ddl
            try:
                conn.execute(text(ddl))
                _log.info("lightweight migrate (%s): added %s.%s", backend, table, column)
            except Exception as exc:  # pragma: no cover — defensive
                _log.warning(
                    "lightweight migrate (%s): failed %s.%s — %s",
                    backend,
                    table,
                    column,
                    exc,
                )


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    _lightweight_migrate()
    try:
        yield
    finally:
        # Gracefully close shared httpx pools so we don't leak connections
        # on reload / shutdown.
        try:
            from apps.api.app.adapters.real.llm import aclose_shared_clients

            await aclose_shared_clients()
        except Exception:  # pragma: no cover - best-effort shutdown
            logging.getLogger(__name__).exception("llm.shared_client.shutdown_failed")


configure_logging()
app = FastAPI(title="A1+ IP Coworker API", lifespan=lifespan)
register_error_handlers(app)


app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(upload.router)
app.include_router(diagnosis.router)
app.include_router(trademarks.router)
app.include_router(assets.router)
app.include_router(reminders.router)
app.include_router(jobs.router)
app.include_router(placeholders.router)
app.include_router(workflows.router)
app.include_router(suggestions.router)
app.include_router(module_results.router)
app.include_router(system.router)
app.include_router(analytics.router)
app.include_router(stream.router)
app.include_router(notifications.router)
app.include_router(notifications_stream.router)
app.include_router(automation.router)
app.include_router(chat.router)
app.include_router(agent_proactive.router)
app.include_router(matching.router)
app.include_router(providers.router)
app.include_router(leads.router)
app.include_router(orders.router)
app.include_router(consultations.router)
app.include_router(compliance.router)
app.include_router(litigation.router)
app.include_router(integrations.router)
