from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.core.exceptions import DomainError, NotFoundError, TrajectoryGenerationError
from app.schemas.flight_plan import (
    FlightPlanResponse,
    GenerateTrajectoryResponse,
    WaypointBatchUpdateRequest,
)
from app.services import flight_plan_service
from app.services.trajectory_orchestrator import generate_trajectory

router = APIRouter(prefix="/api/v1/missions", tags=["flight-plans"])


@router.post(
    "/{mission_id}/generate-trajectory",
    response_model=GenerateTrajectoryResponse,
)
def generate(mission_id: UUID, db: Session = Depends(get_db)):
    """run 5-phase trajectory generation pipeline"""
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
def get_plan(mission_id: UUID, db: Session = Depends(get_db)):
    """get flight plan for mission"""
    try:
        return flight_plan_service.get_flight_plan(db, mission_id)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/{mission_id}/flight-plan/waypoints", response_model=FlightPlanResponse)
def batch_update_waypoints(
    mission_id: UUID,
    payload: WaypointBatchUpdateRequest,
    db: Session = Depends(get_db),
):
    """batch update waypoint positions and camera targets."""
    try:
        return flight_plan_service.batch_update_waypoints(db, mission_id, payload.updates)
    except NotFoundError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


# flight plans cascade-delete with the mission (FK ondelete=CASCADE)
# and are replaced by the orchestrator on regeneration
