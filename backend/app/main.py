from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.airports import router as airports_router
from app.api.routes.infrastructure import router as infrastructure_router

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

app.include_router(airports_router)
app.include_router(infrastructure_router)


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "service": "tarmacview"}
