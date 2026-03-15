import math
from dataclasses import dataclass, field
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.agl import AGL
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.flight_plan import ConstraintRule
from app.models.inspection import Inspection, InspectionTemplate
from app.models.mission import DroneProfile, Mission
from app.schemas.geometry import parse_ewkb
from app.services.flight_plan_service import persist_flight_plan
from app.services.safety_validator import (
    check_battery,
    check_obstacle,
    segments_intersect_obstacle,
    segments_intersect_zone,
    validate_inspection_pass,
)
from app.utils.geo import (
    angular_span_at_distance,
    astar,
    bearing,
    centroid,
    destination_point,
    elevation_angle,
    haversine,
    total_path_distance,
)

# arc sweep defaults
MIN_ARC_RADIUS = 350.0
DEFAULT_SWEEP_ANGLE = 10.0  # degrees each side of centerline
DEFAULT_HORIZONTAL_DISTANCE = 400.0
MIN_ELEVATION_ANGLE = 1.9
MAX_ELEVATION_ANGLE = 6.5
DEFAULT_RESERVE_MARGIN = 0.15
HOVER_ANGLE_TOLERANCE = 0.3  # degrees
REROUTE_MARGIN = 1.2  # multiplier for obstacle radius when rerouting


@dataclass
class WaypointData:
    """intermediate waypoint before persisting"""

    lon: float
    lat: float
    alt: float
    heading: float = 0.0
    speed: float = 5.0
    waypoint_type: str = "MEASUREMENT"
    camera_action: str = "PHOTO_CAPTURE"
    camera_target: tuple[float, float, float] | None = None
    inspection_id: UUID | None = None
    hover_duration: float | None = None
    gimbal_pitch: float | None = None


@dataclass
class InspectionPass:
    """waypoints from a single inspection"""

    waypoints: list[WaypointData] = field(default_factory=list)
    inspection_id: UUID | None = None


@dataclass
class MissionData:
    """all data loaded in phase 1 - no further entity reads after this"""

    mission: Mission
    airport: Airport
    drone: DroneProfile | None
    obstacles: list[Obstacle]
    safety_zones: list[SafetyZone]
    surfaces: list[AirfieldSurface]
    constraints: list[ConstraintRule]
    default_speed: float


# phase 1


def _load_mission_data(db: Session, mission_id: UUID) -> MissionData:
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
        raise HTTPException(status_code=404, detail="mission not found")
    if not mission.inspections:
        raise HTTPException(status_code=400, detail="mission has no inspections")

    airport = db.query(Airport).filter(Airport.id == mission.airport_id).first()
    if not airport:
        raise HTTPException(status_code=400, detail="airport not found")

    obstacles = db.query(Obstacle).filter(Obstacle.airport_id == airport.id).all()
    safety_zones = (
        db.query(SafetyZone)
        .filter(SafetyZone.airport_id == airport.id, SafetyZone.is_active == True)  # noqa: E712
        .all()
    )
    surfaces = db.query(AirfieldSurface).filter(AirfieldSurface.airport_id == airport.id).all()
    constraints = (
        db.query(ConstraintRule)
        .filter(ConstraintRule.flight_plan_id == None)  # noqa: E711
        .all()
    )

    return MissionData(
        mission=mission,
        airport=airport,
        drone=mission.drone_profile,
        obstacles=obstacles,
        safety_zones=safety_zones,
        surfaces=surfaces,
        constraints=constraints,
        default_speed=mission.default_speed or 5.0,
    )


# phase 2 helpers


def _resolve_with_defaults(inspection, template) -> dict:
    """resolveWithDefaults - field-by-field merge: override > template > default"""
    defaults = {
        "altitude_offset": 0.0,
        "speed_override": None,
        "measurement_density": 8,
        "custom_tolerances": None,
        "density": None,
        "hover_duration": None,
    }
    result = dict(defaults)

    if template.default_config:
        for key in defaults:
            val = getattr(template.default_config, key, None)
            if val is not None:
                result[key] = val

    if inspection.config:
        for key in defaults:
            val = getattr(inspection.config, key, None)
            if val is not None:
                result[key] = val

    return result


