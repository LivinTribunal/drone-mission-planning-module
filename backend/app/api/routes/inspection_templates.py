from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies import CoordinatorUser, OperatorUser
from app.core.dependencies import get_db
from app.core.enums import AuditAction
from app.schemas.common import DeleteResponse, ListMeta
from app.schemas.inspection_template import (
    BulkCreateTemplatesRequest,
    BulkCreateTemplatesResponse,
    InspectionTemplateCreate,
    InspectionTemplateListResponse,
    InspectionTemplateResponse,
    InspectionTemplateUpdate,
)
from app.services import inspection_template_service
from app.utils.audit import log_audit

router = APIRouter(prefix="/api/v1/inspection-templates", tags=["inspection-templates"])


@router.get("", response_model=InspectionTemplateListResponse)
def list_templates(
    current_user: OperatorUser,
    airport_id: UUID | None = Query(None),
    db: Session = Depends(get_db),
):
    """list inspection templates, optionally filtered by airport"""
    templates = inspection_template_service.list_templates(db, airport_id=airport_id)

    return InspectionTemplateListResponse(data=templates, meta=ListMeta(total=len(templates)))


@router.post("/bulk", status_code=201, response_model=BulkCreateTemplatesResponse)
def bulk_create_templates(
    body: BulkCreateTemplatesRequest,
    current_user: CoordinatorUser,
    db: Session = Depends(get_db),
):
    """bulk create templates for all valid agl x method combinations"""
    created, skipped = inspection_template_service.bulk_create_templates(db, body.airport_id)

    return BulkCreateTemplatesResponse(created=created, skipped=skipped)


@router.get("/{template_id}", response_model=InspectionTemplateResponse)
def get_template(template_id: UUID, current_user: OperatorUser, db: Session = Depends(get_db)):
    """get inspection template by id"""
    return inspection_template_service.get_template(db, template_id)


@router.post("", status_code=201, response_model=InspectionTemplateResponse)
def create_template(
    body: InspectionTemplateCreate,
    request: Request,
    current_user: CoordinatorUser,
    db: Session = Depends(get_db),
):
    """create inspection template"""
    template = inspection_template_service.create_template(db, body)
    log_audit(
        db,
        current_user,
        AuditAction.CREATE,
        entity_type="InspectionTemplate",
        entity_id=template.id,
        entity_name=template.name,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return template


@router.put("/{template_id}", response_model=InspectionTemplateResponse)
def update_template(
    template_id: UUID,
    body: InspectionTemplateUpdate,
    request: Request,
    current_user: CoordinatorUser,
    db: Session = Depends(get_db),
):
    """update inspection template"""
    template = inspection_template_service.update_template(db, template_id, body)
    log_audit(
        db,
        current_user,
        AuditAction.UPDATE,
        entity_type="InspectionTemplate",
        entity_id=template_id,
        entity_name=template.name,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return template


@router.delete("/{template_id}", response_model=DeleteResponse)
def delete_template(
    template_id: UUID,
    request: Request,
    current_user: CoordinatorUser,
    db: Session = Depends(get_db),
):
    """delete inspection template"""
    template = inspection_template_service.get_template(db, template_id)
    log_audit(
        db,
        current_user,
        AuditAction.DELETE,
        entity_type="InspectionTemplate",
        entity_id=template_id,
        entity_name=template.name,
        ip_address=request.client.host if request.client else None,
    )
    inspection_template_service.delete_template(db, template_id)

    return DeleteResponse(deleted=True)
