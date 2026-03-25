from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import DomainError, NotFoundError
from app.models.enums import MissionStatus
from app.models.flight_plan import (
    FlightPlan,
    ValidationResult,
    ValidationViolation,
    Waypoint,
)
from app.models.mission import Mission
from app.schemas.flight_plan import WaypointPositionUpdate
from app.services.geometry_converter import geojson_to_ewkt
from app.services.trajectory_types import WaypointData


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
    all_waypoints: list[WaypointData],
    warnings: list[str],
    total_distance: float,
    estimated_duration: float,
    violations: list[str] | None = None,
) -> FlightPlan:
    """persist flight plan with waypoints and validation result.

    warnings are stored with is_warning=True.
    violations are stored with is_warning=False but don't abort generation.
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

    # validation result - passed=False when non-aborting violations exist
    has_violations = bool(violations)
    val_result = ValidationResult(
        flight_plan_id=flight_plan.id,
        passed=not has_violations,
    )
    db.add(val_result)
    db.flush()

    for w in dict.fromkeys(warnings):
        db.add(
            ValidationViolation(
                validation_result_id=val_result.id,
                is_warning=True,
                message=w,
            )
        )

    for v in dict.fromkeys(violations or []):
        db.add(
            ValidationViolation(
                validation_result_id=val_result.id,
                is_warning=False,
                message=v,
            )
        )

    # caller (orchestrator) handles commit after setting is_validated and status
    db.flush()

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


def batch_update_waypoints(
    db: Session, mission_id: UUID, updates: list[WaypointPositionUpdate]
) -> FlightPlan:
    """batch update waypoint positions and camera targets."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise NotFoundError("mission not found")

    if mission.status not in ("DRAFT", "PLANNED"):
        raise DomainError("cannot modify waypoints in current status", status_code=409)

    fp = db.query(FlightPlan).filter(FlightPlan.mission_id == mission_id).first()
    if not fp:
        raise NotFoundError("flight plan not found")

    for upd in updates:
        wp = (
            db.query(Waypoint)
            .filter(Waypoint.id == upd.waypoint_id, Waypoint.flight_plan_id == fp.id)
            .first()
        )
        if not wp:
            raise NotFoundError(f"waypoint {upd.waypoint_id} not found")

        coords = upd.position.coordinates
        wp.position = geojson_to_ewkt({"type": "Point", "coordinates": coords})

        if upd.camera_target is not None:
            ct_coords = upd.camera_target.coordinates
            wp.camera_target = geojson_to_ewkt({"type": "Point", "coordinates": ct_coords})

    # regress to DRAFT without nullifying flight_plan - waypoints were just updated in place
    if mission.status in (MissionStatus.PLANNED, MissionStatus.VALIDATED):
        mission.status = MissionStatus.DRAFT

    mission.has_unsaved_map_changes = True
    db.commit()

    return get_flight_plan(db, mission_id)
