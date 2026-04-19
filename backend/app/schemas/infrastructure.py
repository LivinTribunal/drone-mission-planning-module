from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ListMeta
from app.schemas.geometry import LineStringZ, PointZ, PolygonZ

# enum-bounded string aliases - mirror the db check constraints so invalid
# values fail with a clean 422 instead of a 500 IntegrityError at commit
SurfaceTypeStr = Literal["RUNWAY", "TAXIWAY"]
ObstacleTypeStr = Literal["BUILDING", "TOWER", "ANTENNA", "VEGETATION", "OTHER"]
SafetyZoneTypeStr = Literal[
    "CTR", "RESTRICTED", "PROHIBITED", "TEMPORARY_NO_FLY", "AIRPORT_BOUNDARY"
]
LampTypeStr = Literal["HALOGEN", "LED"]
PAPISideStr = Literal["LEFT", "RIGHT"]
AglTypeStr = Literal["PAPI", "RUNWAY_EDGE_LIGHTS"]


# surfaces for airport
class SurfaceCreate(BaseModel):
    """surface create schema"""

    identifier: str
    surface_type: SurfaceTypeStr
    geometry: LineStringZ
    boundary: PolygonZ | None = None
    buffer_distance: float = Field(default=5.0, ge=0)  # 0 = use raw boundary, no expansion
    heading: float | None = Field(default=None, ge=0, lt=360)
    length: float | None = None
    width: float | None = None
    threshold_position: PointZ | None = None
    end_position: PointZ | None = None
    touchpoint_latitude: float | None = Field(default=None, ge=-90, le=90)
    touchpoint_longitude: float | None = Field(default=None, ge=-180, le=180)
    touchpoint_altitude: float | None = None

    @model_validator(mode="after")
    def _validate_touchpoint_completeness(self) -> "SurfaceCreate":
        """touchpoint fields are all-or-nothing to avoid partial state."""
        fields = (self.touchpoint_latitude, self.touchpoint_longitude, self.touchpoint_altitude)
        provided = sum(1 for f in fields if f is not None)
        if 0 < provided < 3:
            raise ValueError("touchpoint requires all three coordinates or none")
        return self


class SurfaceUpdate(BaseModel):
    """surface update schema"""

    identifier: str | None = None
    geometry: LineStringZ | None = None
    boundary: PolygonZ | None = None
    buffer_distance: float | None = Field(default=None, ge=0)
    heading: float | None = Field(default=None, ge=0, lt=360)
    length: float | None = None
    width: float | None = None
    threshold_position: PointZ | None = None
    end_position: PointZ | None = None
    touchpoint_latitude: float | None = Field(default=None, ge=-90, le=90)
    touchpoint_longitude: float | None = Field(default=None, ge=-180, le=180)
    touchpoint_altitude: float | None = None

    @model_validator(mode="after")
    def _validate_touchpoint_completeness(self) -> "SurfaceUpdate":
        """touchpoint fields are all-or-nothing to avoid partial state."""
        # check model_fields_set to catch explicit nulls - apply_schema_update
        # uses exclude_unset, so an unsent field is safe but a partial payload
        # with explicit nulls would otherwise slip through
        tp_fields = {"touchpoint_latitude", "touchpoint_longitude", "touchpoint_altitude"}
        set_tp = tp_fields & self.model_fields_set
        if 0 < len(set_tp) < 3:
            raise ValueError("touchpoint requires all three coordinates or none")
        return self


class SurfaceResponse(BaseModel):
    """surface response schema"""

    id: UUID
    airport_id: UUID
    identifier: str
    surface_type: SurfaceTypeStr
    geometry: LineStringZ
    boundary: PolygonZ | None = None
    buffer_distance: float = 5.0
    heading: float | None = None
    length: float | None = None
    width: float | None = None
    threshold_position: PointZ | None = None
    end_position: PointZ | None = None
    touchpoint_latitude: float | None = None
    touchpoint_longitude: float | None = None
    touchpoint_altitude: float | None = None
    agls: list["AGLResponse"] = []

    model_config = {"from_attributes": True}


# obstacles for airport
class ObstacleCreate(BaseModel):
    """obstacle create schema"""

    name: str
    height: float
    boundary: PolygonZ
    buffer_distance: float = Field(default=5.0, ge=0)  # 0 = use raw boundary, no expansion
    type: ObstacleTypeStr


class ObstacleUpdate(BaseModel):
    """obstacle update schema"""

    name: str | None = None
    height: float | None = None
    boundary: PolygonZ | None = None
    buffer_distance: float | None = Field(default=None, ge=0)
    type: ObstacleTypeStr | None = None
    # transport-only flag - skip ground-altitude renormalization on this update
    preserve_altitude: bool = False


class ObstacleResponse(BaseModel):
    """obstacle response schema"""

    id: UUID
    airport_id: UUID
    name: str
    height: float
    boundary: PolygonZ
    buffer_distance: float
    type: ObstacleTypeStr

    model_config = {"from_attributes": True}


# safety zones for airport
class SafetyZoneCreate(BaseModel):
    """safety zone create schema"""

    name: str
    type: SafetyZoneTypeStr
    geometry: PolygonZ
    altitude_floor: float | None = None
    altitude_ceiling: float | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def _validate_altitude_range(self) -> "SafetyZoneCreate":
        """reject inverted altitude envelopes and boundary zones with altitude bounds."""
        if self.type == "AIRPORT_BOUNDARY" and (
            self.altitude_floor is not None or self.altitude_ceiling is not None
        ):
            raise ValueError(
                "altitude_floor and altitude_ceiling are not allowed for AIRPORT_BOUNDARY zones"
            )
        if (
            self.altitude_floor is not None
            and self.altitude_ceiling is not None
            and self.altitude_floor > self.altitude_ceiling
        ):
            raise ValueError("altitude_floor must be <= altitude_ceiling")
        return self


