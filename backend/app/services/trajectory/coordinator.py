"""mission-wide trajectory orchestration and FlightPlan emission.

over 400 lines because the 5-phase pipeline (load, config, segments, assembly,
validation) is a single contract and splitting it further would leak cumulative
metric state and deferred warning formatting across module boundaries.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.exceptions import NotFoundError, TrajectoryGenerationError
from app.models.agl import AGL
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.enums import CameraAction, MissionStatus, WaypointType
from app.models.flight_plan import ConstraintRule, FlightPlan
from app.models.inspection import Inspection, InspectionTemplate
from app.models.mission import Mission
from app.services.elevation_provider import create_elevation_provider
from app.utils.geo import bearing_between, distance_between
from app.utils.local_projection import LocalProjection, build_local_geometries

from .config_resolver import resolve_with_defaults
from .pathfinding import compute_transit_path
from .segment_builder import (
    _format_soft_warnings,
    _parse_coordinate,
    _segment_duration_with_accel,
    build_inspection_pass,
)
from .types import (
    DEFAULT_RESERVE_MARGIN,
    DEFAULT_SPEED,
    GIMBAL_SETTLE_TIME,
    LANDING_DURATION,
    MIN_SPEED_FLOOR,
    TAKEOFF_DURATION,
    TRANSIT_AGL,
    InspectionPass,
    LocalGeometries,
    MissionData,
    Point3D,
    Violation,
    WaypointData,
)
from .validation import check_battery, segment_runway_crossing_length, validate_inspection_pass


@dataclass
class _PassContext:
    """per-inspection runtime data plus the local geometry + projection."""

    surfaces: list[AirfieldSurface]
    obstacles: list[Obstacle]
    safety_zones: list[SafetyZone]
    drone: object
    constraints: list[ConstraintRule]
    default_speed: float
    elevation_provider: object
    local_geoms: LocalGeometries


def _load_mission_data(db: Session, mission_id: UUID) -> MissionData:
    """load all entities needed for trajectory generation in a single query phase.

    constraints are intentionally empty - see comment in function body.
    """
    mission = (
        db.query(Mission)
        .options(
            joinedload(Mission.drone_profile),
            joinedload(Mission.inspections)
            .joinedload(Inspection.template)
            .joinedload(InspectionTemplate.default_config),
            joinedload(Mission.inspections).joinedload(Inspection.config),
            joinedload(Mission.inspections)
            .joinedload(Inspection.template)
            .joinedload(InspectionTemplate.targets)
            .joinedload(AGL.lhas),
            joinedload(Mission.flight_plan),
        )
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise NotFoundError("mission not found")
    if not mission.inspections:
        raise TrajectoryGenerationError("mission has no inspections")

    airport = db.query(Airport).filter(Airport.id == mission.airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    obstacles = db.query(Obstacle).filter(Obstacle.airport_id == airport.id).all()
    safety_zones = (
        db.query(SafetyZone)
        .filter(SafetyZone.airport_id == airport.id, SafetyZone.is_active == True)  # noqa: E712
        .all()
    )
    # eager-load surface -> agls -> lhas so hover-point-lock's AGL-agnostic
    # lookup (find_lha_in_surfaces) doesn't trigger N+1 lazy loads on the
    # trajectory critical path.
    surfaces = (
        db.query(AirfieldSurface)
        .options(joinedload(AirfieldSurface.agls).joinedload(AGL.lhas))
        .filter(AirfieldSurface.airport_id == airport.id)
        .all()
    )

    # constraints intentionally empty during generation - constraint rules are
    # per-flight-plan children that get cascade-deleted with the old plan.
    # drone limits and spatial checks run directly in validate_inspection_pass.
    # operator must re-attach constraints after regeneration if needed
    constraints: list[ConstraintRule] = []

    provider = create_elevation_provider(airport)

    return MissionData(
        mission=mission,
        airport=airport,
        drone=mission.drone_profile,
        obstacles=obstacles,
        safety_zones=safety_zones,
        surfaces=surfaces,
        constraints=constraints,
        default_speed=mission.default_speed or DEFAULT_SPEED,
        elevation_provider=provider,
    )


def generate_trajectory(
    db: Session, mission_id: UUID
) -> tuple[FlightPlan, list[tuple[str, list[str]]]]:
    """five-phase trajectory generation pipeline.

    phase 1: load all data
    phase 2: config resolution and pre-checks per inspection
    phase 3: compute waypoints, validate, and reroute
    phase 4: post-inspection processing
    phase 5: final assembly with A* transit
    """
    data = _load_mission_data(db, mission_id)
    provider = data.elevation_provider

    try:
        return _generate_trajectory_inner(db, data)
    finally:
        if hasattr(provider, "close"):
            provider.close()


def _generate_trajectory_inner(
    db: Session, data: MissionData
) -> tuple[FlightPlan, list[tuple[str, list[str]]]]:
    """run phases 2-5 of trajectory generation; outer function handles resource cleanup."""
    mission = data.mission
    drone = data.drone
    default_speed = data.default_speed

    scope = mission.flight_plan_scope or "FULL"

    # pre-check: takeoff/landing coordinates required unless scope is MEASUREMENTS_ONLY
    if scope != "MEASUREMENTS_ONLY":
        if not mission.takeoff_coordinate:
            raise TrajectoryGenerationError(
                "takeoff coordinates must be set before generating a trajectory"
            )
        if not mission.landing_coordinate:
            raise TrajectoryGenerationError(
                "landing coordinates must be set before generating a trajectory"
            )

    # delete existing flight plan before invalidation - db concern stays in service.
    # must happen before invalidate_trajectory() per its contract.
    existing_fp = mission.flight_plan
    had_constraints = False
    if existing_fp:
        had_constraints = bool(existing_fp.constraints)
        db.delete(existing_fp)
        db.flush()

    # auto-regress VALIDATED/EXPORTED so regeneration works without manual step
    if mission.status in (MissionStatus.VALIDATED, MissionStatus.EXPORTED):
        mission.invalidate_trajectory()

    # only DRAFT or PLANNED can generate - terminal states are blocked
    if mission.status not in (MissionStatus.DRAFT, MissionStatus.PLANNED):
        raise TrajectoryGenerationError(
            f"cannot generate trajectory for mission in {mission.status} status"
        )

    warnings: list[tuple[str, list[str]]] = []
    suggestions: list[tuple[str, list[str]]] = []
    papi_obstruction_violations: list[tuple[str, list[str]]] = []
    if had_constraints:
        warnings.append(("constraints were reset - re-attach after generation", []))

    inspection_passes: list[InspectionPass] = []
    # deferred per-pass data for formatting after phase 5 assembly
    deferred_pass_data: list[tuple[str, list, list[int]]] = []
    cumulative_distance = 0.0
    cumulative_duration = 0.0

    # resolve configurable transit altitude above ground level
    transit_agl = data.mission.transit_agl if data.mission.transit_agl is not None else TRANSIT_AGL
    if data.mission.transit_agl is None:
        suggestions.append(
            (
                f"no transit AGL set - using default ({TRANSIT_AGL:.1f} m); "
                "consider raising transit_agl to reduce soft AGL warnings",
                [],
            )
        )

    # mission-level default buffer for transit A*
    mission_buffer_override = data.mission.default_buffer_distance

    # operator opt-in: allow shortest-geodesic crossing instead of perpendicular,
    # reducing the runway closure window. defaults True for legacy behavior.
    require_perpendicular = data.mission.require_perpendicular_runway_crossing

    # set up local projection centered on airport for Shapely-based pathfinding
    airport_coords = _parse_coordinate(data.airport.location.data, "airport")
    proj = LocalProjection(ref_lon=airport_coords[0], ref_lat=airport_coords[1])
    local_geoms = build_local_geometries(proj, data.obstacles, data.safety_zones, data.surfaces)

    # attach local_geoms to data for segment_builder access without changing types.py
    data_with_geoms = _PassContext(
        surfaces=data.surfaces,
        obstacles=data.obstacles,
        safety_zones=data.safety_zones,
        drone=data.drone,
        constraints=data.constraints,
        default_speed=data.default_speed,
        elevation_provider=data.elevation_provider,
        local_geoms=local_geoms,
    )

    sorted_inspections = sorted(mission.inspections, key=lambda i: i.sequence_order)

    for inspection in sorted_inspections:
        resolve_fn = _build_resolve_fn(mission, suggestions)
        result = build_inspection_pass(
            inspection,
            mission,
            data_with_geoms,
            transit_agl,
            warnings,
            suggestions,
            resolve_fn,
        )
        if result is None:
            continue
        ipass, violations, obstructed_wps, seg_dist, seg_dur = result

        cumulative_distance += seg_dist
        cumulative_duration += seg_dur

        label = f"{inspection.template.name} #{inspection.sequence_order}"
        deferred_pass_data.append((label, violations, obstructed_wps))
        inspection_passes.append(ipass)

    if not inspection_passes:
        raise TrajectoryGenerationError("no waypoints generated")

    # phase 5 - final assembly with A* transit
    all_waypoints: list[WaypointData] = []
    measurement_index_maps: list[dict[int, int]] = []

    provider = data.elevation_provider

    if scope == "MEASUREMENTS_ONLY":
        pass_start_indices = _assemble_measurements_only(
            inspection_passes, all_waypoints, measurement_index_maps
        )
    elif scope == "NO_TAKEOFF_LANDING":
        pass_start_indices = _assemble_no_takeoff_landing(
            mission,
            inspection_passes,
            all_waypoints,
            local_geoms,
            provider,
            default_speed,
            transit_agl,
            mission_buffer_override,
            require_perpendicular,
        )
    else:
        pass_start_indices = _assemble_full_scope(
            mission,
            inspection_passes,
            all_waypoints,
            local_geoms,
            provider,
            default_speed,
            transit_agl,
            mission_buffer_override,
            require_perpendicular,
        )

    # build waypoint index -> inspection sequence mapping from explicit start indices
    wp_inspection_seq: dict[int, int] = {}
    is_measurements_only = scope == "MEASUREMENTS_ONLY"
    for i, (pass_start, ipass) in enumerate(zip(pass_start_indices, inspection_passes)):
        pass_wp_count = (
            len(measurement_index_maps[i]) if is_measurements_only else len(ipass.waypoints)
        )
        for k in range(pass_start, pass_start + pass_wp_count):
            if k < len(all_waypoints):
                wp_inspection_seq[k] = i + 1

        # format deferred per-pass warnings now that global offsets are known
        if i < len(deferred_pass_data):
            d_label, d_violations, d_obstructed = deferred_pass_data[i]

            if is_measurements_only:
                idx_map = measurement_index_maps[i]
                remapped_violations = []
                for v in d_violations:
                    if v.waypoint_index is not None and v.waypoint_index not in idx_map:
                        continue
                    if v.waypoint_index is not None:
                        v = Violation(
                            is_warning=v.is_warning,
                            message=v.message,
                            violation_kind=v.violation_kind,
                            constraint_id=v.constraint_id,
                            waypoint_index=idx_map[v.waypoint_index],
                        )
                    remapped_violations.append(v)
                _format_soft_warnings(remapped_violations, d_label, warnings, wp_offset=pass_start)

                d_obstructed = [idx_map[wi] for wi in d_obstructed if wi in idx_map]
            else:
                _format_soft_warnings(d_violations, d_label, warnings, wp_offset=pass_start)

            if d_obstructed:
                display_wps = [wi + 1 for wi in d_obstructed]
                if len(display_wps) <= 3:
                    wp_str = ", ".join(str(w) for w in display_wps)
                else:
                    wp_str = f"{min(display_wps)}-{max(display_wps)}"
                wp_ids = [f"idx:{wi + pass_start}" for wi in d_obstructed]
                papi_obstruction_violations.append(
                    (
                        f"{d_label} (wp {wp_str}): camera view to PAPI obstructed",
                        wp_ids,
                    )
                )

    # check for runway/taxiway crossings and add grouped warnings
    # measurement crossings grouped by (inspection_seq, surface) -> one warning
    # transit/other crossings kept individually
    measurement_crossings: dict[tuple[int, str], list[int]] = {}
    for j in range(1, len(all_waypoints)):
        prev_wp = all_waypoints[j - 1]
        cur_wp = all_waypoints[j]
        prev_x, prev_y = proj.to_local(prev_wp.lon, prev_wp.lat)
        cur_x, cur_y = proj.to_local(cur_wp.lon, cur_wp.lat)
        for local_surface in local_geoms.surfaces:
            crossing = segment_runway_crossing_length(
                prev_x,
                prev_y,
                cur_x,
                cur_y,
                local_surface.polygon,
            )
            if crossing > 0:
                wp_type = cur_wp.waypoint_type
                if wp_type == WaypointType.MEASUREMENT:
                    seq = wp_inspection_seq.get(j, 0)
                    key = (
                        seq,
                        f"{local_surface.surface_type} {local_surface.identifier}",
                    )
                    measurement_crossings.setdefault(key, []).append(j)
                else:
                    msg = (
                        f"wp {j}-{j + 1} ({wp_type}): crosses "
                        f"{local_surface.surface_type} {local_surface.identifier} "
                        f"({crossing:.0f}m)"
                    )
                    seen_msgs = {m for m, _ in warnings}
                    if msg not in seen_msgs:
                        wp_ids = [f"idx:{j - 1}", f"idx:{j}"]
                        warnings.append((msg, wp_ids))

    for (seq, surface_label), indices in measurement_crossings.items():
        count = len(indices)
        msg = f"inspection {seq} crosses {surface_label} during measurement ({count} segments)"
        wp_ids = []
        for wp_idx in indices:
            wp_ids.extend([f"idx:{wp_idx - 1}", f"idx:{wp_idx}"])
        seen: set[str] = set()
        unique_ids: list[str] = []
        for wid in wp_ids:
            if wid not in seen:
                seen.add(wid)
                unique_ids.append(wid)
        warnings.append((msg, unique_ids))

    # final validation of assembled path
    final_buffer = (
        data.mission.default_buffer_distance
        if data.mission.default_buffer_distance is not None
        else settings.vertex_buffer_m
    )
    final_violations = validate_inspection_pass(
        all_waypoints,
        drone,
        data.constraints,
        local_geoms,
        elevation_provider=provider,
        buffer_distance=final_buffer,
    )
    final_hard = [v for v in final_violations if not v.is_warning]
    if final_hard:
        raise TrajectoryGenerationError(
            "final validation failed",
            violations=[
                {
                    "message": v.message,
                    "violation_kind": v.violation_kind,
                    "constraint_id": v.constraint_id,
                    "waypoint_index": v.waypoint_index,
                }
                for v in final_hard
            ],
        )

    _format_soft_warnings(final_violations, "final validation", warnings)

    # final totals with trapezoidal speed profile
    total_dist = 0.0
    tl_fixed = TAKEOFF_DURATION + LANDING_DURATION if scope == "FULL" else 0.0
    total_dur = tl_fixed
    for j in range(len(all_waypoints)):
        if j > 0:
            prev = all_waypoints[j - 1]
            cur = all_waypoints[j]
            seg = distance_between(prev.lon, prev.lat, cur.lon, cur.lat)
            altitude_diff = cur.alt - prev.alt
            d = math.sqrt(seg**2 + altitude_diff**2)
            total_dist += d

            v_prev = max(
                prev.speed if prev.speed is not None else MIN_SPEED_FLOOR,
                MIN_SPEED_FLOOR,
            )
            v_cur = max(
                cur.speed if cur.speed is not None else MIN_SPEED_FLOOR,
                MIN_SPEED_FLOOR,
            )
            total_dur += _segment_duration_with_accel(d, v_prev, v_cur)

            # gimbal settle when transitioning between segment types
            if prev.waypoint_type != cur.waypoint_type and cur.waypoint_type in (
                WaypointType.MEASUREMENT,
                WaypointType.HOVER,
            ):
                total_dur += GIMBAL_SETTLE_TIME

        if all_waypoints[j].hover_duration is not None:
            total_dur += all_waypoints[j].hover_duration

    # battery check after all phases including transit durations
    if drone:
        bw = check_battery(total_dur, drone, DEFAULT_RESERVE_MARGIN)
        if bw:
            warnings.append((bw.message, []))

    # late import to break circular init - flight_plan_service imports from trajectory.types
    from app.services.flight_plan_service import persist_flight_plan

    flight_plan = persist_flight_plan(
        db,
        mission,
        all_waypoints,
        warnings,
        total_dist,
        total_dur,
        violations=papi_obstruction_violations,
        suggestions=suggestions,
    )

    # no hard violations at this point - mark flight plan as validated
    flight_plan.is_validated = True

    # transition to PLANNED only if still in DRAFT (skip if already PLANNED from regression)
    if mission.status == MissionStatus.DRAFT:
        mission.transition_to(MissionStatus.PLANNED)

    mission.has_unsaved_map_changes = False
    db.commit()

    return flight_plan, warnings


def _build_resolve_fn(mission: Mission, suggestions: list[tuple[str, list[str]]]):
    """build a closure that resolves an inspection config and returns (config, label).

    injects mission-level defaults (capture_mode, buffer_distance, measurement_speed_override)
    when neither inspection nor template sets them. also records suggestions for
    template-defaulted density.
    """

    def resolve_fn(inspection):
        """resolve config for an inspection, applying mission defaults."""
        template = inspection.template
        config = resolve_with_defaults(inspection, template)

        insp_cm = getattr(inspection.config, "capture_mode", None) if inspection.config else None
        tmpl_cm = (
            getattr(template.default_config, "capture_mode", None)
            if template.default_config
            else None
        )
        if insp_cm is None and tmpl_cm is None and mission.default_capture_mode:
            config.capture_mode = str(mission.default_capture_mode)

        insp_bd = getattr(inspection.config, "buffer_distance", None) if inspection.config else None
        tmpl_bd = (
            getattr(template.default_config, "buffer_distance", None)
            if template.default_config
            else None
        )
        if insp_bd is None and tmpl_bd is None and mission.default_buffer_distance is not None:
            config.buffer_distance = mission.default_buffer_distance

        insp_ms = (
            getattr(inspection.config, "measurement_speed_override", None)
            if inspection.config
            else None
        )
        tmpl_ms = (
            getattr(template.default_config, "measurement_speed_override", None)
            if template.default_config
            else None
        )
        if insp_ms is None and tmpl_ms is None and mission.measurement_speed_override is not None:
            config.measurement_speed_override = mission.measurement_speed_override

        label = f"{template.name} #{inspection.sequence_order}"

        if not inspection.config or inspection.config.measurement_density is None:
            default_density = (
                template.default_config.measurement_density
                if template.default_config and template.default_config.measurement_density
                else None
            )
            if default_density:
                suggestions.append(
                    (
                        f"{label}: no density override - using default ({default_density} pts)",
                        [],
                    )
                )

        return config, label

    return resolve_fn


def _assemble_measurements_only(
    inspection_passes: list[InspectionPass],
    all_waypoints: list[WaypointData],
    measurement_index_maps: list[dict[int, int]],
) -> list[int]:
    """concatenate measurement/hover waypoints from each pass. no takeoff/landing/transit."""
    pass_start_indices: list[int] = []
    for ipass in inspection_passes:
        idx_map: dict[int, int] = {}
        filtered_idx = 0
        for orig_idx, wp in enumerate(ipass.waypoints):
            if wp.waypoint_type in (WaypointType.MEASUREMENT, WaypointType.HOVER):
                idx_map[orig_idx] = filtered_idx
                filtered_idx += 1
        measurement_index_maps.append(idx_map)

        measurement_wps = [
            wp
            for wp in ipass.waypoints
            if wp.waypoint_type in (WaypointType.MEASUREMENT, WaypointType.HOVER)
        ]
        pass_start_indices.append(len(all_waypoints))
        all_waypoints.extend(measurement_wps)

    if not all_waypoints:
        raise TrajectoryGenerationError("no measurement waypoints generated")

    return pass_start_indices


def _assemble_no_takeoff_landing(
    mission: Mission,
    inspection_passes: list[InspectionPass],
    all_waypoints: list[WaypointData],
    local_geoms: LocalGeometries,
    provider,
    default_speed: float,
    transit_agl: float,
    mission_buffer_override,
    require_perpendicular: bool,
) -> list[int]:
    """no-takeoff-landing: start at transit altitude above takeoff, end above landing."""
    tc = _parse_coordinate(mission.takeoff_coordinate.data, "takeoff")
    if not inspection_passes[0].waypoints:
        raise TrajectoryGenerationError("first inspection produced no waypoints")
    first_wp = inspection_passes[0].waypoints[0]

    takeoff_alt = tc[2]
    if provider:
        takeoff_alt = provider.get_elevation(tc[1], tc[0])

    all_waypoints.append(
        WaypointData(
            lon=tc[0],
            lat=tc[1],
            alt=takeoff_alt + transit_agl,
            heading=bearing_between(tc[0], tc[1], first_wp.lon, first_wp.lat),
            speed=default_speed,
            waypoint_type=WaypointType.TRANSIT,
            camera_action=CameraAction.NONE,
        )
    )

    pass_start_indices: list[int] = []
    for i, ipass in enumerate(inspection_passes):
        if not ipass.waypoints:
            raise TrajectoryGenerationError(f"inspection pass {i} produced no waypoints")
        prev = all_waypoints[-1]
        start = ipass.waypoints[0]
        from_pt = _to_point3d(prev)
        to_pt = _to_point3d(start)

        transit_wps = compute_transit_path(
            from_pt,
            to_pt,
            local_geoms,
            default_speed,
            elevation_provider=provider,
            transit_agl=transit_agl,
            buffer_distance_override=mission_buffer_override,
            require_perpendicular_runway_crossing=require_perpendicular,
        )
        all_waypoints.extend(transit_wps)

        pass_start_indices.append(len(all_waypoints))
        all_waypoints.extend(ipass.waypoints)

    lc = _parse_coordinate(mission.landing_coordinate.data, "landing")
    landing_alt = lc[2]
    if provider:
        landing_alt = provider.get_elevation(lc[1], lc[0])

    last = all_waypoints[-1]
    from_pt = _to_point3d(last)
    # transit to above landing position at transit altitude (no ground-level LANDING)
    to_pt = _make_point3d(lc[0], lc[1], landing_alt + transit_agl)

    landing_transit = compute_transit_path(
        from_pt,
        to_pt,
        local_geoms,
        default_speed,
        elevation_provider=provider,
        transit_agl=transit_agl,
        buffer_distance_override=mission_buffer_override,
        require_perpendicular_runway_crossing=require_perpendicular,
    )
    all_waypoints.extend(landing_transit)

    return pass_start_indices


def _assemble_full_scope(
    mission: Mission,
    inspection_passes: list[InspectionPass],
    all_waypoints: list[WaypointData],
    local_geoms: LocalGeometries,
    provider,
    default_speed: float,
    transit_agl: float,
    mission_buffer_override,
    require_perpendicular: bool,
) -> list[int]:
    """FULL scope (default): takeoff at ground level -> climb -> transit -> landing."""
    if mission.takeoff_coordinate:
        tc = _parse_coordinate(mission.takeoff_coordinate.data, "takeoff")
        if not inspection_passes[0].waypoints:
            raise TrajectoryGenerationError("first inspection produced no waypoints")
        first_wp = inspection_passes[0].waypoints[0]

        takeoff_alt = tc[2]
        if provider:
            takeoff_alt = provider.get_elevation(tc[1], tc[0])

        all_waypoints.append(
            WaypointData(
                lon=tc[0],
                lat=tc[1],
                alt=takeoff_alt,
                heading=bearing_between(tc[0], tc[1], first_wp.lon, first_wp.lat),
                speed=default_speed,
                waypoint_type=WaypointType.TAKEOFF,
                camera_action=CameraAction.NONE,
            )
        )

        climb_alt = takeoff_alt + transit_agl
        all_waypoints.append(
            WaypointData(
                lon=tc[0],
                lat=tc[1],
                alt=climb_alt,
                heading=bearing_between(tc[0], tc[1], first_wp.lon, first_wp.lat),
                speed=default_speed,
                waypoint_type=WaypointType.TRANSIT,
                camera_action=CameraAction.NONE,
            )
        )

    pass_start_indices: list[int] = []
    for i, ipass in enumerate(inspection_passes):
        if not ipass.waypoints:
            raise TrajectoryGenerationError(f"inspection pass {i} produced no waypoints")
        if all_waypoints:
            prev = all_waypoints[-1]
            start = ipass.waypoints[0]
            from_pt = _to_point3d(prev)
            to_pt = _to_point3d(start)

            transit_wps = compute_transit_path(
                from_pt,
                to_pt,
                local_geoms,
                default_speed,
                elevation_provider=provider,
                transit_agl=transit_agl,
                buffer_distance_override=mission_buffer_override,
                require_perpendicular_runway_crossing=require_perpendicular,
            )
            all_waypoints.extend(transit_wps)

        pass_start_indices.append(len(all_waypoints))
        all_waypoints.extend(ipass.waypoints)

    # landing at ground level - transit handles descent via transit_agl
    if mission.landing_coordinate:
        lc = _parse_coordinate(mission.landing_coordinate.data, "landing")

        landing_alt = lc[2]
        if provider:
            landing_alt = provider.get_elevation(lc[1], lc[0])

        last = all_waypoints[-1]
        from_pt = _to_point3d(last)
        to_pt = _make_point3d(lc[0], lc[1], landing_alt)

        landing_transit = compute_transit_path(
            from_pt,
            to_pt,
            local_geoms,
            default_speed,
            elevation_provider=provider,
            transit_agl=transit_agl,
            buffer_distance_override=mission_buffer_override,
            require_perpendicular_runway_crossing=require_perpendicular,
        )
        all_waypoints.extend(landing_transit)

        all_waypoints.append(
            WaypointData(
                lon=lc[0],
                lat=lc[1],
                alt=landing_alt,
                heading=all_waypoints[-1].heading,
                speed=default_speed,
                waypoint_type=WaypointType.LANDING,
                camera_action=CameraAction.NONE,
            )
        )

    return pass_start_indices


def _to_point3d(wp: WaypointData):
    """build a Point3D from a waypoint's position fields."""
    return Point3D(lon=wp.lon, lat=wp.lat, alt=wp.alt)


def _make_point3d(lon: float, lat: float, alt: float):
    """build a Point3D from raw coordinates."""
    return Point3D(lon=lon, lat=lat, alt=alt)
