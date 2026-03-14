# Coding Conventions

This document is the authoritative reference for coding standards in TarmacView.

## Naming Conventions

### Files

- **Backend**: `snake_case.py` — e.g., `airport.py`, `mission_manager.py`, `flight_plan.py`
- **Frontend components**: `PascalCase.tsx` — e.g., `MissionDashboard.tsx`, `MapViewer.tsx`
- **Frontend types**: `snake_case` or `kebab-case` in `src/types/` — e.g., `mission.ts`, `airport.ts`
- **Config files**: lowercase with dots — `pyproject.toml`, `vite.config.ts`, `tsconfig.json`

### Python

- Variables and functions: `snake_case`
- Classes: `PascalCase` — `Airport`, `MissionConfiguration`, `FlightPlan`
- Constants: `UPPER_SNAKE_CASE`
- Enums: `PascalCase` class, `UPPER_SNAKE_CASE` values — `MissionStatus.DRAFT`

### TypeScript

- Variables and functions: `camelCase`
- Components: `PascalCase` (matching filename)
- Interfaces/types: `PascalCase`, no `I` prefix — `Mission`, `WaypointResponse`
- Constants: `UPPER_SNAKE_CASE`

### Backend Schemas

Pydantic schemas follow the pattern `{Entity}{Suffix}`:
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
GET    /api/v1/airports/{id}/runways
```

## Import Organization

### Python

Imports are ordered by convention and enforced by Ruff's `I` rule set:

```python
# 1. Standard library
from uuid import uuid4
from typing import Optional

# 2. Third-party
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

# 3. Local application
from app.core.database import get_db
from app.models.mission import Mission
from app.schemas.mission import MissionResponse
```

### TypeScript

```typescript
// 1. React / framework
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 2. Third-party libraries
import axios from 'axios';
import maplibregl from 'maplibre-gl';

// 3. Local imports (using @ alias)
import { Mission } from '@/types/mission';
import { apiClient } from '@/api/client';
```

## Error Handling

### Backend

- **HTTP errors**: Raise `HTTPException` with appropriate status codes in route handlers.
- **Service errors**: Raise domain-specific exceptions that routes catch and translate to HTTP responses.
- **Validation errors**: Pydantic handles request validation automatically — FastAPI returns 422 with field-level details.
- **Database errors**: Let SQLAlchemy exceptions propagate; handle specific cases (unique constraint violations, not found) in services.

### Frontend

- **API errors**: Axios interceptor handles 401 (redirect to login) and network errors globally.
- **Component errors**: Use try/catch in async handlers, display user-friendly messages via toast/alert.
- **Never swallow errors silently** — at minimum log to console in development.

## Comments and Documentation

- Comments are **sparse and casual**. Only comment complex logic:
  ```python
  # check if waypoint is inside any safety zone
  ```
- No docstrings on simple CRUD routes, schemas, or obvious functions.
- Service methods with complex logic (trajectory generation, safety validation) get a brief docstring.
- Never write `@author` tags or generation markers.
- Occasional `# TODO: clean this up` is fine for natural code feel.

## Testing Conventions

### Backend

- **Framework**: pytest + httpx (async API tests) + testcontainers (PostGIS integration)
- **Location**: `backend/tests/` — mirrors `app/` structure
- **Naming**: `test_{module}.py` — e.g., `test_airport.py`, `test_mission_manager.py`
- **Config**: `pyproject.toml` sets `testpaths = ["tests"]`, `asyncio_mode = "auto"`

Every service needs unit tests. Every route needs integration tests with httpx `AsyncClient`.

### Frontend

- **Framework**: Vitest + React Testing Library
- **Location**: co-located or in `__tests__/` directories
- **Naming**: `{Component}.test.tsx` or `{module}.test.ts`
- **Command**: `npm test` (runs Vitest)

### What Must Be Tested

- All service methods (unit tests with mocked database)
- All API routes (integration tests with real PostGIS via testcontainers)
- Complex UI interactions (component tests with Testing Library)
- Trajectory generation and safety validation (these are T3 — thorough coverage required)

## Git Workflow

### Branch Naming

No strict prefix convention — keep it short and descriptive:
```
airport-crud
fix-map-marker
waypoint-editing
mission-export
```

### Commit Messages

Short, lowercase, casual. Max 50 characters. No conventional commit prefixes.

```
airport crud endpoints
fix map marker click
waypoint editing
add mission export to kml
update trajectory service
```

Never write: `feat(backend): implement AirportRouter with full CRUD operations`

### Git Identity

All commits must use:
```
git config user.name "Štefan Moravík"
git config user.email "stevko.moravik@gmail.com"
```

### PR Descriptions

1–2 sentences max. Brief and casual. Include risk tier checkbox (T1/T2/T3) from the PR template.

## Code Review Standards

### Risk Tiers

Defined in `harness.config.json`:

| Tier | File Patterns | Required Checks |
|---|---|---|
| **T1** (low) | `docs/**`, `*.md` | Basic CI pass |
| **T2** (medium) | `frontend/src/**`, `backend/app/**`, `backend/tests/**` | Full test suite, linter, code review |
| **T3** (high) | `**/trajectory*`, `**/safety_validator*`, `**/flight_plan*`, `**/migrations/versions/*` | All T2 checks + manual review sign-off |

### Protected Files

These files are protected and require manual review:
- `.github/workflows/**`
- `harness.config.json`
- `backend/requirements.txt`

### Human Reviewer Focus

- T3 files always require human sign-off — trajectory correctness, safety validation logic, migration safety
- Domain correctness: does the code match airport lighting inspection requirements?
- Spatial logic: are coordinate systems (WGS84/SRID 4326) used correctly?
- Security: JWT handling, SQL injection prevention, input validation

## Linting and Formatting

### Python

Ruff is configured in `pyproject.toml`:
```toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I"]
```

Rules: pycodestyle errors (E), pyflakes (F), import sorting (I).

### TypeScript / Frontend

ESLint configured via `package.json` script: `npm run lint`.
