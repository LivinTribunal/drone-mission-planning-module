# Conventions

Authoritative reference for coding standards, git workflow, quality gates, and OPSEC rules in TarmacView.

---

## Naming

### Files

- **Backend**: `snake_case.py` - `airport.py`, `mission_service.py`, `flight_plan.py`
- **Frontend components**: `PascalCase.tsx` - `MissionDashboard.tsx`, `MapViewer.tsx`
- **Frontend utilities**: `camelCase.ts` - `formatDate.ts`, `useAuth.ts`
- **Frontend types**: `camelCase.ts` in `src/types/` - `mission.ts`, `airport.ts`
- **Config files**: lowercase with dots - `pyproject.toml`, `vite.config.ts`

### Python

- Variables and functions: `snake_case`
- Classes: `PascalCase` - `Airport`, `MissionConfiguration`, `FlightPlan`
- Constants: `UPPER_SNAKE_CASE`
- Enums: `PascalCase` class, `UPPER_SNAKE_CASE` values - `MissionStatus.DRAFT`

### TypeScript

- Variables and functions: `camelCase`
- Components: `PascalCase` (matching filename)
- Interfaces/types: `PascalCase`, no `I` prefix - `Mission`, `WaypointResponse`
- Constants: `UPPER_SNAKE_CASE`

### Backend Schemas

Pydantic schemas follow `{Entity}{Suffix}`:
- `AirportResponse`, `AirportCreate`, `AirportUpdate`
- `MissionResponse`, `MissionCreate`
- `WaypointResponse`, `WaypointCreate`

### API Routes

RESTful paths under `/api/v1/`:
```
GET    /api/v1/missions
POST   /api/v1/missions
GET    /api/v1/missions/{id}
PUT    /api/v1/missions/{id}
DELETE /api/v1/missions/{id}
GET    /api/v1/airports/{id}/surfaces
```

---

## Import Organization

### Python

Ordered by convention, enforced by Ruff `I` rule:

```python
# 1. standard library
from uuid import uuid4
from typing import Optional

# 2. third-party
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

# 3. local application
from app.core.database import get_db
from app.models.mission import Mission
from app.schemas.mission import MissionResponse
```

### TypeScript

```typescript
// 1. react / framework
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 2. third-party libraries
import axios from 'axios';
import maplibregl from 'maplibre-gl';

// 3. local imports (using @ alias)
import { Mission } from '@/types/mission';
import { apiClient } from '@/api/client';
```

---

## Docstrings and Comments

### Docstrings

Every `def` function and every `class` must have a `"""..."""` docstring. Short, lowercase, one line when possible.

```python
# good
def create_mission(db: Session, data: MissionCreate) -> Mission:
    """create a new mission in DRAFT status."""

# bad - too verbose
def create_mission(db: Session, data: MissionCreate) -> Mission:
    """Creates a new mission record in the database with DRAFT status
    and returns the fully populated Mission ORM instance."""
```

### Comments

- Sparse, lowercase, casual. Only comment non-obvious logic.
- Never comment what the code obviously does (`# enable postgis`, `# create engine`).
- Use short section labels above logical groups: `# test db config`, `# relationships`
- Use dashes (`-`) not em-dashes in comments
- Inline comments only for non-obvious things: `# discriminator`, `# noqa: F401`
- Always a blank line before a section comment, no blank line between the comment and the code it describes
- Add a blank line after a logical block ends
- Never write `@author` tags or generation markers

---

## Error Handling

### Backend

- **HTTP errors**: raise `HTTPException` with appropriate status codes in route handlers
- **Service errors**: raise domain-specific exceptions that routes catch and translate to HTTP responses
- **Validation errors**: Pydantic handles request validation automatically - FastAPI returns 422
- **Database errors**: let SQLAlchemy exceptions propagate; handle specific cases (unique constraint, not found) in services

### Frontend

