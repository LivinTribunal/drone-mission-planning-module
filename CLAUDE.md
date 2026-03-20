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
- **Frontend design system**: Read `docs/specs/DESIGN-SYSTEM.md` before writing any components. Implement the CSS variables exactly as specified (`--tv-*`). Reference `docs/design-reference/` for visual patterns but do NOT copy Next.js patterns - use React 18 + Vite + react-router-dom. Every component must use `--tv-*` CSS variables, not placeholder/default Tailwind colors.
- **Schemas**: `{Entity}Response`, `{Entity}Create`, `{Entity}Update` for Pydantic DTOs
- **Routes**: `/api/v1/{resource}` (e.g., `/api/v1/missions`)
- **Error handling**: `HTTPException` in routes, custom exceptions in services
- **Docstrings**: every `def` function and `class` must have a `"""..."""` docstring - short, lowercase, one line when possible
- **Comments**: sparse, lowercase, casual. Follow these rules exactly:
  - Never comment what the code obviously does (`# enable postgis`, `# create engine`). If the code is self-explanatory, don't comment it.
  - Use short section labels above logical groups: `# test db config`, `# relationships`, `# runway-specific columns`
  - Use dashes (`-`) not em-dashes (`—`) in comments
  - Inline comments only for non-obvious things: `# discriminator`, `# noqa: F401`
  - Always a blank line before a section comment, no blank line between the comment and the code it describes
  - Add a blank line after a logical block ends (e.g. after `conn.commit()` before the next statement)
- **UUIDs**: `Column(UUID, primary_key=True, default=uuid4)` for all primary keys
- **Geometry**: GeoAlchemy2 `Geometry("POINTZ", srid=4326)` for all coordinates
- **Frontend i18n**: All user-facing strings use `react-i18next`. Translation files in `frontend/src/i18n/locales/{lang}.json`. Use `useTranslation()` hook + `t()` calls. Nest keys by page/component. Never hardcode user-visible text in JSX. Adding a new language requires only a new JSON file + registering it in `src/i18n/index.ts`.

## Project Structure

```
drone-mission-planning-module/
├── backend/
│   ├── app/
│   │   ├── api/routes/     # FastAPI routers — HTTP layer only
│   │   ├── core/           # config, database, auth, dependencies
│   │   ├── models/         # SQLAlchemy + GeoAlchemy2 ORM models
│   │   ├── schemas/        # Pydantic v2 request/response DTOs
│   │   ├── services/       # All business logic
│   │   └── main.py         # FastAPI app + CORS + middleware
│   ├── migrations/         # Alembic migration files
│   ├── tests/              # pytest test files
│   └── requirements.txt    # Pinned deps (PROTECTED)
├── frontend/
│   ├── src/
│   │   ├── pages/          # operator-center/ and coordinator-center/ routes
│   │   ├── components/     # Reusable React components
│   │   │   ├── common/     # Button, Input, Modal, Badge, Card, Dropdown, etc.
│   │   │   ├── mission/    # MissionConfigForm, InspectionList, TemplatePicker, etc.
│   │   │   ├── map/        # AirportMap + layers/ + overlays/
│   │   │   ├── Layout/     # NavBar, MissionTabNav, OperatorLayout, etc.
│   │   │   └── Auth/       # ProtectedRoute
│   │   ├── contexts/       # AuthContext, AirportContext, ThemeContext
│   │   ├── api/            # Axios client + API functions
│   │   ├── i18n/           # i18next config + locale JSON files
│   │   └── types/          # TypeScript interfaces matching Pydantic schemas
│   └── package.json
├── .codefactory/prompts/   # Agent prompt files
├── .github/workflows/      # CI + agent automation workflows
├── scripts/                # CI helper scripts + guard scripts
├── docs/                   # Architecture, conventions, specs
├── harness.config.json     # Risk tier definitions
└── docker-compose.yml      # PostgreSQL 16 + PostGIS 3.4
```

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
- `frontend/src/components/map/layers/` — MapLibre GL layer modules (surfaceLayers, obstacleLayers, safetyZoneLayers, aglLayers, waypointLayers, mapImages)
- `frontend/src/components/map/overlays/` — map UI overlays (LayerPanel, LegendPanel, PoiInfoPanel, WaypointListPanel, WaypointInfoPanel, TerrainToggle, MapHelpPanel)

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

## Testing

- **Backend**: pytest + httpx for async API tests, real PostGIS via docker service container in CI
- **Frontend**: Vitest + React Testing Library
- **Test location**: `backend/tests/test_{module}.py`, frontend co-located `{Component}.test.tsx`
- **Fixtures**: shared in `conftest.py`, test data in `tests/data/` modules
- **T3 paths** (trajectory, safety_validator, flight_plan, migrations) require thorough test coverage

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

## CodeFactory Automation

