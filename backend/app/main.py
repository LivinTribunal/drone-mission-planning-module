import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes.airports import router as airports_router
from app.api.routes.auth import router as auth_router
from app.api.routes.drone_profiles import router as drone_profiles_router
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
app.include_router(airports_router)
app.include_router(drone_profiles_router)
app.include_router(flight_plans_router)
app.include_router(missions_router)
app.include_router(templates_router)

# static file serving for custom uploaded models
_static_dir = Path(__file__).resolve().parent.parent / "static"
_static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")


# maintenance mode middleware - env var placeholder until system settings table exists
@app.middleware("http")
async def maintenance_mode_middleware(request: Request, call_next):
    """return 503 for non-admin users when maintenance mode is on.

    note: this middleware parses JWT tokens directly via auth_service.decode_token
    rather than through the FastAPI dependency system (get_current_user), because
    middleware runs before route-level dependency injection. keep this in sync with
    the token format used by auth_service.create_access_token.
    """
    if os.environ.get("MAINTENANCE_MODE", "").lower() == "true":
        # allow auth endpoints and health check through
        path = request.url.path
        if not (
            path.startswith("/api/v1/auth")
            or path == "/api/v1/health"
            or path.startswith("/api/docs")
            or path.startswith("/api/openapi")
        ):
            auth_header = request.headers.get("authorization", "")
            token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
            if token:
                try:
                    payload = auth_service.decode_token(token)
                    if payload.get("role") == "SUPER_ADMIN":
                        return await call_next(request)
                except DomainError:
                    pass
            return JSONResponse(
                status_code=503,
                content={"detail": "system is under maintenance"},
            )
    return await call_next(request)


@app.get("/api/v1/health")
def health():
    """health check endpoint."""
    return {"status": "ok", "service": "tarmacview"}
