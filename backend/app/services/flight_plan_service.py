from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError
from app.models.enums import MissionStatus
from app.models.flight_plan import (
    FlightPlan,
    ValidationResult,
    ValidationViolation,
    Waypoint,
)
from app.models.mission import Mission
from app.services.geometry_converter import geojson_to_ewkt


def _to_point_ewkt(lon: float, lat: float, alt: float) -> str:
    """convert lon/lat/alt to EWKT point string"""
    return geojson_to_ewkt({"type": "Point", "coordinates": [lon, lat, alt]})


def _waypoint_to_model(wp, flight_plan_id, sequence_order: int) -> Waypoint:
    """convert WaypointData to ORM model"""
    target_ewkt = None
    if wp.camera_target:
        ct = wp.camera_target
        target_ewkt = _to_point_ewkt(ct.lon, ct.lat, ct.alt)

    return Waypoint(
        flight_plan_id=flight_plan_id,
        inspection_id=wp.inspection_id,
        sequence_order=sequence_order,
        position=_to_point_ewkt(wp.lon, wp.lat, wp.alt),
        heading=wp.heading,
        speed=wp.speed,
        hover_duration=wp.hover_duration,
        camera_action=wp.camera_action,
        waypoint_type=wp.waypoint_type,
        camera_target=target_ewkt,
        gimbal_pitch=wp.gimbal_pitch,
    )


def persist_flight_plan(
    db: Session,
    mission: Mission,
    all_waypoints: list,
    warnings: list[str],
    total_distance: float,
    estimated_duration: float,
) -> FlightPlan:
    """persist flight plan with waypoints and validation result.

    caller must filter out hard violations before calling - all warnings
    are stored as soft violations (is_warning=True).
    """
    flight_plan = FlightPlan(
        mission_id=mission.id,
        airport_id=mission.airport_id,
    )
    flight_plan.compile(total_distance, estimated_duration)
    db.add(flight_plan)
    db.flush()

    for i, wp in enumerate(all_waypoints, start=1):
        db.add(_waypoint_to_model(wp, flight_plan.id, i))

    # validation result - always created so serialization never gets None
    val_result = ValidationResult(
        flight_plan_id=flight_plan.id,
        passed=True,
    )
    db.add(val_result)
    db.flush()

    # defensive dedup - orchestrator already deduplicates but this protects against direct callers
    for w in dict.fromkeys(warnings):
        db.add(
            ValidationViolation(
                validation_result_id=val_result.id,
                is_warning=True,
                message=w,
            )
        )

    # transition to PLANNED only if still in DRAFT (skip if already PLANNED from regression)
    if mission.status == MissionStatus.DRAFT:
        mission.transition_to(MissionStatus.PLANNED)
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
        raise NotFoundError("flight plan not found")

    return fp
