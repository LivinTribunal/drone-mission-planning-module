from uuid import UUID

from pydantic import BaseModel


class InspectionConfigCreate(BaseModel):
    altitude_offset: float | None = None
    speed_override: float | None = None
    measurement_density: int | None = None
    custom_tolerances: dict | None = None
    density: float | None = None


class InspectionConfigResponse(BaseModel):
    id: UUID
    altitude_offset: float | None = None
    speed_override: float | None = None
    measurement_density: int | None = None
    custom_tolerances: dict | None = None
    density: float | None = None

    model_config = {"from_attributes": True}


class InspectionTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    angular_tolerances: dict | None = None
    created_by: str | None = None
    default_config: InspectionConfigCreate | None = None
    target_agl_ids: list[UUID] = []
    methods: list[str] = []


class InspectionTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    angular_tolerances: dict | None = None
    target_agl_ids: list[UUID] | None = None
    methods: list[str] | None = None


class InspectionTemplateResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    angular_tolerances: dict | None = None
    created_by: str | None = None
    created_at: str | None = None
    default_config: InspectionConfigResponse | None = None
    target_agl_ids: list[UUID] = []
    methods: list[str] = []

    model_config = {"from_attributes": True}


class InspectionTemplateListResponse(BaseModel):
    data: list[InspectionTemplateResponse]
    meta: dict
