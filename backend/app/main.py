import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes.admin import router as admin_router
from app.api.routes.airports import router as airports_router
from app.api.routes.auth import router as auth_router
from app.api.routes.camera_presets import router as camera_presets_router
from app.api.routes.drone_profiles import router as drone_profiles_router
from app.api.routes.drones import router as drones_router
from app.api.routes.flight_plans import router as flight_plans_router
from app.api.routes.inspection_templates import router as templates_router
from app.api.routes.missions import router as missions_router
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.exceptions import DomainError
from app.services import auth_service
from app.services.seeder import seed_users

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """seed default users on first run."""
    db = SessionLocal()
    try:
        seed_users(db)
    except Exception:
        logger.exception("failed to seed users")
    finally:
        db.close()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="TarmacView API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DomainError)
async def domain_error_handler(request, exc: DomainError):
    """translate domain exceptions to http responses."""
    if exc.extra:
        detail = {"message": exc.message, **exc.extra}
    else:
        detail = exc.message

    return JSONResponse(status_code=exc.status_code, content={"detail": detail})


app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(airports_router)
app.include_router(camera_presets_router)
app.include_router(drone_profiles_router)
app.include_router(drones_router)
app.include_router(flight_plans_router)
app.include_router(missions_router)
app.include_router(templates_router)

# static file serving for custom uploaded models
_static_dir = Path(__file__).resolve().parent.parent / "static"
_static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")


# maintenance mode cache - avoids a db query on every request
_maintenance_cache: dict[str, object] = {"value": False, "checked_at": 0.0}
_MAINTENANCE_TTL = 30


def _check_maintenance_sync() -> bool:
    """synchronous db check for maintenance mode."""
    db = None
    try:
        db = SessionLocal()
        from app.services.admin_service import is_maintenance_mode

        return is_maintenance_mode(db)
    except Exception:
        logger.warning("maintenance mode check failed, defaulting to off", exc_info=True)
        return False
    finally:
        if db:
            db.close()


async def _is_maintenance_on() -> bool:
    """check maintenance mode with 30s ttl cache."""
    if os.environ.get("MAINTENANCE_MODE", "").lower() == "true":
        return True

    now = time.monotonic()
    if now - _maintenance_cache["checked_at"] < _MAINTENANCE_TTL:  # type: ignore[operator]
        return bool(_maintenance_cache["value"])

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _check_maintenance_sync)

    _maintenance_cache["value"] = result
    _maintenance_cache["checked_at"] = now
    return result


@app.middleware("http")
async def maintenance_mode_middleware(request: Request, call_next):
    """return 503 for non-admin users when maintenance mode is on."""
    if not await _is_maintenance_on():
        return await call_next(request)

    # always let cors preflights through so browsers get proper headers
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if (
        path.startswith("/api/v1/auth")
        or path.startswith("/api/v1/admin")
        or path == "/api/v1/health"
        or path.startswith("/api/docs")
        or path.startswith("/api/openapi")
    ):
        return await call_next(request)

    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
    if token:
        try:
            payload = auth_service.decode_token(token)
            if payload.get("type") == "access" and payload.get("role") == "SUPER_ADMIN":
                return await call_next(request)
        except DomainError:
            pass

    return JSONResponse(
        status_code=503,
        content={"detail": "system is under maintenance"},
    )


@app.get("/api/v1/health")
def health():
    """health check endpoint."""
    return {"status": "ok", "service": "tarmacview"}