- **API errors**: Axios interceptor handles 401 (redirect to login) and network errors globally
- **Component errors**: try/catch in async handlers, user-friendly messages via toast/alert
- **Never swallow errors silently** - at minimum log to console in development

---

## Testing

### Backend

- **Framework**: pytest + httpx (async API tests)
- **Location**: `backend/tests/` - mirrors `app/` structure
- **Naming**: `test_{module}.py` - `test_airport.py`, `test_trajectory_generator.py`
- **Config**: `pyproject.toml` sets `testpaths = ["tests"]`, `asyncio_mode = "auto"`
- Test data in `tests/data/` modules, fixtures in `conftest.py`

### Frontend

- **Framework**: Vitest + React Testing Library
- **Location**: co-located `{Component}.test.tsx` or grouped `{group}.test.tsx` for lightweight components
- **Naming**: `{Component}.test.tsx`, `{module}.test.ts`, or `{group}.test.tsx` for shared test files
- **Grouped tests**: simple/related components can share a test file (e.g. `common.test.tsx` for Button, Input, Modal, Badge, Card, Dropdown, CollapsibleSection, RowActionMenu)
- **Command**: `npx vitest run`

### What Must Be Tested

- All service methods (unit tests)
- All API routes (integration tests with real PostGIS)
- Complex UI interactions (component tests with Testing Library)
- Context providers (auth, airport, theme state management)
- Trajectory generation and safety validation (T3 - thorough coverage required)

---

## Linting and Formatting

### Python

Ruff configured in `pyproject.toml`:
```toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I"]
```

### TypeScript / Frontend

ESLint configured via `package.json`: `npm run lint`.

---

## Git Workflow

### Commit Messages

Short, lowercase, casual. Max 50 chars. Must start with a verb. No conventional commit prefixes.

```
add airport crud endpoints
fix map marker click
update trajectory service
```

Reference the GitHub issue number when applicable:

```
database schema (#1)
airport crud endpoints (#2)
```

Never write: `feat(backend): implement AirportRouter with full CRUD operations`

### Branch Naming

Format: `<type>/<short-description>`:

```
feat/db-models
feat/airport-api
fix/null-check
feat/frontend-shell
```

One issue per branch. Every branch merges into `main` via squash merge.

### Pull Requests

- Title: short, can use conventional prefixes (feat:, fix:) unlike commits
- Description: 1-2 sentences, include risk tier checkbox (T1/T2/T3)
- Always link the related GitHub issue with `Closes #N`
- Never include AI attribution text

### Git Identity

All commits must use:
```
Štefan Moravík <stevko.moravik@gmail.com>
```

For pushing to GitHub (which blocks personal email): use `LivinTribunal@users.noreply.github.com` as committer email.

---

## Quality Gates

Every line of code passes through five gates before reaching `main`.

### Gate 1 - Pre-commit hooks (local)

Config: `.pre-commit-config.yaml`. Runs on `git commit`:
- `ruff check --fix` - Python lint with auto-fix
- `ruff-format` - Python formatting
- `trailing-whitespace` - strip trailing whitespace
- `detect-private-key` - block accidental key commits
- `check-added-large-files` - block files > 500KB

Install: `pre-commit install`

### Gate 2 - Agent implementation (local)

Config: `CLAUDE.md` + `.codefactory/prompts/issue-implementer.md`

The agent reads CLAUDE.md, writes code following architecture rules, runs linters and tests, fixes failures, pushes and opens a PR.

### Gate 3 - Review agent (automatic, on PR)

Config: `scripts/review-prompt.md` (loaded by `code-review-agent.yml`)

Reviews every PR for architecture compliance, schema usage, test presence, migration inclusion, OPSEC violations.

### Gate 4 - GitHub Actions CI (automatic, on PR)

Config: `.github/workflows/ci.yml`

Risk-gated pipeline via `risk-policy-gate.sh`:

