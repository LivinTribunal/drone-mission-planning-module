from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.airports import router as airports_router
from app.api.routes.drone_profiles import router as drone_profiles_router
from app.api.routes.flight_plans import router as flight_plans_router
from app.api.routes.inspection_templates import router as templates_router
from app.api.routes.missions import router as missions_router
from app.core.exceptions import DomainError

app = FastAPI(
    title="TarmacView API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


app.include_router(airports_router)
app.include_router(drone_profiles_router)
app.include_router(flight_plans_router)
app.include_router(missions_router)
app.include_router(templates_router)


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "service": "tarmacview"}