def _get_lha_positions(template) -> list[tuple[float, float, float]]:
    positions = []
    for agl in template.targets:
        for lha in agl.lhas:
            c = parse_ewkb(lha.position.data)["coordinates"]
            positions.append((c[0], c[1], c[2]))

    return positions


def _get_lha_setting_angles(template) -> list[float]:
    angles = []
    for agl in template.targets:
        for lha in agl.lhas:
            if lha.setting_angle is not None:
                angles.append(lha.setting_angle)

    return sorted(angles)


def _get_glide_slope_angle(template) -> float:
    for agl in template.targets:
        if agl.glide_slope_angle:
            return agl.glide_slope_angle

    return 3.0


def _get_runway_heading(template, surfaces) -> float:
    for agl in template.targets:
        for surface in surfaces:
            if surface.id == agl.surface_id and surface.heading:
                return surface.heading

    return 0.0


def _check_speed_framerate(speed, drone) -> str | None:
    """isSpeedCompatibleWithFrameRate"""
    if not drone.camera_frame_rate:
        return None
    if drone.max_speed and speed > drone.max_speed * 0.8:
        return f"speed {speed:.1f} m/s may be too high for frame rate {drone.camera_frame_rate} fps"

    return None


def _check_sensor_fov(drone, lha_positions, distance) -> str | None:
    if not drone.sensor_fov or len(lha_positions) < 2:
        return None

    center = centroid(lha_positions)
    obs_lon, obs_lat = destination_point(center[0], center[1], 0.0, distance)
    span = angular_span_at_distance(lha_positions, obs_lon, obs_lat)

    if span > drone.sensor_fov:
        return (
            f"LHA array span {span:.1f} exceeds sensor FOV "
            f"{drone.sensor_fov:.1f} at {distance:.0f}m"
        )

    return None


# phase 3 - trajectory computation (section 3.3.9 interface methods)


def determine_start_position(
    center: tuple[float, float, float],
    config: dict,
    method: str,
    runway_heading: float,
    glide_slope: float,
) -> tuple[float, float, float]:
    """compute start position of inspection pass"""
    if method == "ANGULAR_SWEEP":
        radius = max(MIN_ARC_RADIUS, 350.0)
        angle = runway_heading + math.degrees(math.radians(-DEFAULT_SWEEP_ANGLE))
        lon, lat = destination_point(center[0], center[1], angle, radius)
        alt = center[2] + radius * math.tan(math.radians(glide_slope))

        return (lon, lat, alt + config["altitude_offset"])

    # vertical profile
    distance = DEFAULT_HORIZONTAL_DISTANCE
    approach_heading = (runway_heading + 180) % 360
    lon, lat = destination_point(center[0], center[1], approach_heading, distance)
    alt = center[2] + distance * math.tan(math.radians(MIN_ELEVATION_ANGLE))

    return (lon, lat, alt)


def determine_end_position(
    center: tuple[float, float, float],
    config: dict,
    method: str,
    runway_heading: float,
    glide_slope: float,
) -> tuple[float, float, float]:
    """compute end position of inspection pass"""
    if method == "ANGULAR_SWEEP":
        radius = max(MIN_ARC_RADIUS, 350.0)
        angle = runway_heading + math.degrees(math.radians(DEFAULT_SWEEP_ANGLE))
        lon, lat = destination_point(center[0], center[1], angle, radius)
        alt = center[2] + radius * math.tan(math.radians(glide_slope))

        return (lon, lat, alt + config["altitude_offset"])

    distance = DEFAULT_HORIZONTAL_DISTANCE
    approach_heading = (runway_heading + 180) % 360
    lon, lat = destination_point(center[0], center[1], approach_heading, distance)
    alt = center[2] + distance * math.tan(math.radians(MAX_ELEVATION_ANGLE))

    return (lon, lat, alt)


