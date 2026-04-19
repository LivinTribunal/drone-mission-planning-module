from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ListMeta
from app.schemas.geometry import PointZ

# computation status values - mirrors ComputationStatus enum
ComputationStatusStr = Literal["IDLE", "COMPUTING", "COMPLETED", "FAILED"]

# flight plan scope values - mirrors FlightPlanScope enum
FlightPlanScopeStr = Literal["FULL", "NO_TAKEOFF_LANDING", "MEASUREMENTS_ONLY"]

# inspection method values - mirrors InspectionMethod enum
InspectionMethodStr = Literal[
    "VERTICAL_PROFILE",
    "PAPI_HORIZONTAL_RANGE",
    "FLY_OVER",
    "PARALLEL_SIDE_SWEEP",
    "HOVER_POINT_LOCK",
]
# capture mode values - used by trajectory_computation to choose camera_action
CaptureModeStr = Literal["VIDEO_CAPTURE", "PHOTO_CAPTURE"]
# hover bearing reference frames - RUNWAY = 0 is approach side, COMPASS = absolute
HoverBearingRefStr = Literal["RUNWAY", "COMPASS"]

# minimum transit altitude (m AGL) - mirrors trajectory_types.MINIMUM_AGL_ALTITUDE.
# duplicated here so schemas do not import from services (architectural boundary).
_MIN_TRANSIT_ALTITUDE_AGL = 5.0


def _validate_transit_altitude(value: float | None) -> float | None:
    """enforce transit altitude minimum without importing from services."""
    if value is None:
        return None
    if value < _MIN_TRANSIT_ALTITUDE_AGL:
        raise ValueError(f"transit_agl must be at least {_MIN_TRANSIT_ALTITUDE_AGL:.0f}m AGL")
    return value


class InspectionConfigOverride(BaseModel):
    """config overrides for an inspection within a mission"""

    altitude_offset: float | None = None
    measurement_speed_override: float | None = Field(default=None, gt=0)
    measurement_density: int | None = Field(default=None, ge=1)
    custom_tolerances: dict[str, float] | None = None
    hover_duration: float | None = None
    horizontal_distance: float | None = Field(default=None, gt=0)
    sweep_angle: float | None = None
    vertical_profile_height: float | None = Field(default=None, gt=0)
    lha_ids: list[UUID] | None = None
    capture_mode: CaptureModeStr | None = None
    recording_setup_duration: float | None = None
    buffer_distance: float | None = Field(default=None, ge=0)
    # new method-specific config fields
    height_above_lights: float | None = Field(default=None, gt=0)
    lateral_offset: float | None = Field(default=None, gt=0)
    distance_from_lha: float | None = Field(default=None, gt=0)
    height_above_lha: float | None = Field(default=None, gt=0)
    camera_gimbal_angle: float | None = None
    selected_lha_id: UUID | None = None
    hover_bearing: float | None = None
    hover_bearing_reference: HoverBearingRefStr | None = None

    @field_validator("lha_ids", mode="before")
    @classmethod
    def validate_lha_ids(cls, v: list | None) -> list[UUID] | None:
        """coerce mixed uuid/string lists so downstream jsonb storage is consistent."""
        if v is None:
            return None
        return [UUID(str(i)) if not isinstance(i, UUID) else i for i in v]


class InspectionCreate(BaseModel):
    """add inspection to mission"""

    template_id: UUID
    method: InspectionMethodStr
    config: InspectionConfigOverride | None = None


class InspectionUpdate(BaseModel):
    """update inspection within mission"""

    method: InspectionMethodStr | None = None
    config: InspectionConfigOverride | None = None
    sequence_order: int | None = None


class InspectionConfigResponse(BaseModel):
    """inspection configuration values"""

    altitude_offset: float | None = None
    measurement_speed_override: float | None = None
    measurement_density: int | None = None
    custom_tolerances: dict[str, float] | None = None
    hover_duration: float | None = None
    horizontal_distance: float | None = None
    sweep_angle: float | None = None
    vertical_profile_height: float | None = None
    lha_ids: list[UUID] | None = None
    capture_mode: CaptureModeStr | None = None
    recording_setup_duration: float | None = None
    buffer_distance: float | None = None
    height_above_lights: float | None = None
    lateral_offset: float | None = None
    distance_from_lha: float | None = None
    height_above_lha: float | None = None
    camera_gimbal_angle: float | None = None
    selected_lha_id: UUID | None = None
    hover_bearing: float | None = None
    hover_bearing_reference: HoverBearingRefStr | None = None

    model_config = {"from_attributes": True}


