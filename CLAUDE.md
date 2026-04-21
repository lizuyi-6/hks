# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A1+ IP Coworker — AI-powered intellectual-property assistance for Chinese small-business founders. Prepares documents, analyzes IP situations, and guides submissions. Does **not** submit to official systems on behalf of users. All AI output carries a "仅供参考，以官方为准" disclaimer.

> **Working directory**: The git root is one level above this file. All paths and commands below are relative to this `hks/` directory. Run `cd hks` before executing any command.

## Commands

```bash
# Install dependencies
npm install
python -m pip install -r apps/api/requirements.txt

# Copy default environment (SQLite defaults)
cp .env.example .env

# Web (Next.js)
npm run dev:web          # dev server on :3000
npm run build:web
npm run lint:web
npm run test:web         # vitest

# API (FastAPI)
uvicorn apps.api.main:app --reload --port 8000

# Worker
python -m apps.worker.main

# Tests
npm run test:api         # python -m pytest apps/api/tests apps/worker/tests
npm run test             # web + api tests
```

### Running a single test

- Web (from `apps/web`): `npx vitest run src/path/to/test.ts`
- Python: `python -m pytest apps/api/tests/path/test_file.py -k "test_name"`

## Architecture

**Monorepo**: npm workspaces for TS packages, Python for backend services.

### Frontend (`apps/web`)

- Next.js 15 + React 19 + Tailwind 3 + Vitest
- **BFF layer** (`src/app/api/backend/[...path]/route.ts`) proxies `/api/backend/*` to FastAPI. Mock responses have been removed — all requests must reach the real FastAPI backend (set `NEXT_PRIVATE_API_BASE_URL`).
- Auth routes (`src/app/api/auth/*`) set an `httpOnly` cookie (`a1plus-session`) after a successful FastAPI login.
- SSE client: `lib/sse.ts` provides `fetchSSE<T>()` for consuming backend streaming endpoints.
- Route groups: `(auth)` for login/register, `(workspace)` for authenticated pages
- Path alias `@/` → `src/`

### Backend (`apps/api`)

- FastAPI + SQLAlchemy + Pydantic v2 + PostgreSQL + Redis
- **Hexagonal (ports & adapters) architecture**:
  - `app/ports/interfaces.py` — abstract port interfaces (e.g. `TrademarkSearchPort`, `LLMPort`)
  - `app/adapters/real/` — production adapters (one file per port) — the only implementations kept in the repo
  - `app/adapters/registry.py` — `ProviderRegistry` wires every port to its real adapter; there is no runtime mock/real switch
- **LLM provider is hardcoded**: `adapters/real/llm.py` points at Doubao-Seed-2.0-pro (Volcano Ark) with API key baked into the source. No `LLM_*` env vars are read.
- All API responses are wrapped in `DataSourceEnvelope[T]` (generic envelope with `mode`, `traceId`, `sourceRefs`, `disclaimer`)
- Pydantic models use camelCase aliasing (`to_camel` alias generator) so Python snake_case fields serialize as camelCase JSON
- Config: `app/core/config.py` reads `.env` via pydantic-settings; defaults to SQLite for dev
- Routes in `app/api/routes/` — 13 route modules (analytics, assets, auth, diagnosis, jobs, module_results, placeholders, reminders, stream, suggestions, system, trademarks, workflows)
- SSE streaming: `app/core/streaming.py` + `routes/stream.py` provide server-sent events for diagnosis, contract review, patent assess, policy digest, due diligence. The LLM adapter (`adapters/real/llm.py`) exposes async `*_stream()` variants (e.g. `diagnose_stream()`, `analyze_text_stream()`) that yield SSE tokens; non-streaming callers use the sync counterparts
- Error handling: `app/core/error_handler.py` defines a typed hierarchy (`ValidationError`, `NotFoundError`, `AuthError`, `BusinessError`, `SystemError`) with structured JSON responses
- Database models (`app/db/models.py`): 14 tables — `Tenant`, `User`, `JobRecord`, `IpAsset`, `ReminderTask`, `DocumentRecord`, `WorkflowInstance`, `WorkflowStep`, `ModuleResult`, `SystemEvent`, `AutomationRule`, `Notification` — UUID string PKs, JSON columns
- Auth: PBKDF2-SHA256 password hashing, HS256 JWT tokens (`app/core/security.py`)

### CLI (`apps/cli`)

Two co-located modes share the same entry point (`python -m apps.cli`):

1. **Agent/JSON mode** (argparse + httpx) — stable, machine-parseable
   subcommands for scripting and AI agents. Every command prints JSON on
   stdout; errors go to stderr as JSON and exit non-zero.
2. **Interactive REPL mode** (`prompt_toolkit` + `rich`) — Claude-Code-style
   conversation loop that streams `/chat/stream` tokens live, supports slash
   commands, and persists tokens to `~/.a1plus/config.json`.

Mode selection:

