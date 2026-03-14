# Architecture

TarmacView is a full-stack drone mission planning system for airport lighting inspection, built as a React + FastAPI application deployed on AWS.

## Project Structure

```
drone-mission-planning-module/
├── frontend/              # React 18 + TypeScript + Vite SPA
├── backend/               # Python 3.12 + FastAPI REST API
├── docs/                  # Architecture docs, wireframes, diagrams
├── .github/               # Issue/PR templates, CI workflows
├── docker-compose.yml     # Local PostGIS database
└── harness.config.json    # Risk tier configuration
```

### Frontend (`frontend/`)

Single-page React application serving two user roles via nested routes:
- `/` — Login page
- `/operator-center/*` — Mission planning, trajectory editing, flight plan export
- `/coordinator-center/*` — Airport configuration, obstacle/safety zone management

Entry point: `src/main.tsx` → `src/App.tsx` (React Router v6 `<BrowserRouter>`).

Key tooling: Vite dev server proxies `/api` requests to `http://localhost:8000`, TailwindCSS for styling, MapLibre GL JS for 2D mapping, path alias `@/*` → `./src/*`.

### Backend (`backend/`)

FastAPI REST API structured into four layers under `app/`:

```
backend/app/
├── main.py               # FastAPI app, CORS, health endpoint
├── api/routes/            # HTTP route handlers
├── models/                # SQLAlchemy + GeoAlchemy2 ORM models
├── schemas/               # Pydantic v2 request/response DTOs
├── services/              # Business logic (trajectory, safety, export)
└── core/                  # Config, database session, auth, dependencies
```

Entry points:
- **Local dev**: `uvicorn app.main:app --reload` (port 8000)
- **AWS Lambda**: `lambda_handler.py` wraps the FastAPI app with Mangum

### Database

PostgreSQL 16 + PostGIS 3.4 for spatial data. Local instance via `docker-compose.yml` (`postgis/postgis:16-3.4`). Production on Amazon RDS. Migrations managed by Alembic (`backend/migrations/`).

## Architectural Pattern

TarmacView follows a **layered monolith** pattern with a strict unidirectional dependency flow: routes → services → models. The frontend is a separate SPA communicating exclusively via REST.

This pattern suits the project because:
- **Thesis scope**: a single deployable backend keeps infrastructure simple while maintaining clean separation of concerns.
- **Spatial domain complexity**: the business logic layer (services) isolates PostGIS-specific trajectory computation and safety validation from HTTP handling.
- **Serverless deployment**: Mangum wraps the entire FastAPI app as a single Lambda function — a monolith that deploys as a microservice.

Key design principles:
- **Routes are thin**: HTTP parsing, auth, and response formatting only — no business logic in route functions.
- **Services own the logic**: trajectory generation, safety validation, and export formatting live in dedicated service modules.
- **Pydantic boundaries**: SQLAlchemy models never leak to the API surface; Pydantic schemas define all request/response contracts.
- **Dependency injection**: database sessions flow through `Depends(get_db)` — no global state.

## Component Diagram

```mermaid
graph TD
    Browser["Browser (React SPA)"]
    Vite["Vite Dev Proxy /api → :8000"]
    APIGW["AWS API Gateway"]
    Lambda["AWS Lambda (Mangum)"]
    FastAPI["FastAPI App"]
    Routes["api/routes/"]
    Services["services/"]
    Models["models/"]
    Schemas["schemas/"]
    DB["PostgreSQL 16 + PostGIS 3.4"]
    MapLibre["MapLibre GL JS"]
    Cesium["CesiumJS (3D viewer)"]
    ESRI["ESRI Satellite Tiles"]

    Browser --> Vite
    Browser --> APIGW
    Vite --> FastAPI
    APIGW --> Lambda --> FastAPI
    FastAPI --> Routes
    Routes --> Schemas
    Routes --> Services
    Services --> Models
    Models --> DB
    Browser --> MapLibre
    Browser --> Cesium
    MapLibre --> ESRI
```

## Directory Organization

### Backend Layers

| Directory | Role | Depends On |
|---|---|---|
| `api/routes/` | HTTP handlers, request validation, auth | schemas, services |
| `schemas/` | Pydantic DTOs (request/response contracts) | — (pure data) |
| `services/` | Business logic, trajectory computation | models |
| `models/` | SQLAlchemy ORM, GeoAlchemy2 spatial columns | — (database mapping) |
| `core/` | Cross-cutting: config, database session, auth | — (infrastructure) |

Dependency rule: **routes → services → models**. Schemas are shared across routes and services but never import from either.

### Frontend Organization

