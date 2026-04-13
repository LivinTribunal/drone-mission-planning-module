from pydantic import BaseModel

from app.schemas.geometry import LineStringZ, PointZ, PolygonZ
from app.schemas.infrastructure import ObstacleTypeStr, SafetyZoneTypeStr


class RunwaySuggestion(BaseModel):
    """runway suggestion derived from openaip data."""

    identifier: str
    heading: float
    length: float
    width: float
    threshold_position: PointZ
    end_position: PointZ
    geometry: LineStringZ
    boundary: PolygonZ


class ObstacleSuggestion(BaseModel):
    """obstacle suggestion derived from openaip data."""

    name: str
    type: ObstacleTypeStr
    height: float
    boundary: PolygonZ


class SafetyZoneSuggestion(BaseModel):
    """safety zone suggestion derived from openaip airspace data."""

    name: str
    type: SafetyZoneTypeStr
    geometry: PolygonZ
    altitude_floor: float | None = None
    altitude_ceiling: float | None = None


class AirportLookupResponse(BaseModel):
    """combined lookup response with airport + related infrastructure suggestions."""

    icao_code: str
    name: str
    city: str | None = None
    country: str | None = None
    elevation: float
    location: PointZ
    runways: list[RunwaySuggestion] = []
    obstacles: list[ObstacleSuggestion] = []
    safety_zones: list[SafetyZoneSuggestion] = []
