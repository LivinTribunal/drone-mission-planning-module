from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_coordinator, require_operator
from app.models.user import User
from app.schemas.common import DeleteResponse, ListMeta
from app.schemas.inspection_template import (
    InspectionTemplateCreate,
    InspectionTemplateListResponse,
    InspectionTemplateResponse,
    InspectionTemplateUpdate,
)
from app.services import inspection_template_service

router = APIRouter(prefix="/api/v1/inspection-templates", tags=["inspection-templates"])


@router.get("", response_model=InspectionTemplateListResponse)
def list_templates(
    airport_id: UUID | None = Query(None),
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """list inspection templates, optionally filtered by airport"""
    templates = inspection_template_service.list_templates(db, airport_id=airport_id)

    return InspectionTemplateListResponse(data=templates, meta=ListMeta(total=len(templates)))


@router.get("/{template_id}", response_model=InspectionTemplateResponse)
def get_template(
    template_id: UUID, current_user: User = Depends(require_operator), db: Session = Depends(get_db)
):
    """get inspection template by id"""
    return inspection_template_service.get_template(db, template_id)


@router.post("", status_code=201, response_model=InspectionTemplateResponse)
def create_template(
    body: InspectionTemplateCreate,
    current_user: User = Depends(require_coordinator),
    db: Session = Depends(get_db),
):
    """create inspection template"""
    return inspection_template_service.create_template(db, body)


@router.put("/{template_id}", response_model=InspectionTemplateResponse)
def update_template(
    template_id: UUID,
    body: InspectionTemplateUpdate,
    current_user: User = Depends(require_coordinator),
    db: Session = Depends(get_db),
):
    """update inspection template"""
    return inspection_template_service.update_template(db, template_id, body)


@router.delete("/{template_id}", response_model=DeleteResponse)
def delete_template(
    template_id: UUID,
    current_user: User = Depends(require_coordinator),
    db: Session = Depends(get_db),
):
    """delete inspection template"""
    inspection_template_service.delete_template(db, template_id)

    return DeleteResponse(deleted=True)