- `python -m apps.cli`              — TTY: launches REPL; non-TTY: reads stdin then JSON chat
- `python -m apps.cli repl`         — always launches REPL
- `python -m apps.cli --json <cmd>` — forces JSON mode (even on TTY)
- `python -m apps.cli <cmd> ...`    — existing subcommands (unchanged)

**Token resolution order**: `--token` > `A1PLUS_TOKEN` env > `~/.a1plus/config.json`.
`login --save` writes the token to that config file so subsequent runs (and
the REPL) pick it up automatically. Override the config dir with
`A1PLUS_CONFIG_DIR` (useful for tests).

**JSON subcommands**: `login`, `chat`, `trademark-check`, `diagnose`,
`list-assets`, `generate-application`, `contract-review`, `patent-assess`,
`policy-digest`, plus `repl` as the interactive entry point.

**REPL slash commands** (typed after `❯ `):
`/help`, `/exit` (aliases `/quit`, `/q`), `/clear`, `/reset-session`,
`/login <email> <password>`, `/logout`, `/whoami`,
`/trademark-check`, `/diagnose`, `/assets`, `/generate-application`,
`/contract-review`, `/patent-assess`, `/policy-digest`, `/save <file.md>`.
Free-form text is sent to `/chat/stream` and rendered live as Markdown;
`action_start`/`action_result` SSE frames become inline panels and `done`
follow-ups appear in a yellow panel at the end.

**Module layout**:

- `main.py` — argparse dispatch for JSON subcommands; routes to REPL on TTY.
- `repl.py` — `prompt_toolkit` loop, history file, Rich banner.
- `slash.py` — slash parser (`shlex`), registry, and handlers (pure; no `sys.exit`).
- `streaming.py` — SSE reader shared by JSON mode (`collect_sse`) and REPL (`stream_sse_to_console`).
- `config.py` — `~/.a1plus/config.json` read/write plus `resolve_token` helper.

**Tests**: `apps/cli/tests/test_slash.py` covers parsing, dispatch, registry
coverage, config round-trip, token precedence, and SSE event aggregation
without any network I/O.

### Worker (`apps/worker`)

- Polls the database for due jobs (interval `WORKER_POLL_INTERVAL`, default 5s)
- Processes 10 job types: `diagnosis.report`, `trademark.application`, `monitoring.scan`, `competitor.track`, `competitor.compare`, `contract.review`, `patent.assess`, `policy.digest`, `due-diligence.investigate`, `reminder.dispatch`
- Job lifecycle: `queued → processing → completed | failed → (retry up to 3) → dead_letter`
- `enqueue_job()` uses SHA-256 of sorted JSON payload as idempotency key to prevent duplicate jobs
- Uses the same adapter registry as the API

### Workflow Engine

- `apps/api/app/services/workflow_engine.py` orchestrates multi-step flows (e.g. `trademark-registration`: diagnosis → check → application → submit guide → ledger)
- Step outputs are deep-merged into workflow context for downstream steps
- `get_suggestions()` generates contextual suggestions based on user state (running workflows, completed diagnoses, expiring assets)

### Event System

- `services/event_bus.py` with `emit_event()` creates `SystemEvent` records
- `services/event_types.py` defines event constants (`JOB_COMPLETED`, `MONITORING_ALERT`, `ASSET_EXPIRING_SOON`, etc.)
- `services/automation_engine.py` processes events and fires `AutomationRule` actions
- `worker/event_processor.py` consumes and processes events asynchronously

### Shared TS Packages

- `packages/domain` — shared domain types, `modules` array (11 module definitions), `coreWorkflow`, `riskLevelMeta`
- `packages/config` — feature flags, provider mode config, `legalBoundaryNotice` constant
- `packages/ui` — shared atomic components (`SectionCard`, `SourceTag`, `StatusBadge`, `Metric`, `PipelineIndicator`, `NextStepCard`)

### Knowledge Base (`knowledge-base/`)

- `sources/p0/` — priority-0 content (trademark law, classification guides, application rules)
- `sources/p1/` — priority-1 content (patent templates, software copyright guides)
- `metadata/` — catalog and schema JSON
- `snapshots/` — static data snapshots
- Index script: `python -m apps.api.scripts.index_knowledge`

## Key Patterns

- **No mock mode**: Both the frontend BFF mock branches and the backend mock adapter module have been removed. Every request ends at the real FastAPI backend, and every FastAPI port is served by a real adapter.
- **Feature flags**: `FEATURE_*` env vars control module visibility; disabled modules return `PlaceholderResponse`
- **Data mode transparency**: Every `DataSourceEnvelope.mode` is `"real"`; the field is retained for UI compatibility but no longer has alternatives
- **Legal boundary**: All user-facing outputs must include the disclaimer from `packages/config` (`legalBoundaryNotice`)
- **Unified errors**: Backend raises typed `APIError` subclasses; frontend parses them into `ApplicationError` via `lib/errors.ts` — both share the same type hierarchy
- **No global state**: Frontend components use local `useState`/`useEffect` with direct `fetch()` calls to the BFF
- **LLM failure = user-visible error**: The LLM adapter no longer has a rules-engine fallback — when Doubao is unreachable or returns a malformed response, `LLMPort.diagnose` / `summarize_application` / `analyze_text` raise `SystemError` (HTTP 500). Streaming variants emit an `error` SSE event and end.
- **Search provider chain**: Monitoring adapter tries Bing API → DuckDuckGo (with custom SSL context for compatibility) → static knowledge-base rules. Each layer only activates when the previous one is unconfigured or fails

