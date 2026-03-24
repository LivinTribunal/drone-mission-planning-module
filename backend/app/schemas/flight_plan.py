from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, computed_field

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
    gimbal_pitch: float | None = None

    model_config = {"from_attributes": True}


# keyword-to-kind mapping for structured violation classification
_VIOLATION_KIND_RULES: list[tuple[str, list[str], list[str]]] = [
    ("speed_framerate", ["framerate"], []),
    ("speed_framerate", ["frame rate"], []),
    ("altitude", ["altitude"], []),
    ("speed", ["speed"], ["framerate", "frame rate"]),
    ("geofence", ["geofence"], []),
    ("battery", ["battery"], []),
    ("runway_buffer", ["runway"], []),
    ("obstacle", ["obstacle"], []),
    ("camera_obstruction", ["obstructed"], []),
    ("safety_zone", ["zone"], []),
]


def _classify_violation(message: str) -> str | None:
    """derive violation kind from message content."""
    msg = message.lower()
    for kind, keywords, excludes in _VIOLATION_KIND_RULES:
        if any(kw in msg for kw in excludes):
            continue
        if all(kw in msg for kw in keywords):
            return kind
    return None


class ValidationViolationResponse(BaseModel):
    """validation violation"""

    id: UUID
    is_warning: bool
    message: str
    constraint_id: UUID | None = None

    @computed_field
    @property
    def violation_kind(self) -> str | None:
        """structured violation type derived from message content."""
        return _classify_violation(self.message)

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


class WaypointPositionUpdate(BaseModel):
    """single waypoint position update in a batch."""

    waypoint_id: UUID
    position: PointZ
    camera_target: PointZ | None = None


class WaypointBatchUpdateRequest(BaseModel):
    """batch update request for waypoint positions."""

    updates: list[WaypointPositionUpdate]


class GenerateTrajectoryResponse(BaseModel):
    """response from trajectory generation"""

    flight_plan: FlightPlanResponse