class InspectionResponse(BaseModel):
    """inspection response"""

    id: UUID
    mission_id: UUID
    template_id: UUID
    config_id: UUID | None = None
    method: InspectionMethodStr
    sequence_order: int
    lha_ids: list[UUID] | None = None
    config: InspectionConfigResponse | None = None

    model_config = {"from_attributes": True}


class ReorderRequest(BaseModel):
    """reorder inspections by sequence"""

    inspection_ids: list[UUID]


class ReorderResponse(BaseModel):
    """reorder response"""

    reordered: bool


class MissionCreate(BaseModel):
    """create mission"""

    name: str
    airport_id: UUID
    drone_profile_id: UUID | None = None
    operator_notes: str | None = None
    default_speed: float | None = None
    measurement_speed_override: float | None = Field(default=None, gt=0)
    default_altitude_offset: float | None = None
    takeoff_coordinate: PointZ | None = None
    landing_coordinate: PointZ | None = None
    default_capture_mode: CaptureModeStr | None = None
    default_buffer_distance: float | None = Field(default=None, ge=0)
    transit_agl: float | None = None
    require_perpendicular_runway_crossing: bool = True
    flight_plan_scope: FlightPlanScopeStr = "FULL"

    @field_validator("transit_agl")
    @classmethod
    def _check_transit_altitude(cls, v: float | None) -> float | None:
        """enforce minimum AGL floor on mission-level cruise altitude."""
        return _validate_transit_altitude(v)


class MissionUpdate(BaseModel):
    """update mission"""

    name: str | None = None
    drone_profile_id: UUID | None = None
    operator_notes: str | None = None
    default_speed: float | None = None
    measurement_speed_override: float | None = Field(default=None, gt=0)
    default_altitude_offset: float | None = None
    takeoff_coordinate: PointZ | None = None
    landing_coordinate: PointZ | None = None
    date_time: datetime | None = None
    default_capture_mode: CaptureModeStr | None = None
    default_buffer_distance: float | None = Field(default=None, ge=0)
    transit_agl: float | None = None
    require_perpendicular_runway_crossing: bool | None = None
    flight_plan_scope: FlightPlanScopeStr | None = None

    @field_validator("transit_agl")
    @classmethod
    def _check_transit_altitude(cls, v: float | None) -> float | None:
        """enforce minimum AGL floor on mission-level cruise altitude."""
        return _validate_transit_altitude(v)


class MissionResponse(BaseModel):
    """mission response"""

    id: UUID
    name: str
    status: str
    airport_id: UUID
    created_at: datetime
    updated_at: datetime
    operator_notes: str | None = None
    drone_profile_id: UUID | None = None
    date_time: datetime | None = None
    default_speed: float | None = None
    measurement_speed_override: float | None = None
    default_altitude_offset: float | None = None
    takeoff_coordinate: PointZ | None = None
    landing_coordinate: PointZ | None = None
    default_capture_mode: CaptureModeStr | None = None
    default_buffer_distance: float | None = None
    transit_agl: float | None = None
    require_perpendicular_runway_crossing: bool = True
    flight_plan_scope: FlightPlanScopeStr = "FULL"
    has_unsaved_map_changes: bool = False
    computation_status: ComputationStatusStr = "IDLE"
    computation_error: str | None = None
    computation_started_at: datetime | None = None
    inspection_count: int = 0
    estimated_duration: float | None = None

    model_config = {"from_attributes": True}


class MissionDetailResponse(MissionResponse):
    """mission with inspections"""

    inspections: list[InspectionResponse] = []


class ComputationStatusResponse(BaseModel):
    """lightweight computation status for polling."""

    computation_status: ComputationStatusStr
    computation_error: str | None = None
    computation_started_at: datetime | None = None

    model_config = {"from_attributes": True}


class MissionListResponse(BaseModel):
    """mission list response"""

    data: list[MissionResponse]
    meta: ListMeta
