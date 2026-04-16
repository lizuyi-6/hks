# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A1+ IP Coworker — AI-powered intellectual-property assistance for Chinese small-business founders. Prepares documents, analyzes IP situations, and guides submissions. Does **not** submit to official systems on behalf of users. All AI output carries a "仅供参考，以官方为准" disclaimer.

## Commands

```bash
# Install dependencies
npm install
python -m pip install -r apps/api/requirements.txt

# Copy default environment (SQLite defaults, mock providers)
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
- **BFF layer** (`src/app/api/backend/[...path]/route.ts`) proxies `/api/backend/*` to FastAPI. It also supports a standalone `mock` mode: when `NEXT_PUBLIC_API_MODE=mock` (default), the BFF returns hard-coded JSON/binary responses without hitting the backend.
- Auth routes (`src/app/api/auth/*`) set an `httpOnly` cookie (`a1plus-session`) in both real and mock modes.
- SSE client: `lib/sse.ts` provides `fetchSSE<T>()` for consuming backend streaming endpoints.
- Route groups: `(auth)` for login/register, `(workspace)` for authenticated pages
- Path alias `@/` → `src/`

### Backend (`apps/api`)

- FastAPI + SQLAlchemy + Pydantic v2 + PostgreSQL + Redis
- **Hexagonal (ports & adapters) architecture**:
  - `app/ports/interfaces.py` — 14 abstract port interfaces (e.g. `TrademarkSearchPort`, `LLMPort`)
  - `app/adapters/real/` — production adapters (one file per port)
  - `app/adapters/mock/providers.py` — all 14 mock adapters in a single file
  - `app/adapters/registry.py` — `ProviderRegistry` resolves each port based on `PROVIDER_*_MODE=real|mock`
- All API responses are wrapped in `DataSourceEnvelope[T]` (generic envelope with `mode`, `traceId`, `sourceRefs`, `disclaimer`)
- Pydantic models use camelCase aliasing (`to_camel` alias generator) so Python snake_case fields serialize as camelCase JSON
- Config: `app/core/config.py` reads `.env` via pydantic-settings; defaults to SQLite for dev
- Routes in `app/api/routes/` — 13 route modules (analytics, assets, auth, diagnosis, jobs, module_results, placeholders, reminders, stream, suggestions, system, trademarks, workflows)
- SSE streaming: `app/core/streaming.py` + `routes/stream.py` provide server-sent events for diagnosis, contract review, patent assess, policy digest, due diligence
- Error handling: `app/core/error_handler.py` defines a typed hierarchy (`ValidationError`, `NotFoundError`, `AuthError`, `BusinessError`, `SystemError`) with structured JSON responses
- Database models (`app/db/models.py`): `User`, `JobRecord`, `IpAsset`, `ReminderTask`, `DocumentRecord`, `WorkflowInstance`, `WorkflowStep`, `ModuleResult` — UUID string PKs, JSON columns
- Auth: PBKDF2-SHA256 password hashing, HS256 JWT tokens (`app/core/security.py`)

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

- **Dual mock system**: The frontend BFF has its own complete mock responses (in `[...path]/route.ts`) that are independent of the backend's mock adapters. When `NEXT_PUBLIC_API_MODE=mock`, the frontend never touches FastAPI at all. When `real`, the BFF proxies to FastAPI, which may itself use mock adapters based on `PROVIDER_*_MODE`.
- **Feature flags**: `FEATURE_*` env vars control module visibility; disabled modules return `PlaceholderResponse`
- **Data mode transparency**: Responses never aggregate real and mock data; `mode` field is always explicit
- **Legal boundary**: All user-facing outputs must include the disclaimer from `packages/config` (`legalBoundaryNotice`)
- **Unified errors**: Backend raises typed `APIError` subclasses; frontend parses them into `ApplicationError` via `lib/errors.ts` — both share the same type hierarchy
- **No global state**: Frontend components use local `useState`/`useEffect` with direct `fetch()` calls to the BFF

## Environment Variables

Key vars beyond the obvious DB/Redis URLs:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` (default) skips FastAPI entirely; `real` proxies to backend |
| `NEXT_PUBLIC_DEFAULT_DATA_MODE` | Default data mode shown in UI |
| `NEXT_PUBLIC_APP_URL` | Public-facing app URL |
| `NEXT_PUBLIC_API_PROXY_BASE` | BFF proxy base path (default `/api/backend`) |
| `NEXT_PRIVATE_API_BASE_URL` | Server-side URL for BFF → FastAPI (differs from public URL in Docker) |
| `APP_SECRET_KEY` | JWT signing key |
| `APP_ENV` | `development` / `production` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT token lifetime (default 120) |
| `GENERATED_DIR` | Where rendered documents (PDF/DOCX) are stored; defaults to `apps/api/.generated/` |
| `KNOWLEDGE_BASE_DIR` | Path to knowledge base files |
| `WORKER_POLL_INTERVAL` | Worker polling interval in seconds (default 5) |
| `LLM_PROVIDER` | LLM backend name (e.g. `minimax`) |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | LLM connection settings |
| `TIANAYANCHA_API_KEY` | Tianyancha enterprise-lookup API key |
| `BING_SEARCH_API_KEY` / `BING_SEARCH_ENDPOINT` | Bing web-search API for monitoring |
| `SMTP_*` | Email notification settings (host, port, username, password, from, use_tls) |

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