def calculate_arc_path(
    center: tuple[float, float, float],
    runway_heading: float,
    glide_slope_angle: float,
    config: dict,
    inspection_id: UUID | None,
    speed: float,
) -> list[WaypointData]:
    """equation 3.1 - angular sweep arc path"""
    density = config["measurement_density"]
    altitude_offset = config["altitude_offset"]
    radius = max(MIN_ARC_RADIUS, 350.0)
    half_sweep = DEFAULT_SWEEP_ANGLE

    arc_alt = center[2] + radius * math.tan(math.radians(glide_slope_angle)) + altitude_offset

    waypoints = []
    for i in range(density):
        if density > 1:
            theta = math.radians(-half_sweep + (2 * half_sweep / (density - 1)) * i)
        else:
            theta = 0.0

        angle = runway_heading + math.degrees(theta)
        lon, lat = destination_point(center[0], center[1], angle, radius)
        heading_to_center = bearing(lon, lat, center[0], center[1])

        # gimbal pitch = elevation angle from drone to LHA center (section 3.3.1)
        pitch = elevation_angle(lon, lat, arc_alt, center[0], center[1], center[2])

        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=arc_alt,
                heading=heading_to_center,
                speed=speed,
                waypoint_type="MEASUREMENT",
                camera_action="PHOTO_CAPTURE",
                camera_target=center,
                inspection_id=inspection_id,
                gimbal_pitch=pitch,
            )
        )

    return waypoints


def calculate_vertical_path(
    center: tuple[float, float, float],
    runway_heading: float,
    config: dict,
    inspection_id: UUID | None,
    speed: float,
    setting_angles: list[float],
) -> list[WaypointData]:
    """equation 3.2 - vertical profile with HOVER at transition angles"""
    density = config["measurement_density"]
    hover_duration = config.get("hover_duration")
    distance = DEFAULT_HORIZONTAL_DISTANCE

    approach_heading = (runway_heading + 180) % 360
    lon, lat = destination_point(center[0], center[1], approach_heading, distance)
    heading_to_center = bearing(lon, lat, center[0], center[1])

    waypoints = []
    for i in range(density):
        if density > 1:
            phi = (
                MIN_ELEVATION_ANGLE
                + (MAX_ELEVATION_ANGLE - MIN_ELEVATION_ANGLE) / (density - 1) * i
            )
        else:
            phi = (MIN_ELEVATION_ANGLE + MAX_ELEVATION_ANGLE) / 2

        alt = center[2] + distance * math.tan(math.radians(phi))
        pitch = elevation_angle(lon, lat, alt, center[0], center[1], center[2])

        is_transition = any(abs(phi - sa) < HOVER_ANGLE_TOLERANCE for sa in setting_angles)
        wp_type = "HOVER" if is_transition else "MEASUREMENT"
        wp_hover = hover_duration if is_transition else None

        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=alt,
                heading=heading_to_center,
                speed=speed,
                waypoint_type=wp_type,
                camera_action="PHOTO_CAPTURE",
                camera_target=center,
                inspection_id=inspection_id,
                hover_duration=wp_hover,
                gimbal_pitch=pitch,
            )
        )

    return waypoints


def compute_trajectory(
    inspection,
    config: dict,
    center,
    runway_heading,
    glide_slope,
    speed,
    setting_angles,
) -> list[WaypointData]:
    """computeTrajectory - section 3.3.9 interface"""
    if inspection.method == "ANGULAR_SWEEP":
        return calculate_arc_path(
            center,
            runway_heading,
            glide_slope,
            config,
            inspection.id,
            speed,
        )

    if inspection.method == "VERTICAL_PROFILE":
        return calculate_vertical_path(
            center,
            runway_heading,
            config,
            inspection.id,
            speed,
            setting_angles,
        )

    return []


# phase 3 - waypoint rerouting (section 3.3.5)


