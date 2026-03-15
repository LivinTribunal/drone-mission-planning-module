from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ListMeta
from app.schemas.geometry import PointZ
from app.schemas.infrastructure import (
    ObstacleResponse,
    SafetyZoneResponse,
    SurfaceResponse,
)


class AirportCreate(BaseModel):
    """airport create schema"""

    icao_code: str = Field(min_length=4, max_length=4, pattern=r"^[A-Z]{4}$")
    name: str
    elevation: float
    location: PointZ


class AirportUpdate(BaseModel):
    """airport update schema"""

    name: str | None = None
    elevation: float | None = None
    location: PointZ | None = None


class AirportResponse(BaseModel):
    """airport response schema"""

    id: UUID
    icao_code: str
    name: str
    elevation: float
    location: PointZ

    model_config = {"from_attributes": True}


class AirportDetailResponse(AirportResponse):
    """airport detail response schema"""

    surfaces: list[SurfaceResponse] = []
    obstacles: list[ObstacleResponse] = []
    safety_zones: list[SafetyZoneResponse] = []


class AirportListResponse(BaseModel):
    """airport list response schema"""

    data: list[AirportResponse]
    meta: ListMeta
