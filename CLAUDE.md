# CLAUDE.md

## Project Overview

TarmacView — Drone Mission Planning Module for airport lighting inspection.
Python 3.12 + FastAPI backend, React 18 + TypeScript + Vite frontend, PostgreSQL 16 + PostGIS 3.4.

## Build & Run Commands

```bash
# Backend — install deps
cd backend && pip install -r requirements.txt

# Backend — run dev server
cd backend && uvicorn app.main:app --reload

# Backend — run all tests
cd backend && pytest

# Backend — run single test file
cd backend && pytest tests/test_example.py -v

# Backend — lint
cd backend && ruff check .

# Backend — format check
cd backend && ruff format --check .

# Frontend — install deps
cd frontend && npm install

# Frontend — run dev server
cd frontend && npm run dev

# Frontend — run all tests
cd frontend && npx vitest run

# Frontend — run single test file
cd frontend && npx vitest run src/components/Example.test.tsx

# Frontend — lint
cd frontend && npm run lint

# Frontend — build
cd frontend && npm run build

# Database — start PostGIS
docker compose up -d
```

## Code Style Rules

- **Python imports**: stdlib → third-party → local (enforced by Ruff `I` rule)
- **Python naming**: `snake_case` files and functions, `PascalCase` classes
- **Python line length**: 100 characters max (Ruff config in `pyproject.toml`)
- **Frontend naming**: `PascalCase.tsx` for components, `camelCase.ts` for utilities
- **Frontend types**: `frontend/src/types/{domain}.ts`, use `interface` matching Pydantic schemas
- **Schemas**: `{Entity}Response`, `{Entity}Create`, `{Entity}Update` for Pydantic DTOs
- **Routes**: `/api/v1/{resource}` (e.g., `/api/v1/missions`)
- **Error handling**: `HTTPException` in routes, custom exceptions in services
- **Comments**: sparse, lowercase, casual — no docstrings on simple CRUD or schemas. Follow these rules exactly:
  - No docstrings anywhere. Use `#` comments only.
  - Never comment what the code obviously does (`# enable postgis`, `# create engine`). If the code is self-explanatory, don't comment it.
  - Use short section labels above logical groups: `# test db config`, `# relationships`, `# runway-specific columns`
  - Use dashes (`-`) not em-dashes (`—`) in comments
  - Inline comments only for non-obvious things: `# discriminator`, `# noqa: F401`
  - Always a blank line before a section comment, no blank line between the comment and the code it describes
  - Add a blank line after a logical block ends (e.g. after `conn.commit()` before the next statement)
- **UUIDs**: `Column(UUID, primary_key=True, default=uuid4)` for all primary keys
- **Geometry**: GeoAlchemy2 `Geometry("POINTZ", srid=4326)` for all coordinates

## Architecture Overview

```
frontend/src/ → Axios client → /api/v1/* → FastAPI routers → services → SQLAlchemy models → PostGIS
```

- `backend/app/api/routes/` — HTTP layer only, no business logic
- `backend/app/services/` — all business logic lives here
- `backend/app/models/` — SQLAlchemy + GeoAlchemy2 ORM models
- `backend/app/schemas/` — Pydantic v2 request/response DTOs
- `backend/app/core/` — config, database, auth, dependencies
- `frontend/src/api/client.ts` — Axios with JWT interceptor, all API calls go through here
- `frontend/src/pages/` — operator-center and coordinator-center routes

**Dependency rule**: routes → services → models/schemas. Routes never import models directly.

## Critical Paths — Extra Care Required

- `**/trajectory*` — core thesis algorithm
- `**/safety_validator*` — safety-critical validation
- `**/flight_plan*` — mission output generation
- `**/migrations/versions/*` — database schema changes

Changes to these paths:
- Require additional test coverage beyond the baseline
- Must be reviewed by a human (not just the review agent)
- Should include browser evidence if they affect UI
- Are classified as **Tier 3 (high risk)** per `harness.config.json`

## Security Constraints

- Never commit secrets, API keys, or `.env` files
- Never disable Ruff rules, ESLint rules, or TypeScript strict mode
- Validate all external input at system boundaries (Pydantic handles this)
- Use parameterized queries — SQLAlchemy ORM only, never raw SQL strings
- JWT auth via `python-jose` — never expose tokens in logs
- Follow least privilege in all configurations

## Dependency Management

- **Backend**: `requirements.txt` with pinned versions — **protected file, only humans modify**
- **Frontend**: `npm install <pkg>` — always commit `package-lock.json`
- Do not upgrade major versions without explicit instruction

## Harness System Reference

- Risk tiers defined in `harness.config.json` (T1: docs, T2: source, T3: critical paths)
- CI gates enforce risk-appropriate checks on every PR
- A review agent automatically reviews PRs
- Pre-commit hooks enforce local quality checks
- **Chrome DevTools MCP**: `.mcp.json` at project root configures `@modelcontextprotocol/server-puppeteer` for browser-driven validation
- Protected files (`.github/workflows/**`, `harness.config.json`, `requirements.txt`) — agents must never modify

## PR Conventions

- **Branch naming**: `<type>/<short-description>` (e.g., `feat/add-auth`, `fix/null-check`)
- **Commit messages**: short, lowercase, casual — max 50 chars (e.g., `airport crud endpoints`)
- **No conventional commits** — no `feat:`, `fix:`, `chore:` prefixes
- All PRs must pass CI checks before merge
- Classify every PR by risk tier (T1/T2/T3) in the PR description
- **Git identity**: commits must use `Štefan Moravík <stevko.moravik@gmail.com>`

## Specification Documents — READ BEFORE IMPLEMENTING

Before implementing any issue, read the relevant spec files:

- `docs/specs/SPEC.md` — **ALWAYS READ THIS FIRST.** Complete domain model (19 tables with all columns and types), all 9 enum definitions, trajectory generation formulas, mission status state machine, and page-by-page wireframe summaries for all 14 UI pages.
- `docs/specs/WIREFRAME.md` — Full wireframe specification with every field, interaction, and edge case for each page. Read this when implementing any frontend page.
- `OPERATIONS.md` — How the repo operates: quality gates, issue lifecycle, CI pipeline, OPSEC rules.
- `ISSUE-TRACKER.md` — Current sprint plan, issue dependencies, and status.
- `NAMING-CONVENTIONS.md` — Commit, branch, PR, and code naming conventions.
- `docs/specs/CHAPTER3-SYSTEM-DESIGN.md` — Complete Chapter 3 from thesis. 
  The authoritative design reference. Read this for any architectural question.

## Sprint Context

**Read `SPRINT.md` for current sprint state** — issue status, dependencies, and parallel tracks. Update it after each issue merges.

## Branching Strategy

- **Always `feat/<short-description>`** — e.g., `feat/db-models`, `feat/airport-api`, `feat/frontend-shell`
- **No milestone branches.** Every branch merges directly into `main` via squash merge.
- **One issue per branch.** Never combine multiple issues into one branch.
- Check the Sprint Context section above to confirm dependencies are met before starting an issue.