def reroute_path(
    db: Session, wp: WaypointData, obstacle: Obstacle, center: tuple | None
) -> WaypointData | None:
    """attempt to reroute waypoint around obstacle while preserving geometry"""
    if not obstacle.position:
        return None

    obs_pos = parse_ewkb(obstacle.position.data)["coordinates"]
    obs_radius = (obstacle.radius or 15.0) * REROUTE_MARGIN

    # shift waypoint laterally away from obstacle
    obs_bearing = bearing(wp.lon, wp.lat, obs_pos[0], obs_pos[1])
    away_bearing = (obs_bearing + 180) % 360
    new_lon, new_lat = destination_point(wp.lon, wp.lat, away_bearing, obs_radius)

    # if we have a center (measurement wp), check the rerouted point
    # preserves the measurement distance within tolerance
    if center:
        original_dist = haversine(wp.lon, wp.lat, center[0], center[1])
        new_dist = haversine(new_lon, new_lat, center[0], center[1])

        if abs(new_dist - original_dist) / original_dist > 0.1:
            return None  # can't preserve measurement geometry

    rerouted = WaypointData(
        lon=new_lon,
        lat=new_lat,
        alt=wp.alt,
        heading=wp.heading,
        speed=wp.speed,
        waypoint_type=wp.waypoint_type,
        camera_action=wp.camera_action,
        camera_target=wp.camera_target,
        inspection_id=wp.inspection_id,
        hover_duration=wp.hover_duration,
        gimbal_pitch=wp.gimbal_pitch,
    )

    # verify rerouted point doesn't still hit the obstacle
    v = check_obstacle(db, rerouted, obstacle)
    if v:
        return None

    return rerouted


# phase 4


def _apply_camera_actions(waypoints: list[WaypointData]):
    """lead-in/lead-out = NONE, inner = PHOTO_CAPTURE"""
    if len(waypoints) >= 2:
        waypoints[0].camera_action = "NONE"
        waypoints[-1].camera_action = "NONE"


def apply_constraints(
    db,
    waypoints,
    drone,
    constraints,
    obstacles,
    zones,
    surfaces,
) -> list[dict]:
    """applyConstraints - section 3.3.9 interface"""
    return validate_inspection_pass(
        db,
        waypoints,
        drone,
        constraints,
        obstacles,
        zones,
        surfaces,
    )


# phase 5 - visibility graph + A* transit (section 3.3.7)


def _extract_polygon_vertices(geom_data) -> list[tuple[float, float, float]]:
    """extract vertices from a PostGIS polygon geometry"""
    try:
        geojson = parse_ewkb(geom_data)
        if geojson["type"] == "Polygon":
            # first ring only (exterior)
            return [(c[0], c[1], c[2] if len(c) > 2 else 0.0) for c in geojson["coordinates"][0]]
    except Exception:
        pass

    return []


def compute_transit_path(
    db: Session,
    from_point: tuple[float, float, float],
    to_point: tuple[float, float, float],
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    speed: float,
) -> list[WaypointData]:
    """A* pathfinding on visibility graph - section 3.3.7"""
    # check if direct path is clear
    direct_clear = True
    for obs in obstacles:
        if segments_intersect_obstacle(
            db,
            from_point[0],
            from_point[1],
            to_point[0],
            to_point[1],
            obs,
        ):
            direct_clear = False
            break

    if direct_clear:
        for zone in zones:
            if segments_intersect_zone(
                db,
                from_point[0],
                from_point[1],
                to_point[0],
                to_point[1],
                zone,
            ):
                direct_clear = False
                break

    if direct_clear:
        # straight-line transit - no obstacles in the way
        return [
            WaypointData(
                lon=to_point[0],
                lat=to_point[1],
                alt=to_point[2],
                heading=bearing(
                    from_point[0],
                    from_point[1],
                    to_point[0],
                    to_point[1],
                ),
                speed=speed,
                waypoint_type="TRANSIT",
                camera_action="NONE",
            )
        ]

    # build visibility graph
    nodes: list[tuple[float, float, float]] = [from_point, to_point]

    for obs in obstacles:
        if obs.geometry:
            verts = _extract_polygon_vertices(obs.geometry.data)
            nodes.extend(verts)

    for zone in zones:
        if zone.geometry and zone.type in ("PROHIBITED", "TEMPORARY_NO_FLY"):
            verts = _extract_polygon_vertices(zone.geometry.data)
            nodes.extend(verts)

    # build adjacency list - edge exists if segment doesn't intersect obstacles
    graph: dict[int, list[tuple[int, float]]] = {i: [] for i in range(len(nodes))}

    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            blocked = False

            for obs in obstacles:
                if segments_intersect_obstacle(
                    db,
                    nodes[i][0],
                    nodes[i][1],
                    nodes[j][0],
                    nodes[j][1],
                    obs,
                ):
                    blocked = True
                    break

            if not blocked:
                for zone in zones:
                    if segments_intersect_zone(
                        db,
                        nodes[i][0],
                        nodes[i][1],
                        nodes[j][0],
                        nodes[j][1],
                        zone,
                    ):
                        blocked = True
                        break

            if not blocked:
                dist = haversine(nodes[i][0], nodes[i][1], nodes[j][0], nodes[j][1])
                graph[i].append((j, dist))
                graph[j].append((i, dist))

    # A* from node 0 (from_point) to node 1 (to_point)
    path = astar(graph, 0, 1, nodes)

    if path is None:
        raise HTTPException(
            status_code=400,
            detail="no obstacle-free transit path found between inspection segments",
        )

    # convert path to TRANSIT waypoints (skip first node - it's the from_point)
    transit_wps = []
    for idx in path[1:]:
        node = nodes[idx]
        prev = nodes[path[path.index(idx) - 1]] if path.index(idx) > 0 else from_point

        transit_wps.append(
            WaypointData(
                lon=node[0],
                lat=node[1],
                alt=node[2],
                heading=bearing(prev[0], prev[1], node[0], node[1]),
                speed=speed,
                waypoint_type="TRANSIT",
                camera_action="NONE",
            )
        )

    return transit_wps


