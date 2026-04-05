from uuid import UUID

from pydantic import BaseModel, Field, computed_field

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
    city: str | None = None
    country: str | None = None
    elevation: float
    location: PointZ


class AirportUpdate(BaseModel):
    """airport update schema"""

    name: str | None = None
    city: str | None = None
    country: str | None = None
    elevation: float | None = None
    location: PointZ | None = None


class AirportResponse(BaseModel):
    """airport response schema"""

    id: UUID
    icao_code: str
    name: str
    city: str | None = None
    country: str | None = None
    elevation: float
    location: PointZ
    default_drone_profile_id: UUID | None = None
    terrain_source: str = "FLAT"  # FLAT | DEM_UPLOAD | DEM_API
    dem_file_path: str | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def has_dem(self) -> bool:
        """whether the airport has a DEM file configured."""
        return self.dem_file_path is not None

    model_config = {"from_attributes": True}


class SetDefaultDroneRequest(BaseModel):
    """request to set or clear the default drone for an airport."""

    drone_profile_id: UUID | None = None


class BulkChangeDroneRequest(BaseModel):
    """request to bulk-change drone profile on missions."""

    drone_profile_id: UUID
    from_drone_id: UUID | None = None
    scope: str = "ALL_DRAFT"
    mission_ids: list[UUID] = []


class BulkChangeDroneResponse(BaseModel):
    """response for bulk drone change operation."""

    updated_count: int
    regressed_count: int = 0
    mission_ids: list[UUID]


class AirportDetailResponse(AirportResponse):
    """airport detail response schema"""

    surfaces: list[SurfaceResponse] = []
    obstacles: list[ObstacleResponse] = []
    safety_zones: list[SafetyZoneResponse] = []


class AirportSummaryResponse(AirportResponse):
    """airport with infrastructure counts for the selection table."""

    surfaces_count: int = 0
    agls_count: int = 0
    missions_count: int = 0


class AirportListResponse(BaseModel):
    """airport list response schema"""

    data: list[AirportResponse]
    meta: ListMeta


class AirportSummaryListResponse(BaseModel):
    """airport summary list response schema."""

    data: list[AirportSummaryResponse]
    meta: ListMeta


class TerrainCoverage(BaseModel):
    """terrain DEM coverage info."""

    bounds: list[float]
    resolution: list[float]


class TerrainUploadResponse(BaseModel):
    """response after uploading a DEM file."""

    terrain_source: str
    coverage: TerrainCoverage


class TerrainDownloadResponse(BaseModel):
    """response after downloading elevation data from API."""

    terrain_source: str
    points_downloaded: int
    coverage: TerrainCoverage