| Tier | Patterns | Required Checks |
|------|----------|-----------------|
| T1 (low) | `docs/**`, `*.md` | lint |
| T2 (medium) | `backend/app/**`, `frontend/src/**`, tests, config | lint, type-check, test, build |
| T3 (high) | `**/trajectory*`, `**/safety_validator*`, `**/flight_plan*`, `**/migrations/versions/*` | All T2 + structural-tests + harness-smoke + manual-approval |

### Gate 5 - Human review (manual, before merge)

1. Read the code - you defend this at your thesis presentation
2. Make 3-5 small changes: rename a variable, reword a comment, add a TODO
3. Verify acceptance criteria from the issue
4. Squash merge with a casual commit message
5. Space merges out - morning and evening, not all at once

---

## Protected Files

These files must only be modified by a human, never by an agent:
- `.github/workflows/**` - CI pipeline definitions
- `harness.config.json` - risk tier configuration
- `CLAUDE.md` - agent instructions
- `backend/requirements.txt` - Python dependencies (pinned versions)
- `frontend/package-lock.json` - npm lockfile

---

## Risk Tiers

Defined in `harness.config.json`:

| Tier | File Patterns | Required Checks |
|------|---------------|-----------------|
| **T1** (low) | `docs/**`, `*.md` | lint |
| **T2** (medium) | `frontend/src/**`, `backend/app/**`, `backend/tests/**` | full test suite, linter, code review |
| **T3** (high) | `**/trajectory*`, `**/safety_validator*`, `**/flight_plan*`, `**/migrations/versions/*` | all T2 + manual review sign-off |

---

## OPSEC Rules

### Rule 1 - No AI artifacts in public repos

This repo is **private** — `CLAUDE.md`, `harness.config.json`, `.codefactory/`, and `.mcp.json` are committed so that CI workflows and agents can read them. If the repo ever becomes public, add these to `.gitignore` immediately.

Never include AI attribution in commits, PR descriptions, or code comments regardless of repo visibility.

### Rule 2 - Git history must look human

- Squash merge everything - every PR becomes one commit under your name
- Casual commit messages - `airport api endpoints`, not `feat(backend): implement AirportController`
- Space out merges - morning + evening, not 10 in 30 minutes
- Vary commit sizes - some 5 files, some 1 file, occasional README update

### Rule 3 - Code must have human fingerprints

After every agent PR, before merging:
1. Read the code - you defend this at thesis presentation
2. Make 3-5 small changes: rename a variable, reword a comment, add a TODO
3. Leave an imperfection - a slightly verbose method, an unused import cleaned up later

Code comments should sound natural:
```python
# bad:
# Validates the waypoint against all registered obstacle geometries
# and safety zone polygons using spatial intersection tests

# good:
# check if waypoint hits any obstacles or safety zones
```

### Rule 4 - Knowledge defense

For every agent-generated PR you merge:
1. Read the code
2. Understand WHY it works
3. Be ready to explain it on a whiteboard
4. Know what alternatives exist and why you didn't choose them

### Pre-push checklist

- [ ] No CLAUDE.md, harness.config.json, or .codefactory/ in the commit
- [ ] Commit message sounds human (short, lowercase, casual)
- [ ] Commit author is your name and email
- [ ] You made at least a few manual changes to the code
- [ ] You can explain every line if asked
- [ ] No "generated by" or "AI" references anywhere in code comments

---

## Internationalization (i18n)

- Library: react-i18next + i18next-browser-languagedetector
- Translations: bundled in frontend/src/i18n/locales/{lang}.json
- Key structure: nested by component/page - airportSelection.columns.name, auth.login
- Interpolation: t("key", { var: value }) with {{var}} in JSON
- Adding a language: create {lang}.json, register in src/i18n/index.ts, add to languages key
- Testing: global mock in setupTests.ts returns keys as values
- Error strings: store flags/codes in state, translate at render time
