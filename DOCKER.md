# Docker — TarmacView

Three-container stack: **PostgreSQL 16 + PostGIS 3.4**, **FastAPI backend**, **React frontend (nginx)**.

---

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin) — Docker Compose v2 required
- A Cesium Ion token if you want 3D globe tiles (free at ion.cesium.com)

---

## Quick start

```bash
# 1. copy the env template
cp .env.docker.example .env.docker

# 2. edit at minimum: JWT_SECRET (and VITE_CESIUM_ION_TOKEN if needed)
nano .env.docker

# 3. bring everything up
docker compose up --build
```

The stack starts in dependency order:

1. `postgres` — waits until `pg_isready` passes
2. `backend` — runs `alembic upgrade head` then starts uvicorn; waits until `/api/v1/health` responds
3. `frontend` — nginx serves the pre-built React bundle; waits until backend is healthy

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Database | localhost:5432 |

---

## Environment file — `.env.docker`

Copy `.env.docker.example` to `.env.docker` and fill in the values:

```env
# database
POSTGRES_DB=tarmacview
POSTGRES_USER=tarmacview
POSTGRES_PASSWORD=tarmacview

# backend
DATABASE_URL=postgresql://tarmacview:tarmacview@postgres:5432/tarmacview
JWT_SECRET=change-me-in-production-minimum-256-bits
CORS_ORIGINS=["http://localhost"]

# frontend (build-time arg — requires a rebuild if changed)
VITE_CESIUM_ION_TOKEN=

# optional
OPENAIP_API_KEY=
```

> **`VITE_CESIUM_ION_TOKEN`** is a build-time `ARG` baked into the frontend image.
> Changing it after the image is built has no effect — run `docker compose build frontend` again.

> **`JWT_SECRET`** must be at least 256 bits of entropy for production. Never commit `.env.docker`.

---

## Common commands

```bash
# start in the background
docker compose up -d --build

# tail logs from all services
docker compose logs -f

# tail logs from one service
docker compose logs -f backend

# stop and remove containers (keeps the pgdata volume)
docker compose down

# stop, remove containers AND wipe the database volume
docker compose down -v

# rebuild one service without restarting others
docker compose build backend
docker compose up -d --no-deps backend

# open a psql shell
docker compose exec postgres psql -U tarmacview -d tarmacview

# run backend tests against the running db
docker compose exec backend pytest
```

---

## Rebuilding after code changes

| What changed | Command |
|---|---|
| Python code only | `docker compose restart backend` (no rebuild needed — code is `COPY`'d at build time, so you **do** need a rebuild) |
| Python deps (`requirements.txt`) | `docker compose build backend && docker compose up -d --no-deps backend` |
| Frontend code / translations | `docker compose build frontend && docker compose up -d --no-deps frontend` |
| Cesium token | same as frontend rebuild above |
| Database schema (new migration) | Handled automatically — backend runs `alembic upgrade head` on startup |

For iterative development prefer the local dev workflow (uvicorn + vite dev server) and use Docker only for the database:

```bash
# just the database
docker compose up -d postgres
```

---

## Data persistence

Database data lives in the named Docker volume `pgdata`. It survives `docker compose down` but is deleted by `docker compose down -v`.

To back up the database:

```bash
docker compose exec postgres pg_dump -U tarmacview tarmacview > backup.sql
```

To restore:

```bash
docker compose exec -T postgres psql -U tarmacview tarmacview < backup.sql
```

---

## Architecture

```
Browser → nginx :80 → /api/* → backend :8000 → postgres :5432
                    → /*     → static React bundle
```

The nginx config (`frontend/nginx.conf`) proxies `/api/` requests to the backend container and serves the React SPA for all other routes.

Both `Dockerfile`s use multi-stage builds to keep images lean:

- **backend** — deps stage (gcc, pip install) → runtime stage (libpq5 only)
- **frontend** — node:20-alpine build stage → nginx:alpine serve stage

---

## Troubleshooting

**Backend exits immediately**

Check `DATABASE_URL` in `.env.docker` — it must point to `postgres` (the service name), not `localhost`.

**`alembic upgrade head` fails on startup**

Usually means the DB wasn't ready yet. The `depends_on` healthcheck should prevent this, but you can retry: `docker compose restart backend`.

**Port already in use**

Another service is binding port 80, 8000, or 5432. Either stop the conflicting service or change the host-side port in `docker-compose.yml` (e.g. `"8080:80"`).

**3D globe tiles not loading**

`VITE_CESIUM_ION_TOKEN` is missing or empty. Set it in `.env.docker` and rebuild the frontend image.

**Frontend shows stale code**

The frontend image is built once — live-reload does not work in Docker. Run `docker compose build frontend` and restart the container.
