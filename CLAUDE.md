# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A1+ IP Coworker — AI-powered intellectual-property assistance for Chinese small-business founders. Prepares documents, analyzes IP situations, and guides submissions. Does **not** submit to official systems on behalf of users. All AI output carries a "仅供参考，以官方为准" disclaimer.

## Commands

```bash
# Web (Next.js)
npm install
npm run dev:web          # dev server on :3000
npm run build:web
npm run lint:web
npm run test:web         # vitest

# API (FastAPI)
python -m pip install -r apps/api/requirements.txt
uvicorn apps.api.main:app --reload --port 8000

# Worker
python -m apps.worker.main

# Python tests
python -m pytest apps/api/tests apps/worker/tests

# Full stack
docker compose up --build
```

### Running a single test

- Web: `npx vitest run src/path/to/test.ts` (from `apps/web`)
- Python: `python -m pytest apps/api/tests/path/test_file.py -k "test_name"`

## Architecture

**Monorepo**: npm workspaces for TS packages, Python for backend services.

### Frontend (`apps/web`)

- Next.js 15 + React 19 + Tailwind 3 + Vitest
- BFF pattern: `src/app/api/backend/[...path]/route.ts` proxies all `/api/backend/*` to the FastAPI backend, forwarding the auth cookie as a Bearer token
- Route groups: `(auth)` for login/register, `(workspace)` for authenticated pages
- Auth: cookie-based JWT (`authCookieName`), enforced by `src/middleware.ts`
- Path alias `@/` → `src/`

### Backend (`apps/api`)

- FastAPI + SQLAlchemy + Pydantic v2 + PostgreSQL + Redis
- **Hexagonal (ports & adapters) architecture**:
  - `app/ports/interfaces.py` — abstract port interfaces (e.g. `TrademarkSearchPort`, `LLMPort`)
  - `app/adapters/real/` — production adapters (real APIs, LLM, etc.)
  - `app/adapters/mock/` — mock adapters for development/testing
  - `app/adapters/registry.py` — `ProviderRegistry` resolves each port to its active adapter based on env vars (`PROVIDER_*_MODE=real|mock`)
- All API responses are wrapped in `DataSourceEnvelope[T]` (generic envelope with mode, trace_id, source_refs, disclaimer)
- Pydantic models use camelCase aliasing (`to_camel` alias generator) so Python snake_case fields serialize as camelCase JSON
- Config: `app/core/config.py` reads `.env` via pydantic-settings; defaults to SQLite for dev
- Routes in `app/api/routes/` — each domain module has its own route file

### Worker (`apps/worker`)

- Polls database for due jobs (configurable interval via `WORKER_POLL_INTERVAL`), processes them using the same adapter layer

### Shared TS Packages

- `packages/domain` — shared domain types and flow definitions
- `packages/config` — feature flags, provider mode config, navigation, legal boundary notice text
- `packages/ui` — shared atomic UI components

### Knowledge Base (`knowledge-base/`)

- `sources/p0/` — priority-0 content (trademark law, classification guides, application rules)
- `sources/p1/` — priority-1 content (patent templates, software copyright guides)
- `metadata/` — catalog and schema JSON
- `snapshots/` — static data snapshots

## Key Patterns

- **Feature flags**: `FEATURE_*` env vars (e.g. `FEATURE_MONITORING_PUBLIC_SEARCH`) control module visibility; disabled modules return `PlaceholderResponse`
- **Provider mode switching**: Every external dependency has `PROVIDER_*_MODE=real|mock` env var; change to `mock` to work without real APIs
- **Data mode transparency**: Responses never aggregate real and mock data; `mode` field is always explicit
- **Legal boundary**: All user-facing outputs must include the disclaimer from `packages/config` (`legalBoundaryNotice`)
