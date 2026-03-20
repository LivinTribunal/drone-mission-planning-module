from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.schemas.common import ListMeta
from app.schemas.geometry import PointZ


class InspectionConfigOverride(BaseModel):
    """config overrides for an inspection within a mission"""

    altitude_offset: float | None = None
    speed_override: float | None = None
    measurement_density: int | None = None
    custom_tolerances: dict | None = None
    density: float | None = None
    hover_duration: float | None = None
    horizontal_distance: float | None = None
    sweep_angle: float | None = None
    lha_ids: list[UUID] | None = None

    @field_validator("lha_ids", mode="before")
    @classmethod
    def coerce_lha_ids_to_strings(cls, v: list | None) -> list[UUID] | None:
        """coerce mixed uuid/string lists so downstream jsonb storage is consistent."""
        if v is None:
            return None
        return [UUID(str(i)) if not isinstance(i, UUID) else i for i in v]


class InspectionCreate(BaseModel):
    """add inspection to mission"""

    template_id: UUID
    method: str
    config: InspectionConfigOverride | None = None


class InspectionUpdate(BaseModel):
    """update inspection within mission"""

    method: str | None = None
    config: InspectionConfigOverride | None = None
    sequence_order: int | None = None


class InspectionConfigResponse(BaseModel):
    """inspection configuration values"""

    altitude_offset: float | None = None
    speed_override: float | None = None
    measurement_density: int | None = None
    custom_tolerances: dict | None = None
    density: float | None = None
    hover_duration: float | None = None
    horizontal_distance: float | None = None
    sweep_angle: float | None = None
    lha_ids: list[UUID] | None = None

    model_config = {"from_attributes": True}


class InspectionResponse(BaseModel):
    """inspection response"""

    id: UUID
    mission_id: UUID
    template_id: UUID
    config_id: UUID | None = None
    method: str
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
    default_altitude_offset: float | None = None
    takeoff_coordinate: PointZ | None = None
    landing_coordinate: PointZ | None = None


class MissionUpdate(BaseModel):
    """update mission"""

    name: str | None = None
    drone_profile_id: UUID | None = None
    operator_notes: str | None = None
    default_speed: float | None = None
    default_altitude_offset: float | None = None
    takeoff_coordinate: PointZ | None = None
    landing_coordinate: PointZ | None = None
    date_time: datetime | None = None


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
    default_altitude_offset: float | None = None
    takeoff_coordinate: PointZ | None = None
    landing_coordinate: PointZ | None = None

    model_config = {"from_attributes": True}


class MissionDetailResponse(MissionResponse):
    """mission with inspections"""

    inspections: list[InspectionResponse] = []


class MissionListResponse(BaseModel):
    """mission list response"""

    data: list[MissionResponse]
    meta: ListMeta
