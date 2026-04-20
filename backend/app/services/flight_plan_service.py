from collections import defaultdict
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import DomainError, NotFoundError
from app.models.airport import Airport
from app.models.enums import MissionStatus, WaypointType
from app.models.flight_plan import (
    FlightPlan,
    ValidationResult,
    ValidationViolation,
    Waypoint,
)
from app.models.mission import Mission
from app.schemas.flight_plan import (
    FlightPlanResponse,
    InspectionFlightStats,
    TransitWaypointInsertRequest,
    WaypointPositionUpdate,
)
from app.schemas.geometry import parse_ewkb
from app.services.geometry_converter import geojson_to_ewkt
from app.services.trajectory.types import WaypointData
from app.utils.geo import distance_between


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


def _extract_altitude(geom) -> float:
    """extract z-coordinate (altitude MSL) from a postgis geometry column."""
    geojson = parse_ewkb(geom.data)
    coords = geojson.get("coordinates", [0, 0, 0])
    return coords[2] if len(coords) > 2 else 0.0


def _extract_coords(geom) -> tuple[float, float, float]:
    """extract (lon, lat, alt) from a postgis geometry column."""
    geojson = parse_ewkb(geom.data)
    coords = geojson.get("coordinates", [0, 0, 0])
    return (coords[0], coords[1], coords[2] if len(coords) > 2 else 0.0)


def build_enriched_response(db: Session, flight_plan: FlightPlan) -> FlightPlanResponse:
    """build flight plan response with computed altitude and speed stats."""
    response = FlightPlanResponse.model_validate(flight_plan)

    waypoints = flight_plan.waypoints
    if not waypoints:
        return response

    # global altitude stats
    altitudes_msl = [_extract_altitude(wp.position) for wp in waypoints]
    response.min_altitude_msl = min(altitudes_msl)
    response.max_altitude_msl = max(altitudes_msl)

    airport = db.query(Airport).filter(Airport.id == flight_plan.airport_id).first()
    elevation = airport.elevation if airport else 0.0

    response.min_altitude_agl = response.min_altitude_msl - elevation
    response.max_altitude_agl = response.max_altitude_msl - elevation

    # transit speed from mission
    mission = db.query(Mission).filter(Mission.id == flight_plan.mission_id).first()
    if mission and mission.default_speed is not None:
        response.transit_speed = mission.default_speed

    # per-inspection stats
    by_inspection: dict[UUID, list[Waypoint]] = defaultdict(list)
    for wp in waypoints:
        if wp.inspection_id:
            by_inspection[wp.inspection_id].append(wp)

    inspection_stats = []
    for insp_id, insp_wps in by_inspection.items():
        insp_alts = [_extract_altitude(wp.position) for wp in insp_wps]
        insp_min_msl = min(insp_alts)
        insp_max_msl = max(insp_alts)

        # segment duration: sum of travel time + hover durations
        seg_duration = 0.0
        coords_list = [_extract_coords(wp.position) for wp in insp_wps]
        for i in range(1, len(coords_list)):
            dist = distance_between(
                coords_list[i - 1][0],
                coords_list[i - 1][1],
                coords_list[i][0],
                coords_list[i][1],
            )
            speed = insp_wps[i].speed or insp_wps[i - 1].speed or 5.0
            seg_duration += dist / speed if speed > 0 else 0.0

        for wp in insp_wps:
            if wp.hover_duration:
                seg_duration += wp.hover_duration

        inspection_stats.append(
            InspectionFlightStats(
                inspection_id=insp_id,
                min_altitude_agl=insp_min_msl - elevation,
                max_altitude_agl=insp_max_msl - elevation,
                min_altitude_msl=insp_min_msl,
                max_altitude_msl=insp_max_msl,
                waypoint_count=len(insp_wps),
                segment_duration=round(seg_duration, 2),
            )
        )

    response.inspection_stats = inspection_stats
    return response


