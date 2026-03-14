from uuid import UUID

from pydantic import BaseModel


class DroneProfileCreate(BaseModel):
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


class DroneProfileUpdate(BaseModel):
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


class DroneProfileResponse(BaseModel):
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

    model_config = {"from_attributes": True}


class DroneProfileListResponse(BaseModel):
    data: list[DroneProfileResponse]
    meta: dict
