from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import ListMeta


class InspectionConfigCreate(BaseModel):
    """inspection config create schema"""

    altitude_offset: float | None = None
    speed_override: float | None = None
    measurement_density: int | None = None
    custom_tolerances: dict | None = None
    density: float | None = None
    hover_duration: float | None = None
    horizontal_distance: float | None = None
    sweep_angle: float | None = None


class InspectionConfigResponse(BaseModel):
    """inspection config response schema"""

    id: UUID
    altitude_offset: float | None = None
    speed_override: float | None = None
    measurement_density: int | None = None
    custom_tolerances: dict | None = None
    density: float | None = None
    hover_duration: float | None = None
    horizontal_distance: float | None = None
    sweep_angle: float | None = None

    model_config = {"from_attributes": True}


class InspectionTemplateCreate(BaseModel):
    """inspection template create schema"""

    name: str
    description: str | None = None
    angular_tolerances: dict | None = None
    created_by: str | None = None
    default_config: InspectionConfigCreate | None = None
    target_agl_ids: list[UUID] = []
    methods: list[str] = []


class InspectionTemplateUpdate(BaseModel):
    """inspection template update schema"""

    name: str | None = None
    description: str | None = None
    angular_tolerances: dict | None = None
    target_agl_ids: list[UUID] | None = None
    methods: list[str] | None = None


class InspectionTemplateResponse(BaseModel):
    """inspection template response schema"""

    id: UUID
    name: str
    description: str | None = None
    angular_tolerances: dict | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    default_config: InspectionConfigResponse | None = None
    target_agl_ids: list[UUID] = []
    methods: list[str] = []

    model_config = {"from_attributes": True}


class InspectionTemplateListResponse(BaseModel):
    """inspection template list response schema"""

    data: list[InspectionTemplateResponse]
    meta: ListMeta
