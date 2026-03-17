# Naming Conventions

## Commits

Short, lowercase, casual. Max 50 characters. No conventional commit prefixes.

```
add airport crud endpoints
fix map marker click
add mission export to kml
update trajectory service
chore add comments
```

Reference the GitHub issue number when applicable:

```
database schema (#1)
airport crud endpoints (#2)
```

## Branches

Format: `<type>/<short-description>`

```
feat/db-models
feat/airport-api
fix/null-check
feat/frontend-shell
```

One issue per branch. Every branch merges into `main` via squash merge.

## Pull Requests

- Title: short, matches the branch style
- Description: 1-2 sentences, include risk tier checkbox (T1/T2/T3)
- Always link the related GitHub issue with `Closes #N`

## Code

### Python

- Files and functions: `snake_case` — `airport.py`, `create_mission()`
- Classes: `PascalCase` — `Airport`, `MissionConfiguration`
- Constants: `UPPER_SNAKE_CASE` — `MAX_ALTITUDE`
- Pydantic schemas: `{Entity}{Suffix}` — `AirportResponse`, `MissionCreate`, `WaypointUpdate`

### TypeScript

- Components: `PascalCase.tsx` — `MissionDashboard.tsx`, `MapViewer.tsx`
- Utilities: `camelCase.ts` — `formatDate.ts`, `useAuth.ts`
- Interfaces/types: `PascalCase`, no `I` prefix — `Mission`, `WaypointResponse`
- Constants: `UPPER_SNAKE_CASE`

### API Routes

RESTful paths under `/api/v1/`:

```
GET    /api/v1/missions
POST   /api/v1/missions
GET    /api/v1/missions/{id}
PUT    /api/v1/missions/{id}
DELETE /api/v1/missions/{id}
```
