from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import DomainError, NotFoundError
from app.models.enums import MissionStatus, WaypointType
from app.models.flight_plan import (
    FlightPlan,
    ValidationResult,
    ValidationViolation,
    Waypoint,
)
from app.models.mission import Mission
from app.schemas.flight_plan import TransitWaypointInsertRequest, WaypointPositionUpdate
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
    suggestions: list[str] | None = None,
) -> FlightPlan:
    """persist flight plan with waypoints and validation result.

    warnings are stored with category='warning'.
    violations are stored with category='violation' but don't abort generation.
    suggestions are stored with category='suggestion'.
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
                category="warning",
                message=w,
            )
        )

    for v in dict.fromkeys(violations or []):
        db.add(
            ValidationViolation(
                validation_result_id=val_result.id,
                category="violation",
                message=v,
            )
        )

    for s in dict.fromkeys(suggestions or []):
        db.add(
            ValidationViolation(
                validation_result_id=val_result.id,
                category="suggestion",
                message=s,
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
    if len(updates) > 200:
        raise DomainError("batch too large", status_code=400)

    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise NotFoundError("mission not found")

    if mission.status not in (MissionStatus.DRAFT, MissionStatus.PLANNED, MissionStatus.VALIDATED):
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

        # sync mission coordinate when takeoff/landing waypoints move
        if wp.waypoint_type == WaypointType.TAKEOFF:
            mission.takeoff_coordinate = geojson_to_ewkt({"type": "Point", "coordinates": coords})
        elif wp.waypoint_type == WaypointType.LANDING:
            mission.landing_coordinate = geojson_to_ewkt({"type": "Point", "coordinates": coords})

    # regress validated -> planned, keep planned as-is (waypoints modified in place)
    if mission.status == MissionStatus.VALIDATED:
        mission.status = MissionStatus.PLANNED  # arch-exempt

    mission.has_unsaved_map_changes = True
    db.commit()

    return get_flight_plan(db, mission_id)


def insert_transit_waypoint(
    db: Session, mission_id: UUID, request: TransitWaypointInsertRequest
) -> FlightPlan:
    """insert a new transit waypoint after the given sequence position."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise NotFoundError("mission not found")

    if mission.status not in (MissionStatus.DRAFT, MissionStatus.PLANNED, MissionStatus.VALIDATED):
        raise DomainError("cannot modify waypoints in current status", status_code=409)

    fp = db.query(FlightPlan).filter(FlightPlan.mission_id == mission_id).first()
    if not fp:
        raise NotFoundError("flight plan not found")

    # shift all waypoints after the insertion point
    subsequent = (
        db.query(Waypoint)
        .filter(
            Waypoint.flight_plan_id == fp.id,
            Waypoint.sequence_order > request.after_sequence,
        )
        .all()
    )
    for wp in subsequent:
        wp.sequence_order += 1

    # create the new transit waypoint
    coords = request.position.coordinates
    new_wp = Waypoint(
        flight_plan_id=fp.id,
        sequence_order=request.after_sequence + 1,
        position=geojson_to_ewkt({"type": "Point", "coordinates": coords}),
        waypoint_type=WaypointType.TRANSIT,
    )
    db.add(new_wp)

    # regress validated -> planned, keep planned as-is (waypoints modified in place)
    if mission.status == MissionStatus.VALIDATED:
        mission.status = MissionStatus.PLANNED  # arch-exempt

    mission.has_unsaved_map_changes = True
    db.commit()

    return get_flight_plan(db, mission_id)


def delete_transit_waypoint(db: Session, mission_id: UUID, waypoint_id: UUID) -> FlightPlan:
    """delete a transit waypoint and resequence remaining waypoints."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise NotFoundError("mission not found")

    if mission.status not in (MissionStatus.DRAFT, MissionStatus.PLANNED, MissionStatus.VALIDATED):
        raise DomainError("cannot modify waypoints in current status", status_code=409)

    fp = db.query(FlightPlan).filter(FlightPlan.mission_id == mission_id).first()
    if not fp:
        raise NotFoundError("flight plan not found")

    wp = (
        db.query(Waypoint)
        .filter(Waypoint.id == waypoint_id, Waypoint.flight_plan_id == fp.id)
        .first()
    )
    if not wp:
        raise NotFoundError("waypoint not found")

    if wp.waypoint_type != WaypointType.TRANSIT:
        raise DomainError("only transit waypoints can be deleted", status_code=400)

    deleted_seq = wp.sequence_order
    db.delete(wp)

    # resequence subsequent waypoints
    subsequent = (
        db.query(Waypoint)
        .filter(
            Waypoint.flight_plan_id == fp.id,
            Waypoint.sequence_order > deleted_seq,
        )
        .all()
    )
    for w in subsequent:
        w.sequence_order -= 1

    # regress validated -> planned, keep planned as-is
    if mission.status == MissionStatus.VALIDATED:
        mission.status = MissionStatus.PLANNED  # arch-exempt

    mission.has_unsaved_map_changes = True
    db.commit()

    return get_flight_plan(db, mission_id)