| Directory | Role |
|---|---|
| `src/pages/operator-center/` | Operator mission planning views |
| `src/pages/coordinator-center/` | Coordinator airport config views |
| `src/components/` | Shared UI components |
| `src/types/` | TypeScript interfaces mirroring backend schemas |
| `src/api/` | Axios client with JWT interceptor |

## Data Flow

### Typical API Request

```
1. Browser sends POST /api/v1/missions
2. Vite proxy (dev) or API Gateway (prod) forwards to FastAPI
3. FastAPI router deserializes request body via Pydantic schema (MissionCreate)
4. Router calls service function (e.g., mission_manager.create_mission())
5. Service executes business logic, writes to database via SQLAlchemy
6. Service returns domain object
7. Router serializes response via Pydantic schema (MissionResponse)
8. JSON response sent to browser
```

### Mission Planning Flow

```
1. Coordinator configures airport: runways, PAPI systems, obstacles, safety zones
2. Operator creates mission → status: DRAFT
3. Operator selects AGL systems and LHAs for inspection
4. System generates trajectory (waypoints) → status: PLANNED
5. Operator reviews 3D flight plan in CesiumJS viewer
6. Operator validates → status: VALIDATED
7. Export to KML/KMZ/JSON/MAVLink → status: EXPORTED
8. After flight → status: COMPLETED
```

### Map Rendering Flow

```
1. MapLibre GL JS loads ESRI satellite basemap tiles
2. GeoJSON overlays render runways, taxiways, obstacles, safety zones
3. Leaflet.draw enables coordinate editing for airport geometry
4. CesiumJS renders 3D flight plan with waypoint markers and trajectory lines
```

## External Dependencies

| Dependency | Purpose | Abstraction |
|---|---|---|
| PostgreSQL + PostGIS | Spatial database | SQLAlchemy + GeoAlchemy2 ORM |
| ESRI Satellite Tiles | Basemap imagery | MapLibre GL JS tile source |
| AWS Lambda | Serverless compute | Mangum adapter wrapping FastAPI |
| AWS API Gateway | HTTP routing | Transparent to application code |
| AWS Amplify | Frontend hosting | Static build deployment |
| Amazon RDS | Managed PostgreSQL | Same connection string as local |

All external services are abstracted behind application-level interfaces. The database is accessed exclusively through SQLAlchemy sessions injected via `Depends(get_db)`. AWS Lambda integration is a single 5-line adapter (`lambda_handler.py`):

```python
from mangum import Mangum
from app.main import app

handler = Mangum(app, lifespan="off")
```

## Configuration

Application settings are managed through Pydantic's `BaseSettings` class in `app/core/config.py`, loading from environment variables:

```python
class Settings(BaseSettings):
    database_url: str = "postgresql://tarmacview:tarmacview@localhost:5432/tarmacview"
    jwt_secret: str = "change-me-in-production"
    jwt_expiration_minutes: int = 30
    jwt_refresh_expiration_days: int = 7
```

Environment-specific values (database URL, JWT secret) are injected at deploy time — never hardcoded for production.

## Architecture Decision Records

### ADR-001: FastAPI + Mangum for Serverless Deployment

**Status**: Accepted

**Context**: The backend needs to run both locally during development and on AWS Lambda in production without maintaining two separate entry points.

**Decision**: Use FastAPI as the web framework with Mangum as a Lambda adapter. A single `lambda_handler.py` wraps the same FastAPI app used in local development.

**Rationale**: Mangum transparently translates API Gateway events to ASGI requests. Development uses standard Uvicorn, production uses Lambda — same application code, zero branching.

**Consequences**: Cold starts on Lambda are higher than a minimal handler, but acceptable for this use case. The entire app loads on every cold start.

### ADR-002: PostGIS for Spatial Data

**Status**: Accepted

**Context**: The domain requires 3D coordinate storage (WGS84 + altitude), spatial queries (point-in-polygon for safety zones), and distance calculations for trajectory planning.

**Decision**: Use PostgreSQL with PostGIS extension, accessed through GeoAlchemy2's `Geometry("POINTZ", srid=4326)` column type.

**Rationale**: PostGIS provides native spatial indexing and functions (ST_Contains, ST_Distance, ST_3DDistance) that would be complex and slow to implement in application code.

**Consequences**: Requires PostGIS-enabled PostgreSQL in all environments. Local development uses the `postgis/postgis:16-3.4` Docker image. Production uses Amazon RDS with PostGIS extension enabled.

### Template for Future ADRs

```markdown
### ADR-NNN: [Title]

**Status**: Proposed | Accepted | Deprecated | Superseded by ADR-XXX

**Context**: What is the issue that we're seeing that is motivating this decision?

**Decision**: What is the change that we're proposing and/or doing?

**Rationale**: Why is this the best choice given the constraints?

**Consequences**: What trade-offs does this decision introduce?
```
