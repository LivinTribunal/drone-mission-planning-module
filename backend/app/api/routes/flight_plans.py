from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_db
from app.models.flight_plan import FlightPlan
from app.schemas.flight_plan import FlightPlanResponse, GenerateTrajectoryResponse
from app.services.trajectory_generator import generate_trajectory

router = APIRouter(prefix="/api/v1/missions", tags=["flight-plans"])


@router.post("/{mission_id}/generate-trajectory", response_model=GenerateTrajectoryResponse)
def generate(mission_id: UUID, db: Session = Depends(get_db)):
    """run 5-phase trajectory generation pipeline"""
    flight_plan = generate_trajectory(db, mission_id)

    # reload with waypoints and validation
    fp = (
        db.query(FlightPlan)
        .options(
            joinedload(FlightPlan.waypoints),
            joinedload(FlightPlan.validation_result),
        )
        .filter(FlightPlan.id == flight_plan.id)
        .first()
    )

    return {"flight_plan": fp, "warnings": []}


@router.get("/{mission_id}/flight-plan", response_model=FlightPlanResponse)
def get_flight_plan(mission_id: UUID, db: Session = Depends(get_db)):
    """get flight plan for mission"""
    fp = (
        db.query(FlightPlan)
        .options(
            joinedload(FlightPlan.waypoints),
            joinedload(FlightPlan.validation_result),
        )
        .filter(FlightPlan.mission_id == mission_id)
        .first()
    )
    if not fp:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="flight plan not found")

    return fp
