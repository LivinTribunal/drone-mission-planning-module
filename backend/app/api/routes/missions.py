import io
import zipfile
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.dependencies import check_airport_access, get_db, require_operator
from app.models.user import User
from app.schemas.common import DeleteResponse, ListMeta
from app.schemas.export import ExportRequest
from app.schemas.mission import (
    InspectionCreate,
    InspectionResponse,
    InspectionUpdate,
    MissionCreate,
    MissionDetailResponse,
    MissionListResponse,
    MissionResponse,
    MissionUpdate,
    ReorderRequest,
    ReorderResponse,
)
from app.services import export_service, flight_brief_service, inspection_service, mission_service

router = APIRouter(prefix="/api/v1/missions", tags=["missions"])


def _check_mission_access(db: Session, current_user: User, mission_id: UUID):
    """fetch mission and verify user has airport access, return mission."""
    mission = mission_service.get_mission(db, mission_id)
    check_airport_access(current_user, mission.airport_id)
    return mission


# missions
@router.get("", response_model=MissionListResponse)
def list_missions(
    airport_id: UUID | None = Query(None),
    status: str | None = Query(None),
    drone_profile_id: UUID | None = Query(None),
    limit: int = Query(20, le=200),
    offset: int = Query(0),
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """list missions with filters and pagination."""
    airport_ids = None
    if current_user.role != "SUPER_ADMIN":
        airport_ids = [a.id for a in current_user.airports]

    missions, total = mission_service.list_missions(
        db,
        airport_id=airport_id,
        status=status,
        drone_profile_id=drone_profile_id,
        limit=limit,
        offset=offset,
        airport_ids=airport_ids,
    )

    data = []
    for m in missions:
        resp = MissionResponse.model_validate(m)
        resp.inspection_count = len(m.inspections) if m.inspections else 0
        resp.estimated_duration = m.flight_plan.estimated_duration if m.flight_plan else None
        data.append(resp)

    return MissionListResponse(data=data, meta=ListMeta(total=total, limit=limit, offset=offset))


@router.get("/{mission_id}", response_model=MissionDetailResponse)
def get_mission(
    mission_id: UUID,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """get mission with inspections"""
    mission = _check_mission_access(db, current_user, mission_id)
    return mission


@router.post("", status_code=201, response_model=MissionResponse)
def create_mission(
    body: MissionCreate,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """create mission in DRAFT status"""
    check_airport_access(current_user, body.airport_id)
    return mission_service.create_mission(db, body)


@router.put("/{mission_id}", response_model=MissionResponse)
def update_mission(
    mission_id: UUID,
    body: MissionUpdate,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """update mission"""
    _check_mission_access(db, current_user, mission_id)
    return mission_service.update_mission(db, mission_id, body)


@router.delete("/{mission_id}", response_model=DeleteResponse)
def delete_mission(
    mission_id: UUID,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """delete mission"""
    _check_mission_access(db, current_user, mission_id)
    mission_service.delete_mission(db, mission_id)

    return DeleteResponse(deleted=True)


@router.post("/{mission_id}/duplicate", status_code=201, response_model=MissionResponse)
def duplicate_mission(
    mission_id: UUID,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """duplicate mission as new DRAFT"""
    _check_mission_access(db, current_user, mission_id)
    return mission_service.duplicate_mission(db, mission_id)


# status transitions
@router.post("/{mission_id}/validate", response_model=MissionResponse)
def validate_mission(
    mission_id: UUID,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """PLANNED -> VALIDATED"""
    _check_mission_access(db, current_user, mission_id)
    return mission_service.transition_mission(db, mission_id, "VALIDATED")


@router.post("/{mission_id}/export")
def export_mission(
    mission_id: UUID,
    body: ExportRequest,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """generate export files and transition VALIDATED -> EXPORTED."""
    _check_mission_access(db, current_user, mission_id)
    files, safe_name = export_service.export_mission(db, mission_id, body.formats)

    # single file - return directly
    if len(files) == 1:
        filename, (data, content_type) = next(iter(files.items()))
        sanitized = filename.replace('"', "").replace("\r", "").replace("\n", "")
        return Response(
            content=data,
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{sanitized}"'},
        )

    # multiple files - zip them
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for filename, (data, _) in files.items():
            zf.writestr(filename, data)

    zip_name = safe_name.replace('"', "").replace("\r", "").replace("\n", "")
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name} export.zip"'},
    )


@router.get("/{mission_id}/flight-brief", response_class=Response)
def get_flight_brief(
    mission_id: UUID,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """generate and download flight brief pdf for atc coordination."""
    _check_mission_access(db, current_user, mission_id)
    pdf_bytes, filename = flight_brief_service.generate_flight_brief(db, mission_id)
    sanitized = filename.replace('"', "").replace("\r", "").replace("\n", "")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{sanitized}"'},
    )


@router.post("/{mission_id}/complete", response_model=MissionResponse)
def complete_mission(
    mission_id: UUID,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """EXPORTED -> COMPLETED"""
    _check_mission_access(db, current_user, mission_id)
    return mission_service.transition_mission(db, mission_id, "COMPLETED")


@router.post("/{mission_id}/cancel", response_model=MissionResponse)
def cancel_mission(
    mission_id: UUID,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """EXPORTED -> CANCELLED"""
    _check_mission_access(db, current_user, mission_id)
    return mission_service.transition_mission(db, mission_id, "CANCELLED")


# inspections
@router.post("/{mission_id}/inspections", status_code=201, response_model=InspectionResponse)
def add_inspection(
    mission_id: UUID,
    body: InspectionCreate,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """add inspection to mission"""
    _check_mission_access(db, current_user, mission_id)
    return inspection_service.add_inspection(db, mission_id, body)


# reorder must be before {inspection_id} routes so "reorder" isn't parsed as a uuid
@router.put("/{mission_id}/inspections/reorder", response_model=ReorderResponse)
def reorder_inspections(
    mission_id: UUID,
    body: ReorderRequest,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """reorder inspections by sequence"""
    _check_mission_access(db, current_user, mission_id)
    inspection_service.reorder_inspections(db, mission_id, body.inspection_ids)

    return ReorderResponse(reordered=True)


@router.put("/{mission_id}/inspections/{inspection_id}", response_model=InspectionResponse)
def update_inspection(
    mission_id: UUID,
    inspection_id: UUID,
    body: InspectionUpdate,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """update inspection"""
    _check_mission_access(db, current_user, mission_id)
    return inspection_service.update_inspection(db, mission_id, inspection_id, body)


@router.delete("/{mission_id}/inspections/{inspection_id}", response_model=DeleteResponse)
def delete_inspection(
    mission_id: UUID,
    inspection_id: UUID,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """delete inspection"""
    _check_mission_access(db, current_user, mission_id)
    inspection_service.delete_inspection(db, mission_id, inspection_id)

    return DeleteResponse(deleted=True)