## Environment Variables

Key vars beyond the obvious DB/Redis URLs:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_DEFAULT_DATA_MODE` | Default data mode shown in UI (cosmetic — all data is real now) |
| `NEXT_PUBLIC_APP_URL` | Public-facing app URL |
| `NEXT_PUBLIC_API_PROXY_BASE` | BFF proxy base path (default `/api/backend`) |
| `NEXT_PRIVATE_API_BASE_URL` | Server-side URL for BFF → FastAPI (differs from public URL in Docker) |
| `APP_SECRET_KEY` | JWT signing key |
| `APP_ENV` | `development` / `production` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT token lifetime (default 120) |
| `GENERATED_DIR` | Where rendered documents (PDF/DOCX) are stored; defaults to `apps/api/.generated/` |
| `KNOWLEDGE_BASE_DIR` | Path to knowledge base files |
| `WORKER_POLL_INTERVAL` | Worker polling interval in seconds (default 5) |
| `APP_ENCRYPTION_KEY` | **Master Fernet key** for encrypting at-rest provider credentials. Required when `APP_ENV` is not `development`/`test`. Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Rotating this key WITHOUT re-encrypting rows will make stored secrets unreadable. |
| `TIANAYANCHA_API_KEY` | Tianyancha fallback (used only if no `tianyancha` row exists in `provider_integrations`) |
| `BING_SEARCH_API_KEY` / `BING_SEARCH_ENDPOINT` | Bing search fallback (used only if no `bing_search` row exists) |
| `DOUBAO_API_KEY` / `DOUBAO_BASE_URL` / `DOUBAO_MODEL` | Doubao LLM fallback (used only if no `doubao_llm` row exists) |
| `SMTP_*` | SMTP fallback (used only if no `smtp` row exists) |
| `PROFILE_MATCHING_MODE` | `rules` (default, hybrid rule + embedding rerank) or `embedding` (embedding-only rerank) |

### Provider credentials — DB-first resolution

External API credentials (Bing Search, Tianyancha, Doubao LLM, SMTP) are no longer read straight from the environment. They live in the `provider_integrations` table as **Fernet-encrypted** rows and are resolved via `apps/api/app/db/repositories/integrations.py::resolve_integration` in this order:

1. **Tenant-scoped row** — `(tenant_id = <caller>, provider_key, active=true)`
2. **Global row** — `(tenant_id IS NULL, provider_key, active=true)` (seeded by ops for "default" tenants)
3. **Environment fallback** — the `BING_SEARCH_*` / `TIANAYANCHA_*` / `DOUBAO_*` / `SMTP_*` vars listed above

Tenants manage their own keys in-app via **企业合规中心 → 集成配置** (`apps/web/src/components/workspace/enterprise.tsx` → `IntegrationsTab`). The frontend only ever sees a masked hint (`sk_…abcd`); the plaintext key never leaves the server after upsert. Non-admin tenant users get 403 on writes (see `require_tenant_admin` in `apps/api/app/services/dependencies.py`).

When propagating `tenant_id` through new adapter code, remember: any call into `NotificationPort` / `CompetitorPort` / `EnterpriseLookupPort` / `LLMPort` should pass the caller's `tenant_id` so the correct key is resolved.

## Testing Notes

- API tests use `conftest.py` fixtures: `client` (FastAPI `TestClient`) and `auth_headers`; database tables are dropped/recreated before each test automatically
- Frontend tests run in Node environment (not jsdom); test files match `src/**/*.test.ts`
- CI pipeline (`.github/workflows/ci.yml`): lint+build-web, test-api, test-worker, docker-build; deploy stages on push to `develop` (staging) and `main` (production)

## Docker

`docker-compose.yml` runs 5 services: PostgreSQL, Redis, API, Worker, Web. API and Worker share `Dockerfile.api` — Worker is the same image with a different entrypoint (`python -m apps.worker.main`). The web container uses Next.js `output: "standalone"`. Docker images use `hub.rat.dev` Chinese mirror by default (overridable via `--build-arg`).

## Frontend Conventions

- Auth helpers live in `lib/auth.ts` (`getSessionToken()`, `isAuthenticated()`); session is the `a1plus-session` httpOnly cookie
- `lib/env.ts` exports `apiBaseUrl` / `proxyBaseUrl` used by BFF and components
- `lib/analytics.ts` provides batched event tracking (5s interval, 50 event max); only active in browser (SSR-safe)
- `middleware.ts` injects `x-pathname` header for server-side request tracking; it excludes API routes and static assets
