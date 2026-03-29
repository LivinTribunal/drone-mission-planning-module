import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.schemas.common import ListMeta

SAFE_IDENTIFIER_RE = re.compile(r"^[a-zA-Z0-9_\-]+(\.[a-zA-Z0-9]+)?$")


def _validate_model_identifier(v: str | None) -> str | None:
    """reject unsafe model identifier values."""
    if v is not None and not SAFE_IDENTIFIER_RE.match(v):
        raise ValueError("model_identifier must only contain alphanumeric, underscore, dash, dot")
    return v


class DroneProfileCreate(BaseModel):
    """drone profile create schema."""

    name: str
    manufacturer: str | None = None
    model: str | None = None
    max_speed: float | None = None
    max_climb_rate: float | None = None
    max_altitude: float | None = None
    battery_capacity: float | None = None
    endurance_minutes: float | None = None
    camera_resolution: str | None = None
    camera_frame_rate: int | None = None
    sensor_fov: float | None = None
    weight: float | None = None
    model_identifier: str | None = None

    @field_validator("model_identifier")
    @classmethod
    def check_model_identifier(cls, v: str | None) -> str | None:
        """validate model_identifier format."""
        return _validate_model_identifier(v)


class DroneProfileUpdate(BaseModel):
    """drone profile update schema."""

    name: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    max_speed: float | None = None
    max_climb_rate: float | None = None
    max_altitude: float | None = None
    battery_capacity: float | None = None
    endurance_minutes: float | None = None
    camera_resolution: str | None = None
    camera_frame_rate: int | None = None
    sensor_fov: float | None = None
    weight: float | None = None
    model_identifier: str | None = None

    @field_validator("model_identifier")
    @classmethod
    def check_model_identifier(cls, v: str | None) -> str | None:
        """validate model_identifier format."""
        return _validate_model_identifier(v)


class DroneProfileResponse(BaseModel):
    """drone profile response schema."""

    id: UUID
    name: str
    manufacturer: str | None = None
    model: str | None = None
    max_speed: float | None = None
    max_climb_rate: float | None = None
    max_altitude: float | None = None
    battery_capacity: float | None = None
    endurance_minutes: float | None = None
    camera_resolution: str | None = None
    camera_frame_rate: int | None = None
    sensor_fov: float | None = None
    weight: float | None = None
    model_identifier: str | None = None
    created_at: datetime
    updated_at: datetime
    mission_count: int = 0

    model_config = {"from_attributes": True}


class DroneProfileListResponse(BaseModel):
    """drone profile list response schema"""

    data: list[DroneProfileResponse]
    meta: ListMeta
