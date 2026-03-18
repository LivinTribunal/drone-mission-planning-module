from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.core.exceptions import DomainError, TrajectoryGenerationError
from app.schemas.flight_plan import FlightPlanResponse, GenerateTrajectoryResponse
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
        flight_plan, warnings = generate_trajectory(db, mission_id)
    except TrajectoryGenerationError as e:
        detail = {"error": e.message, "violations": e.violations} if e.violations else e.message
        raise HTTPException(status_code=e.status_code, detail=detail)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    # reload with eager-loaded waypoints
    try:
        fp = flight_plan_service.get_flight_plan(db, flight_plan.mission_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="flight plan not found")

    return GenerateTrajectoryResponse(flight_plan=fp, warnings=warnings)


@router.get("/{mission_id}/flight-plan", response_model=FlightPlanResponse)
def get_plan(mission_id: UUID, db: Session = Depends(get_db)):
    """get flight plan for mission"""
    try:
        return flight_plan_service.get_flight_plan(db, mission_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="flight plan not found")
