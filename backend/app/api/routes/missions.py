import io
import zipfile
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
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


# missions
@router.get("", response_model=MissionListResponse)
def list_missions(
    airport_id: UUID | None = Query(None),
    status: str | None = Query(None),
    drone_profile_id: UUID | None = Query(None),
    limit: int = Query(20, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    """list missions with filters and pagination."""
    missions, total = mission_service.list_missions(
        db,
        airport_id=airport_id,
        status=status,
        drone_profile_id=drone_profile_id,
        limit=limit,
        offset=offset,
    )

    data = []
    for m in missions:
        resp = MissionResponse.model_validate(m)
        resp.inspection_count = len(m.inspections) if m.inspections else 0
        resp.estimated_duration = m.flight_plan.estimated_duration if m.flight_plan else None
        data.append(resp)

    return MissionListResponse(data=data, meta=ListMeta(total=total, limit=limit, offset=offset))


@router.get("/{mission_id}", response_model=MissionDetailResponse)
def get_mission(mission_id: UUID, db: Session = Depends(get_db)):
    """get mission with inspections"""
    return mission_service.get_mission(db, mission_id)


@router.post("", status_code=201, response_model=MissionResponse)
def create_mission(body: MissionCreate, db: Session = Depends(get_db)):
    """create mission in DRAFT status"""
    return mission_service.create_mission(db, body)


@router.put("/{mission_id}", response_model=MissionResponse)
def update_mission(mission_id: UUID, body: MissionUpdate, db: Session = Depends(get_db)):
    """update mission"""
    return mission_service.update_mission(db, mission_id, body)


@router.delete("/{mission_id}", response_model=DeleteResponse)
def delete_mission(mission_id: UUID, db: Session = Depends(get_db)):
    """delete mission"""
    mission_service.delete_mission(db, mission_id)

    return DeleteResponse(deleted=True)


@router.post("/{mission_id}/duplicate", status_code=201, response_model=MissionResponse)
def duplicate_mission(mission_id: UUID, db: Session = Depends(get_db)):
    """duplicate mission as new DRAFT"""
    return mission_service.duplicate_mission(db, mission_id)


# status transitions
@router.post("/{mission_id}/validate", response_model=MissionResponse)
def validate_mission(mission_id: UUID, db: Session = Depends(get_db)):
    """PLANNED -> VALIDATED"""
    return mission_service.transition_mission(db, mission_id, "VALIDATED")


@router.post("/{mission_id}/export")
def export_mission(mission_id: UUID, body: ExportRequest, db: Session = Depends(get_db)):
    """generate export files and transition VALIDATED -> EXPORTED."""
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

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name} export.zip"'},
    )


@router.get("/{mission_id}/flight-brief", response_class=Response)
def get_flight_brief(mission_id: UUID, db: Session = Depends(get_db)):
    """generate and download flight brief pdf for atc coordination."""
    pdf_bytes, filename = flight_brief_service.generate_flight_brief(db, mission_id)
    sanitized = filename.replace('"', "").replace("\r", "").replace("\n", "")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{sanitized}"'},
    )


@router.post("/{mission_id}/complete", response_model=MissionResponse)
def complete_mission(mission_id: UUID, db: Session = Depends(get_db)):
    """EXPORTED -> COMPLETED"""
    return mission_service.transition_mission(db, mission_id, "COMPLETED")


@router.post("/{mission_id}/cancel", response_model=MissionResponse)
def cancel_mission(mission_id: UUID, db: Session = Depends(get_db)):
    """EXPORTED -> CANCELLED"""
    return mission_service.transition_mission(db, mission_id, "CANCELLED")


# inspections
@router.post("/{mission_id}/inspections", status_code=201, response_model=InspectionResponse)
def add_inspection(mission_id: UUID, body: InspectionCreate, db: Session = Depends(get_db)):
    """add inspection to mission"""
    return inspection_service.add_inspection(db, mission_id, body)


# reorder must be before {inspection_id} routes so "reorder" isn't parsed as a uuid
@router.put("/{mission_id}/inspections/reorder", response_model=ReorderResponse)
def reorder_inspections(mission_id: UUID, body: ReorderRequest, db: Session = Depends(get_db)):
    """reorder inspections by sequence"""
    inspection_service.reorder_inspections(db, mission_id, body.inspection_ids)

    return ReorderResponse(reordered=True)


@router.put("/{mission_id}/inspections/{inspection_id}", response_model=InspectionResponse)
def update_inspection(
    mission_id: UUID,
    inspection_id: UUID,
    body: InspectionUpdate,
    db: Session = Depends(get_db),
):
    """update inspection"""
    return inspection_service.update_inspection(db, mission_id, inspection_id, body)


@router.delete("/{mission_id}/inspections/{inspection_id}", response_model=DeleteResponse)
def delete_inspection(mission_id: UUID, inspection_id: UUID, db: Session = Depends(get_db)):
    """delete inspection"""
    inspection_service.delete_inspection(db, mission_id, inspection_id)

    return DeleteResponse(deleted=True)
