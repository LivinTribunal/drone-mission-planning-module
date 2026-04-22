from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ListMeta
from app.schemas.drone_profile import DroneProfileResponse


class DroneCreate(BaseModel):
    """fleet drone create schema - airport is inferred from the route."""

    drone_profile_id: UUID
    name: str = Field(max_length=100)
    serial_number: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class DroneUpdate(BaseModel):
    """fleet drone update schema - all fields optional."""

    drone_profile_id: UUID | None = None
    name: str | None = Field(default=None, max_length=100)
    serial_number: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class DroneResponse(BaseModel):
    """fleet drone response including embedded profile specs."""

    id: UUID
    airport_id: UUID
    drone_profile_id: UUID
    name: str
    serial_number: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    drone_profile: DroneProfileResponse | None = None
    mission_count: int = 0

    model_config = {"from_attributes": True}


class DroneListResponse(BaseModel):
    """drone list response"""

    data: list[DroneResponse]
    meta: ListMeta
