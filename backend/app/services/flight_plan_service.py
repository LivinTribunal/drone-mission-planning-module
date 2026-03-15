from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.flight_plan import (
    FlightPlan,
    ValidationResult,
    ValidationViolation,
    Waypoint,
)
from app.models.mission import Mission
from app.services.geo import geojson_to_ewkt


def persist_flight_plan(
    db: Session,
    mission: Mission,
    all_waypoints: list,
    warnings: list[str],
    total_distance: float,
    estimated_duration: float,
) -> FlightPlan:
    """persist flight plan with waypoints and validation result"""
    flight_plan = FlightPlan(
        mission_id=mission.id,
        airport_id=mission.airport_id,
        total_distance=total_distance,
        estimated_duration=estimated_duration,
    )
    db.add(flight_plan)
    db.flush()

    # persist waypoints
    for i, wp in enumerate(all_waypoints, start=1):
        target_ewkt = None
        if wp.camera_target:
            target_ewkt = geojson_to_ewkt({"type": "Point", "coordinates": list(wp.camera_target)})

        db_wp = Waypoint(
            flight_plan_id=flight_plan.id,
            inspection_id=wp.inspection_id,
            sequence_order=i,
            position=geojson_to_ewkt({"type": "Point", "coordinates": [wp.lon, wp.lat, wp.alt]}),
            heading=wp.heading,
            speed=wp.speed,
            hover_duration=wp.hover_duration,
            camera_action=wp.camera_action,
            waypoint_type=wp.waypoint_type,
            camera_target=target_ewkt,
        )
        db.add(db_wp)

    # validation result with soft warnings
    if warnings:
        val_result = ValidationResult(
            flight_plan_id=flight_plan.id,
            passed=True,
        )
        db.add(val_result)
        db.flush()

        for w in warnings:
            db.add(
                ValidationViolation(
                    validation_result_id=val_result.id,
                    is_warning=True,
                    message=w,
                )
            )

    # set mission status to PLANNED
    mission.status = "PLANNED"
    db.commit()
    db.refresh(flight_plan)

    return flight_plan


def get_flight_plan(db: Session, mission_id: UUID) -> FlightPlan:
    """get flight plan for mission with waypoints and validation"""
    fp = (
        db.query(FlightPlan)
        .options(
            joinedload(FlightPlan.waypoints),
            joinedload(FlightPlan.validation_result).joinedload(ValidationResult.violations),
        )
        .filter(FlightPlan.mission_id == mission_id)
        .first()
    )
    if not fp:
        raise HTTPException(status_code=404, detail="flight plan not found")

    return fp
