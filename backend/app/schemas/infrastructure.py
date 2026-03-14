from uuid import UUID

from pydantic import BaseModel

from app.schemas.geometry import LineStringZ, PointZ, PolygonZ

# surfaces


class SurfaceCreate(BaseModel):
    identifier: str
    surface_type: str
    geometry: LineStringZ
    heading: float | None = None
    length: float | None = None
    width: float | None = None
    threshold_position: PointZ | None = None
    end_position: PointZ | None = None
    taxiway_width: float | None = None


class SurfaceUpdate(BaseModel):
    identifier: str | None = None
    geometry: LineStringZ | None = None
    heading: float | None = None
    length: float | None = None
    width: float | None = None
    threshold_position: PointZ | None = None
    end_position: PointZ | None = None
    taxiway_width: float | None = None


class SurfaceResponse(BaseModel):
    id: UUID
    airport_id: UUID
    identifier: str
    surface_type: str
    geometry: LineStringZ
    heading: float | None = None
    length: float | None = None
    width: float | None = None
    threshold_position: PointZ | None = None
    end_position: PointZ | None = None
    taxiway_width: float | None = None
    agls: list["AGLResponse"] = []

    model_config = {"from_attributes": True}


# obstacles


class ObstacleCreate(BaseModel):
    name: str
    position: PointZ
    height: float
    radius: float
    geometry: PolygonZ
    type: str


class ObstacleUpdate(BaseModel):
    name: str | None = None
    position: PointZ | None = None
    height: float | None = None
    radius: float | None = None
    geometry: PolygonZ | None = None
    type: str | None = None


class ObstacleResponse(BaseModel):
    id: UUID
    airport_id: UUID
    name: str
    position: PointZ
    height: float
    radius: float
    geometry: PolygonZ
    type: str

    model_config = {"from_attributes": True}


# safety zones


class SafetyZoneCreate(BaseModel):
    name: str
    type: str
    geometry: PolygonZ
    altitude_floor: float | None = None
    altitude_ceiling: float | None = None
    is_active: bool = True


class SafetyZoneUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    geometry: PolygonZ | None = None
    altitude_floor: float | None = None
    altitude_ceiling: float | None = None
    is_active: bool | None = None


class SafetyZoneResponse(BaseModel):
    id: UUID
    airport_id: UUID
    name: str
    type: str
    geometry: PolygonZ
    altitude_floor: float | None = None
    altitude_ceiling: float | None = None
    is_active: bool

    model_config = {"from_attributes": True}


# AGL


class LHACreate(BaseModel):
    unit_number: int
    setting_angle: float
    transition_sector_width: float | None = None
    lamp_type: str
    position: PointZ


class LHAUpdate(BaseModel):
    unit_number: int | None = None
    setting_angle: float | None = None
    transition_sector_width: float | None = None
    lamp_type: str | None = None
    position: PointZ | None = None


class LHAResponse(BaseModel):
    id: UUID
    agl_id: UUID
    unit_number: int
    setting_angle: float
    transition_sector_width: float | None = None
    lamp_type: str
    position: PointZ

    model_config = {"from_attributes": True}


class AGLCreate(BaseModel):
    agl_type: str
    name: str
    position: PointZ
    side: str | None = None
    glide_slope_angle: float | None = None
    distance_from_threshold: float | None = None
    offset_from_centerline: float | None = None


class AGLUpdate(BaseModel):
    agl_type: str | None = None
    name: str | None = None
    position: PointZ | None = None
    side: str | None = None
    glide_slope_angle: float | None = None
    distance_from_threshold: float | None = None
    offset_from_centerline: float | None = None


class AGLResponse(BaseModel):
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
