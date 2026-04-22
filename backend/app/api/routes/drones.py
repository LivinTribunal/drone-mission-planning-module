from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.dependencies import CoordinatorUser, OperatorUser, check_airport_access
from app.core.dependencies import get_db
from app.core.enums import AuditAction
from app.schemas.common import DeleteResponse, ListMeta
from app.schemas.drone import DroneCreate, DroneListResponse, DroneResponse, DroneUpdate
from app.services import drone_service
from app.utils.audit import log_audit

router = APIRouter(prefix="/api/v1/airports/{airport_id}/drones", tags=["drones"])


def _serialize(drone, mission_count: int = 0) -> DroneResponse:
    """build response with embedded profile + mission count."""
    resp = DroneResponse.model_validate(drone)
    resp.mission_count = mission_count
    return resp


@router.get("", response_model=DroneListResponse)
def list_drones(
    airport_id: UUID,
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """list drones for an airport (airport-scoped fleet)."""
    check_airport_access(current_user, airport_id)
    drones = drone_service.list_drones(db, airport_id)
    counts = drone_service.get_mission_counts(db, airport_id)

    data = [_serialize(d, counts.get(d.id, 0)) for d in drones]
    return DroneListResponse(data=data, meta=ListMeta(total=len(data)))


@router.get("/{drone_id}", response_model=DroneResponse)
def get_drone(
    airport_id: UUID,
    drone_id: UUID,
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """get a single drone scoped to an airport."""
    check_airport_access(current_user, airport_id)
    drone = drone_service.get_drone(db, airport_id, drone_id)
    return _serialize(drone, drone_service.get_mission_count(db, drone_id))


@router.post("", status_code=201, response_model=DroneResponse)
def create_drone(
    airport_id: UUID,
    body: DroneCreate,
    request: Request,
    current_user: CoordinatorUser,
    db: Session = Depends(get_db),
):
    """create a drone at an airport using a shared profile template."""
    check_airport_access(current_user, airport_id)
    drone = drone_service.create_drone(db, airport_id, body)
    log_audit(
        db,
        current_user,
        AuditAction.CREATE,
        entity_type="Drone",
        entity_id=drone.id,
        entity_name=drone.name,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return _serialize(drone, 0)


@router.put("/{drone_id}", response_model=DroneResponse)
def update_drone(
    airport_id: UUID,
    drone_id: UUID,
    body: DroneUpdate,
    request: Request,
    current_user: CoordinatorUser,
    db: Session = Depends(get_db),
):
    """update fleet drone metadata."""
    check_airport_access(current_user, airport_id)
    drone = drone_service.update_drone(db, airport_id, drone_id, body)
    log_audit(
        db,
        current_user,
        AuditAction.UPDATE,
        entity_type="Drone",
        entity_id=drone_id,
        entity_name=drone.name,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return _serialize(drone, drone_service.get_mission_count(db, drone_id))


@router.delete("/{drone_id}", response_model=DeleteResponse)
def delete_drone(
    airport_id: UUID,
    drone_id: UUID,
    request: Request,
    current_user: CoordinatorUser,
    db: Session = Depends(get_db),
):
    """delete a drone; blocked when missions still reference it."""
    check_airport_access(current_user, airport_id)
    drone = drone_service.get_drone(db, airport_id, drone_id)
    log_audit(
        db,
        current_user,
        AuditAction.DELETE,
        entity_type="Drone",
        entity_id=drone_id,
        entity_name=drone.name,
        ip_address=request.client.host if request.client else None,
    )
    warnings = drone_service.delete_drone(db, airport_id, drone_id)
    return DeleteResponse(deleted=True, warnings=warnings)
