import re
from datetime import datetime
from typing import Literal
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
    ("safety_zone", ["safety zone"], []),
    ("measurement_density", ["density"], []),
]


def _classify_violation(message: str) -> str | None:
    """derive violation kind from message content."""
    # rules are ordered specific-to-general - excludes skip a generic rule so
    # a more specific one (listed earlier) can match instead, e.g. "speed" is
    # skipped when "framerate" is present so the speed_framerate rule wins
    msg = message.lower()
    for kind, keywords, excludes in _VIOLATION_KIND_RULES:
        if any(kw in msg for kw in excludes):
            continue
        if all(kw in msg for kw in keywords):
            return kind
    return None


# violation kind to human-readable constraint name
_CONSTRAINT_NAME_MAP: dict[str, str] = {
    "altitude": "Altitude",
    "speed": "Speed",
    "speed_framerate": "Speed / Framerate",
    "geofence": "Geofence",
    "battery": "Battery",
    "runway_buffer": "Runway Buffer",
    "obstacle": "Obstacle Clearance",
    "camera_obstruction": "Camera View",
    "safety_zone": "Safety Zone",
    "measurement_density": "Measurement Density",
}

# regex to extract waypoint references like "wp 3", "wp 1-5", "(wp 2, 4)"
_WP_REF_RE = re.compile(r"\bwp\s+([\d,\s\-]+)", re.IGNORECASE)


def _extract_waypoint_ref(message: str) -> str | None:
    """extract waypoint reference string from a violation message."""
    m = _WP_REF_RE.search(message)
    return m.group(1).strip() if m else None


class ValidationViolationResponse(BaseModel):
    """validation violation"""

    id: UUID
    category: Literal["violation", "warning", "suggestion"]
    message: str
    constraint_id: UUID | None = None
    waypoint_ids: list[str] = []

    @computed_field
    @property
    def is_warning(self) -> bool:
        """backwards-compat computed property."""
        return self.category != "violation"

    @computed_field
    @property
    def violation_kind(self) -> str | None:
        """structured violation type derived from message content."""
        return _classify_violation(self.message)

    @computed_field
    @property
    def severity(self) -> str:
        """return category as severity - they are now equivalent."""
        return self.category

    @computed_field
    @property
    def constraint_name(self) -> str | None:
        """human-readable constraint name derived from violation kind."""
        kind = self.violation_kind
        return _CONSTRAINT_NAME_MAP.get(kind) if kind else None

    @computed_field
    @property
    def waypoint_ref(self) -> str | None:
        """waypoint reference extracted from message text."""
        return _extract_waypoint_ref(self.message)

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


class TransitWaypointInsertRequest(BaseModel):
    """insert a new transit waypoint after a given sequence position."""

    position: PointZ
    after_sequence: int


class GenerateTrajectoryResponse(BaseModel):
    """response from trajectory generation"""

    flight_plan: FlightPlanResponse
