from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.geometry import PointZ


class WaypointResponse(BaseModel):
    """waypoint in flight plan"""

    id: UUID
    flight_plan_id: UUID
    inspection_id: UUID | None = None
    sequence_order: int
    position: PointZ
    heading: float | None = None
    speed: float | None = None
    hover_duration: float | None = None
    camera_action: str | None = None
    waypoint_type: str
    camera_target: PointZ | None = None

    model_config = {"from_attributes": True}


class ValidationViolationResponse(BaseModel):
    """validation violation"""

    id: UUID
    is_warning: bool
    message: str
    constraint_id: UUID | None = None

    model_config = {"from_attributes": True}


class ValidationResultResponse(BaseModel):
    """validation result"""

    id: UUID
    passed: bool
    validated_at: datetime | None = None
    violations: list[ValidationViolationResponse] = []

    model_config = {"from_attributes": True}


class FlightPlanResponse(BaseModel):
    """flight plan response"""

    id: UUID
    mission_id: UUID
    airport_id: UUID
    total_distance: float | None = None
    estimated_duration: float | None = None
    is_validated: bool
    generated_at: datetime | None = None
    waypoints: list[WaypointResponse] = []
    validation_result: ValidationResultResponse | None = None

    model_config = {"from_attributes": True}


class GenerateTrajectoryResponse(BaseModel):
    """response from trajectory generation"""

    flight_plan: FlightPlanResponse
    warnings: list[str] = []
