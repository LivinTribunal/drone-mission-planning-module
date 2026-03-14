from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.schemas.inspection_template import (
    InspectionTemplateCreate,
    InspectionTemplateListResponse,
    InspectionTemplateResponse,
    InspectionTemplateUpdate,
)
from app.services import template_service

router = APIRouter(prefix="/api/v1/inspection-templates", tags=["inspection-templates"])


@router.get("", response_model=InspectionTemplateListResponse)
def list_templates(
    airport_id: UUID | None = Query(None),
    db: Session = Depends(get_db),
):
    """list inspection templates, optionally filtered by airport"""
    templates = template_service.list_templates(db, airport_id=airport_id)
    return {"data": templates, "meta": {"total": len(templates)}}


@router.get("/{template_id}", response_model=InspectionTemplateResponse)
def get_template(template_id: UUID, db: Session = Depends(get_db)):
    """get inspection template by id"""
    return template_service.get_template(db, template_id)


@router.post("", status_code=201, response_model=InspectionTemplateResponse)
def create_template(body: InspectionTemplateCreate, db: Session = Depends(get_db)):
    """create inspection template"""
    return template_service.create_template(db, body.model_dump())


@router.put("/{template_id}", response_model=InspectionTemplateResponse)
def update_template(
    template_id: UUID, body: InspectionTemplateUpdate, db: Session = Depends(get_db)
):
    """update inspection template"""
    data = body.model_dump(exclude_unset=True)
    return template_service.update_template(db, template_id, data)


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: UUID, db: Session = Depends(get_db)):
    """delete inspection template"""
    template_service.delete_template(db, template_id)