This repo uses [CodeFactory](https://github.com/yasha-dev1/codefactory) for automated issue lifecycle. Humans steer, agents execute.

### Issue Lifecycle

1. **Create issue** on GitHub using the feature template (`.github/ISSUE_TEMPLATE/feature.md`)
2. **Triage** — add label `agent:plan` or manually label `agent:implement`
   - `issue-triage.yml` runs automatically on new issues, evaluates actionability
   - If actionable, it adds `agent:plan` label
3. **Plan** — `issue-planner.yml` triggers on `agent:plan` label
   - Reads this file (CLAUDE.md) + `.codefactory/prompts/issue-planner.md`
   - Posts a structured implementation plan as an issue comment
   - Adds `agent:implement` label when done
4. **Implement** — `issue-implementer.yml` triggers on `agent:implement` label
   - Reads this file (CLAUDE.md) + `.codefactory/prompts/issue-implementer.md`
   - Creates branch `feat/<short-name>`, writes code, runs quality checks, opens PR
5. **Review** — `code-review-agent.yml` triggers on PR opened/synced
   - Reads `scripts/review-prompt.md` for review instructions
   - Posts review with APPROVE, REQUEST_CHANGES, or ESCALATE verdict
6. **Remediation** — if REQUEST_CHANGES, `remediation-agent.yml` auto-fixes (max 3 cycles)
7. **Human merge** — you review, make OPSEC edits, squash merge

### Agent Prompt Files

- `.codefactory/prompts/agent-system.md` — identity rules, OPSEC, commit style
- `.codefactory/prompts/issue-triage.md` — how issues get evaluated
- `.codefactory/prompts/issue-planner.md` — how implementation plans are produced
- `.codefactory/prompts/issue-implementer.md` — how the coding agent works
- `.codefactory/prompts/review-agent.md` — how PRs get auto-reviewed

### GitHub Labels for Automation

- `agent:plan` — triggers issue-planner workflow
- `agent:implement` — triggers issue-implementer workflow
- `agent-pr` — marks PRs created by agents
- `agent:needs-judgment` — agent cannot proceed without human input
- `needs-more-info` — issue needs more detail
- `needs-human-review` — requires human review

### Risk Tiers

Defined in `harness.config.json`:

| Tier | Patterns | CI Checks |
|------|----------|-----------|
| T1 (low) | `docs/**`, `*.md` | lint |
| T2 (medium) | `backend/app/**`, `frontend/src/**`, tests | lint, test, build, structural-tests |
| T3 (high) | `**/trajectory*`, `**/safety_validator*`, `**/flight_plan*`, `**/migrations/*` | all T2 + manual approval |

### Protected Files

Agents must never modify:
- `.github/workflows/**` — CI pipeline definitions
- `harness.config.json` — risk tier configuration
- `CLAUDE.md` — agent instructions
- `backend/requirements.txt` — Python dependencies
- `frontend/package-lock.json` — npm lockfile

### Chrome DevTools MCP

`.mcp.json` at project root configures `@modelcontextprotocol/server-puppeteer` for browser-driven validation.

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
- `docs/conventions.md` — Coding standards, git workflow, quality gates, OPSEC rules.
- `docs/specs/CHAPTER3-SYSTEM-DESIGN.md` — Complete Chapter 3 from thesis.
  The authoritative design reference. Read this for any architectural question.

## DDD-Lite Patterns

Business logic belongs on model methods, not in services. Services handle DB access and HTTP concerns only.

### Aggregate Roots
- **Mission** — owns inspections, controls status transitions via `transition_to()`. Enforces DRAFT-only for inspection add/remove, max 10 inspections, auto-regresses VALIDATED→PLANNED on trajectory-affecting changes.
- **Airport** — owns surfaces, obstacles, safety zones via `add_surface()`, `add_obstacle()`, `add_safety_zone()`.

### Value Objects (`backend/app/models/value_objects.py`)
- **Coordinate** — immutable (lat, lon, alt) with range validation, `to_wkt()`
- **Speed** — non-negative float
- **AltitudeRange** — min ≤ max, `contains()` method
- **IcaoCode** — exactly 4 uppercase alpha chars

### Key Entity Methods
- `Mission.transition_to(status)` — enforces state machine
- `Mission.add_inspection()` / `remove_inspection()` — DRAFT-only, max 10
- `InspectionConfiguration.resolve_with_defaults(template_config)`
- `AGL.calculate_lha_center_point()` — centroid of LHA positions
- `Inspection.is_speed_compatible_with_frame_rate(drone, speed)`
- `FlightPlan.compile(total_distance, estimated_duration)`

### Rules for New Code
- New business logic → method on the relevant model
- New primitive (speed, altitude, angle) → value object
- New child entity → create through aggregate root method
- Status change → `mission.transition_to()`, never assign directly

## Branching Strategy

- **Always `feat/<short-description>`** — e.g., `feat/db-models`, `feat/airport-api`, `feat/frontend-shell`
- **No milestone branches.** Every branch merges directly into `main` via squash merge.
- **One issue per branch.** Never combine multiple issues into one branch.
- Check GitHub issues/PRs to confirm dependencies are met before starting an issue.