class SafetyZoneUpdate(BaseModel):
    """safety zone update schema"""

    name: str | None = None
    type: SafetyZoneTypeStr | None = None
    geometry: PolygonZ | None = None
    altitude_floor: float | None = None
    altitude_ceiling: float | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def _validate_altitude_range(self) -> "SafetyZoneUpdate":
        """reject inverted altitude envelopes and boundary zones with altitude bounds."""
        # partial patches (no type field) skip the boundary check here;
        # the service layer re-checks against the persisted zone type.
        if self.type == "AIRPORT_BOUNDARY" and (
            self.altitude_floor is not None or self.altitude_ceiling is not None
        ):
            raise ValueError(
                "altitude_floor and altitude_ceiling are not allowed for AIRPORT_BOUNDARY zones"
            )
        if (
            self.altitude_floor is not None
            and self.altitude_ceiling is not None
            and self.altitude_floor > self.altitude_ceiling
        ):
            raise ValueError("altitude_floor must be <= altitude_ceiling")
        return self


class SafetyZoneResponse(BaseModel):
    """safety zone response schema"""

    id: UUID
    airport_id: UUID
    name: str
    type: SafetyZoneTypeStr
    geometry: PolygonZ
    altitude_floor: float | None = None
    altitude_ceiling: float | None = None
    is_active: bool

    model_config = {"from_attributes": True}


# AGLs for airport surfaces


class LHACreate(BaseModel):
    """lha create schema"""

    unit_designator: str = Field(min_length=1, max_length=4)
    setting_angle: float | None = None
    transition_sector_width: float | None = None
    lamp_type: LampTypeStr
    position: PointZ
    tolerance: float | None = None


class LHAUpdate(BaseModel):
    """lha update schema"""

    unit_designator: str | None = Field(default=None, min_length=1, max_length=4)
    setting_angle: float | None = None
    transition_sector_width: float | None = None
    lamp_type: LampTypeStr | None = None
    position: PointZ | None = None
    tolerance: float | None = None
    # transport-only flag - skip ground-altitude renormalization on this update
    preserve_altitude: bool = False


class LHAResponse(BaseModel):
    """lha response schema"""

    id: UUID
    agl_id: UUID
    unit_designator: str
    setting_angle: float | None = None
    transition_sector_width: float | None = None
    lamp_type: LampTypeStr
    position: PointZ
    tolerance: float | None = None

    model_config = {"from_attributes": True}


class AGLCreate(BaseModel):
    """agl create schema"""

    agl_type: AglTypeStr
    name: str
    position: PointZ
    side: PAPISideStr | None = None
    glide_slope_angle: float | None = None
    distance_from_threshold: float | None = None
    offset_from_centerline: float | None = None


class AGLUpdate(BaseModel):
    """agl update schema"""

    agl_type: AglTypeStr | None = None
    name: str | None = None
    position: PointZ | None = None
    side: PAPISideStr | None = None
    glide_slope_angle: float | None = None
    distance_from_threshold: float | None = None
    offset_from_centerline: float | None = None
    # transport-only flag - skip ground-altitude renormalization on this update
    preserve_altitude: bool = False


class AGLResponse(BaseModel):
    """agl response schema"""

    id: UUID
    surface_id: UUID
    agl_type: AglTypeStr
    name: str
    position: PointZ
    side: PAPISideStr | None = None
    glide_slope_angle: float | None = None
    distance_from_threshold: float | None = None
    offset_from_centerline: float | None = None
    lhas: list[LHAResponse] = []

    model_config = {"from_attributes": True}


# bulk LHA generation
class LHABulkGenerateRequest(BaseModel):
    """bulk LHA generation request - linearly interpolate between two points."""

    first_position: PointZ
    last_position: PointZ
    spacing_m: float = Field(gt=0, le=1000)
    setting_angle: float | None = None
    tolerance: float | None = 0.2
    lamp_type: LampTypeStr = "HALOGEN"

    @model_validator(mode="after")
    def _validate_positions_differ(self) -> "LHABulkGenerateRequest":
        """first and last positions must not be identical - zero-length interpolation is invalid."""
        if self.first_position.coordinates == self.last_position.coordinates:
            raise ValueError("first and last positions must differ")
        return self


class LHABulkGenerateResponse(BaseModel):
    """bulk LHA generation response."""

    generated: list[LHAResponse]


# recalculate dimensions responses
class SurfaceDimensions(BaseModel):
    """surface dimensions snapshot"""

    length: float | None = None
    width: float | None = None
    heading: float | None = None


class SurfaceRecalculateResponse(BaseModel):
    """response for surface recalculate dimensions endpoint"""

    current: SurfaceDimensions
    recalculated: SurfaceDimensions


class ObstacleDimensions(BaseModel):
    """obstacle dimensions snapshot"""

    length: float | None = None
    width: float | None = None
    heading: float | None = None
    radius: float | None = None


class ObstacleRecalculateResponse(BaseModel):
    """response for obstacle recalculate dimensions endpoint"""

    current: ObstacleDimensions
    recalculated: ObstacleDimensions


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
