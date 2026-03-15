from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.schemas.flight_plan import FlightPlanResponse, GenerateTrajectoryResponse
from app.services.flight_plan_service import get_flight_plan
from app.services.trajectory_generator import generate_trajectory

router = APIRouter(prefix="/api/v1/missions", tags=["flight-plans"])


@router.post(
    "/{mission_id}/generate-trajectory",
    response_model=GenerateTrajectoryResponse,
)
def generate(mission_id: UUID, db: Session = Depends(get_db)):
    """run 5-phase trajectory generation pipeline"""
    result = generate_trajectory(db, mission_id)

    # reload with eager-loaded waypoints
    fp = get_flight_plan(db, result["flight_plan"].mission_id)

    return {"flight_plan": fp, "warnings": result["warnings"]}


@router.get("/{mission_id}/flight-plan", response_model=FlightPlanResponse)
def get_plan(mission_id: UUID, db: Session = Depends(get_db)):
    """get flight plan for mission"""
    return get_flight_plan(db, mission_id)
