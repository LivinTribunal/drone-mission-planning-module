from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import OperatorUser, check_mission_access
from app.core.dependencies import get_db
from app.core.exceptions import DomainError, NotFoundError, TrajectoryGenerationError
from app.schemas.flight_plan import (
    FlightPlanResponse,
    GenerateTrajectoryResponse,
    TransitWaypointInsertRequest,
    WaypointBatchUpdateRequest,
)
from app.schemas.mission import ComputationStatusResponse
from app.services import flight_plan_service
from app.services.trajectory.orchestrator import generate_trajectory

router = APIRouter(prefix="/api/v1/missions", tags=["flight-plans"])

# staleness threshold - if computing for longer than this, consider it timed out
_COMPUTATION_TIMEOUT_MINUTES = 5


@router.post(
    "/{mission_id}/generate-trajectory",
    response_model=GenerateTrajectoryResponse,
)
def generate(
    mission_id: UUID,
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """run 5-phase trajectory generation pipeline."""
    try:
        mission = check_mission_access(db, current_user, mission_id)
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

    # mark computing before the heavy work
    mission.mark_computing()
    db.commit()

    try:
        flight_plan, _warnings = generate_trajectory(db, mission_id)
    except TrajectoryGenerationError as error:
        # reload mission after trajectory call (it may have been modified)
        db.refresh(mission)
        mission.mark_computation_failed(error.message)
        db.commit()

        detail = (
            {"error": error.message, "violations": error.violations}
            if error.violations is not None
            else error.message
        )

        raise HTTPException(status_code=error.status_code, detail=detail)
    except DomainError as error:
        db.refresh(mission)
        mission.mark_computation_failed(error.message)
        db.commit()

        raise HTTPException(status_code=error.status_code, detail=error.message)
    except Exception as error:
        db.refresh(mission)
        mission.mark_computation_failed(str(error))
        db.commit()
        raise

    # mark completed
    db.refresh(mission)
    mission.mark_computation_completed()
    db.commit()

    # reload with eager-loaded waypoints
    try:
        fp = flight_plan_service.get_flight_plan(db, flight_plan.mission_id)
    except DomainError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)

    db.refresh(mission)
    return GenerateTrajectoryResponse(flight_plan=fp, mission_status=mission.status)


@router.get(
    "/{mission_id}/computation-status",
    response_model=ComputationStatusResponse,
)
def get_computation_status(
    mission_id: UUID,
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """lightweight polling endpoint for trajectory computation status."""
    try:
        mission = check_mission_access(db, current_user, mission_id)
    except NotFoundError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    # staleness detection - if computing for too long, treat as failed
    if mission.computation_status == "COMPUTING" and mission.computation_started_at is not None:
        started = mission.computation_started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        if elapsed > _COMPUTATION_TIMEOUT_MINUTES * 60:
            mission.mark_computation_failed("computation timed out")
            db.commit()

    return ComputationStatusResponse(
        computation_status=mission.computation_status,
        computation_error=mission.computation_error,
        computation_started_at=mission.computation_started_at,
    )


@router.get("/{mission_id}/flight-plan", response_model=FlightPlanResponse)
def get_plan(
    mission_id: UUID,
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """get flight plan for mission"""
    check_mission_access(db, current_user, mission_id)
    try:
        return flight_plan_service.get_flight_plan(db, mission_id)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/{mission_id}/flight-plan/waypoints", response_model=FlightPlanResponse)
def batch_update_waypoints(
    mission_id: UUID,
    payload: WaypointBatchUpdateRequest,
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """batch update waypoint positions and camera targets."""
    check_mission_access(db, current_user, mission_id)
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
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """insert a new transit waypoint at a position on the transit path."""
    check_mission_access(db, current_user, mission_id)
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
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """delete a transit waypoint from the flight plan."""
    check_mission_access(db, current_user, mission_id)
    try:
        return flight_plan_service.delete_transit_waypoint(db, mission_id, waypoint_id)
    except NotFoundError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


# flight plans cascade-delete with the mission (FK ondelete=CASCADE)
# and are replaced by the orchestrator on regeneration