# main pipeline


def generate_trajectory(db: Session, mission_id: UUID) -> tuple:
    """5-phase trajectory generation - thesis section 3.3"""

    # phase 1
    data = _load_mission_data(db, mission_id)
    mission = data.mission
    drone = data.drone
    default_speed = data.default_speed

    if mission.flight_plan:
        db.delete(mission.flight_plan)
        db.flush()

    warnings: list[str] = []
    inspection_passes: list[InspectionPass] = []
    cumulative_distance = 0.0
    cumulative_duration = 0.0

    sorted_inspections = sorted(mission.inspections, key=lambda i: i.sequence_order)

    for inspection in sorted_inspections:
        template = inspection.template

        # phase 2
        config = _resolve_with_defaults(inspection, template)
        speed = config["speed_override"] or default_speed

        if drone:
            w = _check_speed_framerate(speed, drone)
            if w:
                warnings.append(w)

        lha_positions = _get_lha_positions(template)
        if not lha_positions:
            warnings.append(f"inspection {inspection.id}: no LHA positions")
            continue

        center = centroid(lha_positions)
        glide_slope = _get_glide_slope_angle(template)
        rwy_heading = _get_runway_heading(template, data.surfaces)
        setting_angles = _get_lha_setting_angles(template)

        if drone:
            w = _check_sensor_fov(drone, lha_positions, max(MIN_ARC_RADIUS, 350.0))
            if w:
                warnings.append(w)

        # phase 3 - compute waypoints
        pass_wps = compute_trajectory(
            inspection,
            config,
            center,
            rwy_heading,
            glide_slope,
            speed,
            setting_angles,
        )

        # phase 3 - validate + reroute per-waypoint (section 3.3.5)
        violations = validate_inspection_pass(
            db,
            pass_wps,
            drone,
            data.constraints,
            data.obstacles,
            data.safety_zones,
            data.surfaces,
        )

        # attempt rerouting for obstacle violations
        obstacle_violations = [
            v
            for v in violations
            if not v["is_warning"] and "obstacle" in v.get("message", "").lower()
        ]

        if obstacle_violations:
            for i, wp in enumerate(pass_wps):
                for obs in data.obstacles:
                    v = check_obstacle(db, wp, obs)
                    if v:
                        rerouted = reroute_path(db, wp, obs, center)
                        if rerouted:
                            pass_wps[i] = rerouted
                            warnings.append(f"waypoint rerouted around {obs.name}")
                        else:
                            raise HTTPException(
                                status_code=400,
                                detail={
                                    "error": "obstacle cannot be avoided",
                                    "obstacle": obs.name,
                                },
                            )

            # re-validate after rerouting
            violations = validate_inspection_pass(
                db,
                pass_wps,
                drone,
                data.constraints,
                data.obstacles,
                data.safety_zones,
                data.surfaces,
            )

        hard = [v for v in violations if not v["is_warning"]]
        if hard:
            raise HTTPException(
                status_code=400,
                detail={"error": "hard constraint violation", "violations": hard},
            )

        soft = [v for v in violations if v["is_warning"]]
        warnings.extend([v["message"] for v in soft])

        # phase 4
        _apply_camera_actions(pass_wps)

        points = [(wp.lon, wp.lat, wp.alt) for wp in pass_wps]
        seg_dist = total_path_distance(points)
        seg_dur = seg_dist / max(speed, 0.1)

        for wp in pass_wps:
            if wp.hover_duration:
                seg_dur += wp.hover_duration

        cumulative_distance += seg_dist
        cumulative_duration += seg_dur

        if drone:
            bw = check_battery(cumulative_duration, drone, DEFAULT_RESERVE_MARGIN)
            if bw:
                warnings.append(bw["message"])

        inspection_passes.append(InspectionPass(waypoints=pass_wps, inspection_id=inspection.id))

    if not inspection_passes:
        raise HTTPException(status_code=400, detail="no waypoints generated")

    # phase 5 - final assembly with A* transit
    all_waypoints: list[WaypointData] = []

    # takeoff
    if mission.takeoff_coordinate:
        tc = parse_ewkb(mission.takeoff_coordinate.data)["coordinates"]
        first_wp = inspection_passes[0].waypoints[0]
        all_waypoints.append(
            WaypointData(
                lon=tc[0],
                lat=tc[1],
                alt=tc[2],
                heading=bearing(tc[0], tc[1], first_wp.lon, first_wp.lat),
                speed=default_speed,
                waypoint_type="TAKEOFF",
                camera_action="NONE",
            )
        )

    for i, ipass in enumerate(inspection_passes):
        # A* transit from previous endpoint to this pass start
        if all_waypoints:
            prev = all_waypoints[-1]
            start = ipass.waypoints[0]
            from_pt = (prev.lon, prev.lat, prev.alt)
            to_pt = (start.lon, start.lat, start.alt)

            transit_wps = compute_transit_path(
                db,
                from_pt,
                to_pt,
                data.obstacles,
                data.safety_zones,
                default_speed,
            )
            all_waypoints.extend(transit_wps)

        all_waypoints.extend(ipass.waypoints)

    # landing - route through A* like all other transit segments (section 3.3.7)
    if mission.landing_coordinate:
        lc = parse_ewkb(mission.landing_coordinate.data)["coordinates"]
        last = all_waypoints[-1]
        from_pt = (last.lon, last.lat, last.alt)
        to_pt = (lc[0], lc[1], lc[2])

        landing_transit = compute_transit_path(
            db,
            from_pt,
            to_pt,
            data.obstacles,
            data.safety_zones,
            default_speed,
        )

        # replace the last transit wp with LANDING type
        if landing_transit:
            landing_transit[-1].waypoint_type = "LANDING"
            all_waypoints.extend(landing_transit)
        else:
            all_waypoints.append(
                WaypointData(
                    lon=lc[0],
                    lat=lc[1],
                    alt=lc[2],
                    heading=bearing(last.lon, last.lat, lc[0], lc[1]),
                    speed=default_speed,
                    waypoint_type="LANDING",
                    camera_action="NONE",
                )
            )

    # final totals per-segment
    total_dist = 0.0
    total_dur = 0.0
    for j in range(len(all_waypoints)):
        if j > 0:
            prev = all_waypoints[j - 1]
            cur = all_waypoints[j]
            seg = haversine(prev.lon, prev.lat, cur.lon, cur.lat)
            dz = cur.alt - prev.alt
            d = math.sqrt(seg**2 + dz**2)
            total_dist += d
            total_dur += d / max(cur.speed, 0.1)

        if all_waypoints[j].hover_duration:
            total_dur += all_waypoints[j].hover_duration

    flight_plan = persist_flight_plan(
        db,
        mission,
        all_waypoints,
        warnings,
        total_dist,
        total_dur,
    )

    return flight_plan, warnings
