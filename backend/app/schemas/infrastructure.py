from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ListMeta
from app.schemas.geometry import LineStringZ, PointZ, PolygonZ


# surfaces for airport
class SurfaceCreate(BaseModel):
    """surface create schema"""

    identifier: str
    surface_type: str
    geometry: LineStringZ
    boundary: PolygonZ | None = None
    buffer_distance: float = Field(default=5.0, ge=0)
    heading: float | None = None
    length: float | None = None
    width: float | None = None
    threshold_position: PointZ | None = None
    end_position: PointZ | None = None


class SurfaceUpdate(BaseModel):
    """surface update schema"""

    identifier: str | None = None
    geometry: LineStringZ | None = None
    boundary: PolygonZ | None = None
    buffer_distance: float | None = Field(default=None, ge=0)
    heading: float | None = None
    length: float | None = None
    width: float | None = None
    threshold_position: PointZ | None = None
    end_position: PointZ | None = None


class SurfaceResponse(BaseModel):
    """surface response schema"""

    id: UUID
    airport_id: UUID
    identifier: str
    surface_type: str
    geometry: LineStringZ
    boundary: PolygonZ | None = None
    buffer_distance: float = 5.0
    heading: float | None = None
    length: float | None = None
    width: float | None = None
    threshold_position: PointZ | None = None
    end_position: PointZ | None = None
    agls: list["AGLResponse"] = []

    model_config = {"from_attributes": True}


# obstacles for airport
class ObstacleCreate(BaseModel):
    """obstacle create schema"""

    name: str
    height: float
    boundary: PolygonZ
    buffer_distance: float = Field(default=5.0, ge=0)
    type: str


class ObstacleUpdate(BaseModel):
    """obstacle update schema"""

    name: str | None = None
    height: float | None = None
    boundary: PolygonZ | None = None
    buffer_distance: float | None = Field(default=None, ge=0)
    type: str | None = None


class ObstacleResponse(BaseModel):
    """obstacle response schema"""

    id: UUID
    airport_id: UUID
    name: str
    height: float
    boundary: PolygonZ
    buffer_distance: float
    type: str

    model_config = {"from_attributes": True}


# safety zones for airport
class SafetyZoneCreate(BaseModel):
    """safety zone create schema"""

    name: str
    type: str
    geometry: PolygonZ
    altitude_floor: float | None = None
    altitude_ceiling: float | None = None
    is_active: bool = True


class SafetyZoneUpdate(BaseModel):
    """safety zone update schema"""

    name: str | None = None
    type: str | None = None
    geometry: PolygonZ | None = None
    altitude_floor: float | None = None
    altitude_ceiling: float | None = None
    is_active: bool | None = None


class SafetyZoneResponse(BaseModel):
    """safety zone response schema"""

    id: UUID
    airport_id: UUID
    name: str
    type: str
    geometry: PolygonZ
    altitude_floor: float | None = None
    altitude_ceiling: float | None = None
    is_active: bool

    model_config = {"from_attributes": True}


# AGLs for airport surfaces
class LHACreate(BaseModel):
    """lha create schema"""

    unit_number: int
    setting_angle: float
    transition_sector_width: float | None = None
    lamp_type: str
    position: PointZ


class LHAUpdate(BaseModel):
    """lha update schema"""

    unit_number: int | None = None
    setting_angle: float | None = None
    transition_sector_width: float | None = None
    lamp_type: str | None = None
    position: PointZ | None = None


class LHAResponse(BaseModel):
    """lha response schema"""

    id: UUID
    agl_id: UUID
    unit_number: int
    setting_angle: float
    transition_sector_width: float | None = None
    lamp_type: str
    position: PointZ

    model_config = {"from_attributes": True}


class AGLCreate(BaseModel):
    """agl create schema"""

    agl_type: str
    name: str
    position: PointZ
    side: str | None = None
    glide_slope_angle: float | None = None
    distance_from_threshold: float | None = None
    offset_from_centerline: float | None = None


class AGLUpdate(BaseModel):
    """agl update schema"""

    agl_type: str | None = None
    name: str | None = None
    position: PointZ | None = None
    side: str | None = None
    glide_slope_angle: float | None = None
    distance_from_threshold: float | None = None
    offset_from_centerline: float | None = None


class AGLResponse(BaseModel):
    """agl response schema"""

    id: UUID
    surface_id: UUID
    agl_type: str
    name: str
    position: PointZ
    side: str | None = None
    glide_slope_angle: float | None = None
    distance_from_threshold: float | None = None
    offset_from_centerline: float | None = None
    lhas: list[LHAResponse] = []

    model_config = {"from_attributes": True}


# list responses
class SurfaceListResponse(BaseModel):
    """surface list response"""

    data: list[SurfaceResponse]
    meta: ListMeta


class ObstacleListResponse(BaseModel):
    """obstacle list response"""

    data: list[ObstacleResponse]
    meta: ListMeta


class SafetyZoneListResponse(BaseModel):
    """safety zone list response"""

    data: list[SafetyZoneResponse]
    meta: ListMeta


class AGLListResponse(BaseModel):
    """agl list response"""

    data: list[AGLResponse]
    meta: ListMeta


class LHAListResponse(BaseModel):
    """lha list response"""

    data: list[LHAResponse]
    meta: ListMeta
