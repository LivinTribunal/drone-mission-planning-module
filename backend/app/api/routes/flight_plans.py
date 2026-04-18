from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_operator
from app.core.exceptions import DomainError, NotFoundError, TrajectoryGenerationError
from app.models.user import User
from app.schemas.flight_plan import (
    FlightPlanResponse,
    GenerateTrajectoryResponse,
    TransitWaypointInsertRequest,
    WaypointBatchUpdateRequest,
)
from app.services import flight_plan_service, mission_service
from app.services.trajectory.orchestrator import generate_trajectory

router = APIRouter(prefix="/api/v1/missions", tags=["flight-plans"])


@router.post(
    "/{mission_id}/generate-trajectory",
    response_model=GenerateTrajectoryResponse,
)
def generate(
    mission_id: UUID,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """run 5-phase trajectory generation pipeline."""
    try:
        mission = mission_service.get_mission(db, mission_id)
    except NotFoundError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    scope = mission.flight_plan_scope or "FULL"
    if scope != "MEASUREMENTS_ONLY" and (
        not mission.takeoff_coordinate or not mission.landing_coordinate
    ):
        raise HTTPException(
            status_code=400,
            detail="Takeoff/landing coordinates must be set.",
        )

    try:
        flight_plan, _warnings = generate_trajectory(db, mission_id)
    except TrajectoryGenerationError as error:
        detail = (
            {"error": error.message, "violations": error.violations}
            if error.violations is not None
            else error.message
        )

        raise HTTPException(status_code=error.status_code, detail=detail)
    except DomainError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)

    # reload with eager-loaded waypoints
    try:
        fp = flight_plan_service.get_flight_plan(db, flight_plan.mission_id)
    except DomainError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)

    return GenerateTrajectoryResponse(flight_plan=fp)


@router.get("/{mission_id}/flight-plan", response_model=FlightPlanResponse)
def get_plan(
    mission_id: UUID,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """get flight plan for mission"""
    try:
        return flight_plan_service.get_flight_plan(db, mission_id)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/{mission_id}/flight-plan/waypoints", response_model=FlightPlanResponse)
def batch_update_waypoints(
    mission_id: UUID,
    payload: WaypointBatchUpdateRequest,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """batch update waypoint positions and camera targets."""
    try:
        return flight_plan_service.batch_update_waypoints(db, mission_id, payload.updates)
    except NotFoundError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post(
    "/{mission_id}/flight-plan/waypoints/transit",
    response_model=FlightPlanResponse,
)
def insert_transit_waypoint(
    mission_id: UUID,
    payload: TransitWaypointInsertRequest,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """insert a new transit waypoint at a position on the transit path."""
    try:
        return flight_plan_service.insert_transit_waypoint(db, mission_id, payload)
    except NotFoundError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete(
    "/{mission_id}/flight-plan/waypoints/{waypoint_id}",
    response_model=FlightPlanResponse,
)
def delete_transit_waypoint(
    mission_id: UUID,
    waypoint_id: UUID,
    current_user: User = Depends(require_operator),
    db: Session = Depends(get_db),
):
    """delete a transit waypoint from the flight plan."""
    try:
        return flight_plan_service.delete_transit_waypoint(db, mission_id, waypoint_id)
    except NotFoundError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


# flight plans cascade-delete with the mission (FK ondelete=CASCADE)
# and are replaced by the orchestrator on regeneration