def persist_flight_plan(
    db: Session,
    mission: Mission,
    all_waypoints: list[WaypointData],
    warnings: list[tuple[str, list[str]]],
    total_distance: float,
    estimated_duration: float,
    violations: list[tuple[str, list[str]]] | None = None,
    suggestions: list[tuple[str, list[str]]] | None = None,
) -> FlightPlan:
    """persist flight plan with waypoints and validation result.

    each warning/violation/suggestion is a (message, waypoint_ids) tuple.
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

    # flush waypoints so they get UUIDs
    db.flush()

    # build index -> uuid mapping for resolving waypoint indices
    persisted_wps = (
        db.query(Waypoint)
        .filter(Waypoint.flight_plan_id == flight_plan.id)
        .order_by(Waypoint.sequence_order)
        .all()
    )
    idx_to_uuid = {i: str(w.id) for i, w in enumerate(persisted_wps)}

    def _resolve_ids(wp_ids: list[str]) -> list[str]:
        """resolve index-based ids to actual UUIDs when possible."""
        resolved = []
        for wid in wp_ids:
            if wid.startswith("idx:"):
                try:
                    idx = int(wid[4:])
                except ValueError:
                    continue
                if idx in idx_to_uuid:
                    resolved.append(idx_to_uuid[idx])
            else:
                resolved.append(wid)
        return resolved

    # validation result - passed=False when non-aborting violations exist
    has_violations = bool(violations)
    val_result = ValidationResult(
        flight_plan_id=flight_plan.id,
        passed=not has_violations,
    )
    db.add(val_result)
    db.flush()

    seen: set[str] = set()
    for msg, wp_ids in warnings:
        if msg in seen:
            continue
        seen.add(msg)
        db.add(
            ValidationViolation(
                validation_result_id=val_result.id,
                category="warning",
                message=msg,
                waypoint_ids=_resolve_ids(wp_ids),
            )
        )

    seen.clear()
    for msg, wp_ids in violations or []:
        if msg in seen:
            continue
        seen.add(msg)
        db.add(
            ValidationViolation(
                validation_result_id=val_result.id,
                category="violation",
                message=msg,
                waypoint_ids=_resolve_ids(wp_ids),
            )
        )

    seen.clear()
    for msg, wp_ids in suggestions or []:
        if msg in seen:
            continue
        seen.add(msg)
        db.add(
            ValidationViolation(
                validation_result_id=val_result.id,
                category="suggestion",
                message=msg,
                waypoint_ids=_resolve_ids(wp_ids),
            )
        )

    # caller (orchestrator) handles commit after setting is_validated and status
    db.flush()

    return flight_plan


def get_flight_plan(db: Session, mission_id: UUID) -> FlightPlanResponse:
    """get flight plan for mission with waypoints, validation, and enriched stats."""
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

    return build_enriched_response(db, fp)


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

    # load all target waypoints in one query
    waypoint_ids = [upd.waypoint_id for upd in updates]
    waypoints = (
        db.query(Waypoint)
        .filter(Waypoint.id.in_(waypoint_ids), Waypoint.flight_plan_id == fp.id)
        .all()
    )
    wp_map = {wp.id: wp for wp in waypoints}

    for upd in updates:
        wp = wp_map.get(upd.waypoint_id)
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

    mission.regress_to_planned()

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

    # validate after_sequence is within range
    max_seq = (
        db.query(func.max(Waypoint.sequence_order))
        .filter(Waypoint.flight_plan_id == fp.id)
        .scalar()
    ) or 0
    if request.after_sequence < 0 or request.after_sequence > max_seq:
        raise DomainError(
            f"after_sequence must be between 0 and {max_seq}",
            status_code=400,
        )

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

    mission.regress_to_planned()
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

    mission.regress_to_planned()

    mission.has_unsaved_map_changes = True
    db.commit()

    return get_flight_plan(db, mission_id)
