import math
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.agl import AGL
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.enums import CameraAction, InspectionMethod, SafetyZoneType, WaypointType
from app.models.flight_plan import ConstraintRule, FlightPlan
from app.models.inspection import Inspection, InspectionTemplate
from app.models.mission import Mission
from app.schemas.geometry import parse_ewkb
from app.services.flight_plan_service import persist_flight_plan
from app.services.safety_validator import (
    check_battery,
    check_obstacle,
    segments_intersect_obstacle,
    segments_intersect_zone,
    validate_inspection_pass,
)
from app.services.trajectory_types import (
    DEFAULT_GLIDE_SLOPE,
    DEFAULT_HEADING,
    DEFAULT_HORIZONTAL_DISTANCE,
    DEFAULT_OBSTACLE_RADIUS,
    DEFAULT_RESERVE_MARGIN,
    DEFAULT_SPEED,
    DEFAULT_SWEEP_ANGLE,
    HOVER_ANGLE_TOLERANCE,
    MAX_ELEVATION_ANGLE,
    MAX_REROUTE_DEVIATION,
    MAX_TURN_ANGLE,
    MIN_ARC_RADIUS,
    MIN_ELEVATION_ANGLE,
    MIN_LHA_FOR_FOV_CHECK,
    NORTH_BEARING,
    REROUTE_SEARCH_RADIUS_MULTIPLIER,
    SPEED_FRAMERATE_MARGIN,
    Degrees,
    InspectionPass,
    Meters,
    MetersPerSecond,
    MissionData,
    Point3D,
    ResolvedConfig,
    Violation,
    WaypointData,
)
from app.utils.geo import (
    angular_span_at_distance,
    astar,
    bearing_between,
    center_of_points,
    distance_between,
    elevation_angle,
    point_at_distance,
    total_path_distance,
)

# config fields that can be overridden per-inspection
CONFIG_FIELDS = (
    "altitude_offset",
    "speed_override",
    "measurement_density",
    "custom_tolerances",
    "density",
    "hover_duration",
    "horizontal_distance",
    "sweep_angle",
)


# phase 1 - load all data
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
        default_speed=mission.default_speed or DEFAULT_SPEED,
    )


# phase 2 - config resolution and pre-checks
def _overlay_config(result: ResolvedConfig, config) -> None:
    """overlay non-None fields from an ORM config onto resolved config"""
    for key in CONFIG_FIELDS:
        val = getattr(config, key, None)
        if val is not None:
            setattr(result, key, val)


def _resolve_with_defaults(inspection, template) -> ResolvedConfig:
    """resolveWithDefaults - field-by-field merge: override > template > hardcoded"""
    result = ResolvedConfig()

    if template.default_config:
        _overlay_config(result, template.default_config)

    if inspection.config:
        _overlay_config(result, inspection.config)

    return result


def _get_lha_positions(template) -> list[Point3D]:
    positions = []
    for agl in template.targets:
        for lha in agl.lhas:
            c = parse_ewkb(lha.position.data)["coordinates"]
            positions.append(Point3D(lon=c[0], lat=c[1], alt=c[2]))

    return positions


def _get_lha_setting_angles(template) -> list[Degrees]:
    angles = []
    for agl in template.targets:
        for lha in agl.lhas:
            if lha.setting_angle is not None:
                angles.append(lha.setting_angle)

    return sorted(angles)


def _get_glide_slope_angle(template) -> Degrees:
    for agl in template.targets:
        if agl.glide_slope_angle:
            return agl.glide_slope_angle

    return DEFAULT_GLIDE_SLOPE


def _get_runway_heading(template, surfaces) -> Degrees:
    for agl in template.targets:
        for surface in surfaces:
            if surface.id == agl.surface_id and surface.heading:
                return surface.heading

    return DEFAULT_HEADING


def compute_optimal_speed(
    path_distance: Meters,
    density: int,
    drone,
) -> MetersPerSecond | None:
    """compute speed that ensures camera captures at least one frame per waypoint spacing.
    at speed v and frame_rate f, the camera captures every v/f meters.
    for useful measurements, capture spacing must be <= waypoint spacing.
    so: v <= waypoint_spacing * frame_rate"""
    if not drone or not drone.camera_frame_rate or density < 2:
        return None

    waypoint_spacing = path_distance / (density - 1)
    optimal = waypoint_spacing * drone.camera_frame_rate

    # clamp to drone max speed with safety margin
    if drone.max_speed:
        optimal = min(optimal, drone.max_speed * SPEED_FRAMERATE_MARGIN)

    return round(optimal, 1)


def _check_speed_framerate(
    speed: MetersPerSecond,
    drone,
    optimal_speed: MetersPerSecond | None = None,
) -> str | None:
    """isSpeedCompatibleWithFrameRate - section 3.3.4"""
    if not drone.camera_frame_rate:
        return None

    if optimal_speed and speed > optimal_speed:
        return (
            f"speed {speed:.1f} m/s exceeds optimal {optimal_speed:.1f} m/s "
            f"for frame rate {drone.camera_frame_rate} fps"
        )

    if drone.max_speed and speed > drone.max_speed * SPEED_FRAMERATE_MARGIN:
        return f"speed {speed:.1f} m/s may be too high for frame rate {drone.camera_frame_rate} fps"

    return None


def _check_sensor_fov(drone, lha_positions: list[Point3D], distance: Meters) -> str | None:
    """checkSensorFOV - verify camera covers all LHA units at distance"""
    if not drone.sensor_fov or len(lha_positions) < MIN_LHA_FOR_FOV_CHECK:
        return None

    tuples = [p.to_tuple() for p in lha_positions]
    center = center_of_points(tuples)
    obs_lon, obs_lat = point_at_distance(center[0], center[1], NORTH_BEARING, distance)
    span = angular_span_at_distance(tuples, obs_lon, obs_lat)

    if span > drone.sensor_fov:
        return (
            f"LHA array span {span:.1f} exceeds sensor FOV "
            f"{drone.sensor_fov:.1f} at {distance:.0f}m"
        )

    return None


# phase 3 - trajectory computation (section 3.3.9 interface)
def determine_start_position(
    center: Point3D,
    config: ResolvedConfig,
    method: InspectionMethod,
    runway_heading: Degrees,
    glide_slope: Degrees,
) -> Point3D:
    """compute start position of inspection pass"""
    match method:
        case InspectionMethod.ANGULAR_SWEEP:
            radius = config.horizontal_distance or MIN_ARC_RADIUS
            half_sweep = config.sweep_angle or DEFAULT_SWEEP_ANGLE
            angle = runway_heading - half_sweep
            lon, lat = point_at_distance(center.lon, center.lat, angle, radius)
            alt = center.alt + radius * math.tan(math.radians(glide_slope))

            return Point3D(lon=lon, lat=lat, alt=alt + config.altitude_offset)

        case _:
            distance = config.horizontal_distance or DEFAULT_HORIZONTAL_DISTANCE
            approach = (runway_heading + 180) % 360
            lon, lat = point_at_distance(center.lon, center.lat, approach, distance)
            alt = center.alt + distance * math.tan(math.radians(MIN_ELEVATION_ANGLE))

            return Point3D(lon=lon, lat=lat, alt=alt)


def determine_end_position(
    center: Point3D,
    config: ResolvedConfig,
    method: InspectionMethod,
    runway_heading: Degrees,
    glide_slope: Degrees,
) -> Point3D:
    """compute end position of inspection pass"""
    match method:
        case InspectionMethod.ANGULAR_SWEEP:
            radius = config.horizontal_distance or MIN_ARC_RADIUS
            half_sweep = config.sweep_angle or DEFAULT_SWEEP_ANGLE
            angle = runway_heading + half_sweep
            lon, lat = point_at_distance(center.lon, center.lat, angle, radius)
            alt = center.alt + radius * math.tan(math.radians(glide_slope))

            return Point3D(lon=lon, lat=lat, alt=alt + config.altitude_offset)

        case _:
            distance = config.horizontal_distance or DEFAULT_HORIZONTAL_DISTANCE
            approach = (runway_heading + 180) % 360
            lon, lat = point_at_distance(center.lon, center.lat, approach, distance)
            alt = center.alt + distance * math.tan(math.radians(MAX_ELEVATION_ANGLE))

            return Point3D(lon=lon, lat=lat, alt=alt)


def calculate_arc_path(
    center: Point3D,
    runway_heading: Degrees,
    glide_slope_angle: Degrees,
    config: ResolvedConfig,
    inspection_id: UUID | None,
    speed: MetersPerSecond,
) -> list[WaypointData]:
    """equation 3.1 - angular sweep arc path"""
    density = config.measurement_density
    radius = config.horizontal_distance or MIN_ARC_RADIUS
    half_sweep = config.sweep_angle or DEFAULT_SWEEP_ANGLE
    glide_height = radius * math.tan(math.radians(glide_slope_angle))
    arc_alt = center.alt + glide_height + config.altitude_offset

    waypoints = []
    for i in range(density):
        # eq 3.1 - interpolate angle from -sweep to +sweep in density steps
        if density > 1:
            theta = math.radians(-half_sweep + (2 * half_sweep / (density - 1)) * i)
        else:
            # single measurement at runway centerline
            theta = 0.0

        angle = runway_heading + math.degrees(theta)
        lon, lat = point_at_distance(center.lon, center.lat, angle, radius)
        heading_to_center = bearing_between(lon, lat, center.lon, center.lat)

        # gimbal pitch = elevation angle from drone to LHA center (section 3.3.1)
        pitch = elevation_angle(lon, lat, arc_alt, center.lon, center.lat, center.alt)

        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=arc_alt,
                heading=heading_to_center,
                speed=speed,
                waypoint_type=WaypointType.MEASUREMENT,
                camera_action=CameraAction.PHOTO_CAPTURE,
                camera_target=center,
                inspection_id=inspection_id,
                gimbal_pitch=pitch,
            )
        )

    return waypoints


def calculate_vertical_path(
    center: Point3D,
    runway_heading: Degrees,
    config: ResolvedConfig,
    inspection_id: UUID | None,
    speed: MetersPerSecond,
    setting_angles: list[Degrees],
) -> list[WaypointData]:
    """equation 3.2 - vertical profile with HOVER at transition angles"""
    density = config.measurement_density
    hover_duration = config.hover_duration
    distance = config.horizontal_distance or DEFAULT_HORIZONTAL_DISTANCE

    approach_heading = (runway_heading + 180) % 360
    lon, lat = point_at_distance(center.lon, center.lat, approach_heading, distance)
    heading_to_center = bearing_between(lon, lat, center.lon, center.lat)

    waypoints = []
    for i in range(density):
        # eq 3.2 - interpolate elevation from min to max in density steps
        if density > 1:
            elevation = (
                MIN_ELEVATION_ANGLE
                + (MAX_ELEVATION_ANGLE - MIN_ELEVATION_ANGLE) / (density - 1) * i
            )
        else:
            # single measurement at midpoint elevation
            elevation = (MIN_ELEVATION_ANGLE + MAX_ELEVATION_ANGLE) / 2

        # eq 3.2 - altitude at elevation angle from center
        alt = center.alt + distance * math.tan(math.radians(elevation))
        pitch = elevation_angle(lon, lat, alt, center.lon, center.lat, center.alt)

        # hover at LHA setting angle boundaries (section 3.3.4)
        is_transition = any(abs(elevation - sa) < HOVER_ANGLE_TOLERANCE for sa in setting_angles)
        wp_type = WaypointType.HOVER if is_transition else WaypointType.MEASUREMENT
        wp_hover = hover_duration if is_transition else None

        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=alt,
                heading=heading_to_center,
                speed=speed,
                waypoint_type=wp_type,
                camera_action=CameraAction.PHOTO_CAPTURE,
                camera_target=center,
                inspection_id=inspection_id,
                hover_duration=wp_hover,
                gimbal_pitch=pitch,
            )
        )

    return waypoints


def compute_measurement_trajectory(
    inspection,
    config: ResolvedConfig,
    center: Point3D,
    runway_heading: Degrees,
    glide_slope: Degrees,
    speed: MetersPerSecond,
    setting_angles: list[Degrees],
) -> list[WaypointData]:
    """computeTrajectory - section 3.3.9"""
    if inspection.method == InspectionMethod.ANGULAR_SWEEP:
        return calculate_arc_path(center, runway_heading, glide_slope, config, inspection.id, speed)

    if inspection.method == InspectionMethod.VERTICAL_PROFILE:
        return calculate_vertical_path(
            center, runway_heading, config, inspection.id, speed, setting_angles
        )

    return []


# shared visibility graph infrastructure
HARD_ZONE_TYPES = (SafetyZoneType.PROHIBITED, SafetyZoneType.TEMPORARY_NO_FLY)


def _extract_polygon_vertices(geom_data) -> list[Point3D]:
    """extract vertices from a PostGIS polygon geometry"""
    try:
        geojson = parse_ewkb(geom_data)
        if geojson["type"] == "Polygon":
            return [
                Point3D(lon=c[0], lat=c[1], alt=c[2] if len(c) > 2 else 0.0)
                for c in geojson["coordinates"][0]
            ]
    except Exception:
        pass

    return []


def _collect_nearby_objects(
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    center_lon: float,
    center_lat: float,
    search_radius: Meters,
) -> tuple[list[Obstacle], list[SafetyZone]]:
    """collect obstacles and hard safety zones within search_radius"""
    nearby_obs = []
    for obs in obstacles:
        if not obs.position:
            continue
        obs_pos = parse_ewkb(obs.position.data)["coordinates"]
        if distance_between(center_lon, center_lat, obs_pos[0], obs_pos[1]) <= search_radius:
            nearby_obs.append(obs)

    nearby_zones = []
    for zone in zones:
        if not zone.geometry or zone.type not in HARD_ZONE_TYPES:
            continue

        # approximate zone distance by checking if zone center is within range
        verts = _extract_polygon_vertices(zone.geometry.data)
        if verts:
            zone_center = center_of_points([v.to_tuple() for v in verts])
            zone_dist = distance_between(center_lon, center_lat, zone_center[0], zone_center[1])
            if zone_dist <= search_radius:
                nearby_zones.append(zone)

    return nearby_obs, nearby_zones


def _is_segment_blocked(
    db: Session,
    from_pt: Point3D,
    to_pt: Point3D,
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
) -> bool:
    """check if a straight-line segment is blocked by obstacles or hard zones"""
    for obs in obstacles:
        if segments_intersect_obstacle(db, from_pt.lon, from_pt.lat, to_pt.lon, to_pt.lat, obs):
            return True

    for zone in zones:
        if segments_intersect_zone(db, from_pt.lon, from_pt.lat, to_pt.lon, to_pt.lat, zone):
            return True

    return False


def _build_visibility_graph(
    db: Session,
    nodes: list[Point3D],
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
) -> dict[int, list[tuple[int, float]]]:
    """build adjacency list - edge between nodes if segment is unobstructed"""
    graph: dict[int, list[tuple[int, float]]] = {i: [] for i in range(len(nodes))}

    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            if not _is_segment_blocked(db, nodes[i], nodes[j], obstacles, zones):
                dist = distance_between(nodes[i].lon, nodes[i].lat, nodes[j].lon, nodes[j].lat)
                graph[i].append((j, dist))
                graph[j].append((i, dist))

    return graph


def _collect_graph_nodes(
    endpoints: list[Point3D],
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
) -> list[Point3D]:
    """collect all nodes for visibility graph: endpoints + obstacle/zone vertices"""
    nodes = list(endpoints)

    for obs in obstacles:
        if obs.geometry:
            nodes.extend(_extract_polygon_vertices(obs.geometry.data))

    for zone in zones:
        if zone.geometry and zone.type in HARD_ZONE_TYPES:
            nodes.extend(_extract_polygon_vertices(zone.geometry.data))

    return nodes


def _run_astar(
    db: Session,
    from_point: Point3D,
    to_point: Point3D,
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
) -> list[Point3D] | None:
    """build visibility graph and run A* - returns path as Point3D list or None"""
    nodes = _collect_graph_nodes([from_point, to_point], obstacles, zones)
    graph = _build_visibility_graph(db, nodes, obstacles, zones)
    node_tuples = [n.to_tuple() for n in nodes]

    path_indices = astar(graph, 0, 1, node_tuples)
    if path_indices is None:
        return None

    return [nodes[idx] for idx in path_indices]


def has_line_of_sight(
    db: Session,
    point: Point3D,
    target: Point3D,
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
) -> bool:
    """check if line from point to target is clear of obstacles and hard zones"""
    return not _is_segment_blocked(db, point, target, obstacles, zones)


def _max_turn_angle(waypoints: list[WaypointData]) -> Degrees:
    """max turn angle between consecutive waypoint headings"""
    max_angle = 0.0
    for i in range(1, len(waypoints)):
        diff = abs(waypoints[i].heading - waypoints[i - 1].heading)
        if diff > 180:
            diff = 360 - diff
        max_angle = max(max_angle, diff)

    return max_angle


# phase 3 - A* inspection rerouting (section 3.3.5)
# A* transit finds any shortest obstacle-free path, but measurement waypoints
# must be at specific positions for camera accuracy. this function finds
# alternative positions that still preserve measurement geometry (distance
# to center, line-of-sight to PAPI, max turn angle).
def resolve_inspection_collisions(
    db: Session,
    waypoints: list[WaypointData],
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    center: Point3D,
) -> list[WaypointData]:
    """A*-based rerouting around obstacles and safety zones"""
    # find colliding waypoints
    collisions = [False] * len(waypoints)
    for i, wp in enumerate(waypoints):
        for obs in obstacles:
            if check_obstacle(db, wp, obs):
                collisions[i] = True
                break

    if not any(collisions):
        return waypoints

    # find contiguous collision segments
    segments: list[tuple[int, int]] = []
    seg_start = None
    for i, hit in enumerate(collisions):
        if hit and seg_start is None:
            seg_start = i
        elif not hit and seg_start is not None:
            segments.append((seg_start, i - 1))
            seg_start = None
    if seg_start is not None:
        segments.append((seg_start, len(waypoints) - 1))

    result = list(waypoints)

    for seg_start, seg_end in segments:
        if seg_start == 0 or seg_end == len(waypoints) - 1:
            raise HTTPException(
                status_code=400,
                detail="obstacle at measurement pass boundary - cannot reroute",
            )

        anchor_before = result[seg_start - 1]
        anchor_after = result[seg_end + 1]
        from_pt = Point3D(lon=anchor_before.lon, lat=anchor_before.lat, alt=anchor_before.alt)
        to_pt = Point3D(lon=anchor_after.lon, lat=anchor_after.lat, alt=anchor_after.alt)

        # collect nearby obstacles AND safety zones
        mid_lon = (from_pt.lon + to_pt.lon) / 2
        mid_lat = (from_pt.lat + to_pt.lat) / 2
        max_radius = max((obs.radius or DEFAULT_OBSTACLE_RADIUS) for obs in obstacles)
        search_radius = max_radius * REROUTE_SEARCH_RADIUS_MULTIPLIER
        nearby_obs, nearby_zones = _collect_nearby_objects(
            obstacles, zones, mid_lon, mid_lat, search_radius
        )

        # A* through local visibility graph
        path = _run_astar(db, from_pt, to_pt, nearby_obs, nearby_zones)
        if path is None:
            raise HTTPException(
                status_code=400,
                detail="no obstacle-free reroute path found",
            )

        # build rerouted waypoints (skip anchors at index 0 and -1)
        rerouted_wps = []
        for node in path[1:-1]:
            heading = bearing_between(node.lon, node.lat, center.lon, center.lat)
            pitch = elevation_angle(
                node.lon,
                node.lat,
                node.alt,
                center.lon,
                center.lat,
                center.alt,
            )

            rerouted_wps.append(
                WaypointData(
                    lon=node.lon,
                    lat=node.lat,
                    alt=node.alt,
                    heading=heading,
                    speed=anchor_before.speed,
                    waypoint_type=WaypointType.MEASUREMENT,
                    camera_action=CameraAction.PHOTO_CAPTURE,
                    camera_target=center,
                    inspection_id=anchor_before.inspection_id,
                    gimbal_pitch=pitch,
                )
            )

        # validate: path deviation
        original_pts = [
            (result[k].lon, result[k].lat, result[k].alt) for k in range(seg_start, seg_end + 1)
        ]
        rerouted_pts = [(w.lon, w.lat, w.alt) for w in rerouted_wps]
        original_dist = total_path_distance(original_pts)
        rerouted_dist = total_path_distance(rerouted_pts) if rerouted_pts else 0.0

        if original_dist > 0 and rerouted_dist > original_dist * (1 + MAX_REROUTE_DEVIATION):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"rerouted path {rerouted_dist:.0f}m exceeds "
                    f"{MAX_REROUTE_DEVIATION:.0%} deviation"
                ),
            )

        # validate: line-of-sight to PAPI center
        for wp in rerouted_wps:
            wp_pt = Point3D(lon=wp.lon, lat=wp.lat, alt=wp.alt)
            if not has_line_of_sight(db, wp_pt, center, nearby_obs, nearby_zones):
                raise HTTPException(
                    status_code=400,
                    detail="rerouted path blocks camera line-of-sight to PAPI",
                )

        # validate: turn angle
        if rerouted_wps and _max_turn_angle(rerouted_wps) > MAX_TURN_ANGLE:
            raise HTTPException(
                status_code=400,
                detail=f"rerouted path exceeds max turn angle {MAX_TURN_ANGLE}",
            )

        result[seg_start : seg_end + 1] = rerouted_wps

    return result


# phase 4 - post-inspection processing
def _apply_camera_actions(waypoints: list[WaypointData]):
    """lead-in/lead-out = NONE, inner = PHOTO_CAPTURE"""
    if len(waypoints) >= 2:
        waypoints[0].camera_action = CameraAction.NONE
        waypoints[-1].camera_action = CameraAction.NONE


def apply_constraints(
    db, waypoints, drone, constraints, obstacles, zones, surfaces
) -> list[Violation]:
    """applyConstraints - section 3.3.9 interface"""
    return validate_inspection_pass(db, waypoints, drone, constraints, obstacles, zones, surfaces)


# phase 5 - A* transit between inspection passes (section 3.3.7)
def compute_transit_path(
    db: Session,
    from_point: Point3D,
    to_point: Point3D,
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    speed: MetersPerSecond,
) -> list[WaypointData]:
    """A* transit path - shortest obstacle-free route"""
    # straight-line if path is clear
    if not _is_segment_blocked(db, from_point, to_point, obstacles, zones):
        return [
            WaypointData(
                lon=to_point.lon,
                lat=to_point.lat,
                alt=to_point.alt,
                heading=bearing_between(from_point.lon, from_point.lat, to_point.lon, to_point.lat),
                speed=speed,
                waypoint_type=WaypointType.TRANSIT,
                camera_action=CameraAction.NONE,
            )
        ]

    # A* through visibility graph
    path = _run_astar(db, from_point, to_point, obstacles, zones)
    if path is None:
        raise HTTPException(
            status_code=400,
            detail="no obstacle-free transit path found",
        )

    # convert to TRANSIT waypoints (skip from_point at index 0)
    transit_wps = []
    for k in range(1, len(path)):
        prev, cur = path[k - 1], path[k]
        transit_wps.append(
            WaypointData(
                lon=cur.lon,
                lat=cur.lat,
                alt=cur.alt,
                heading=bearing_between(prev.lon, prev.lat, cur.lon, cur.lat),
                speed=speed,
                waypoint_type=WaypointType.TRANSIT,
                camera_action=CameraAction.NONE,
            )
        )

    return transit_wps


# main pipeline
def generate_trajectory(db: Session, mission_id: UUID) -> tuple[FlightPlan, list[str]]:
    """5-phase trajectory generation - thesis section 3.3"""

    # phase 1 - load all data
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

        # phase 2 - resolve config and pre-checks
        config = _resolve_with_defaults(inspection, template)

        lha_positions = _get_lha_positions(template)
        if not lha_positions:
            warnings.append(f"inspection {inspection.id}: no LHA positions")
            continue

        center = Point3D.from_tuple(center_of_points([p.to_tuple() for p in lha_positions]))
        glide_slope = _get_glide_slope_angle(template)
        rwy_heading = _get_runway_heading(template, data.surfaces)
        setting_angles = _get_lha_setting_angles(template)

        # compute optimal speed from path geometry and camera frame rate
        start_pos = determine_start_position(
            center, config, inspection.method, rwy_heading, glide_slope
        )
        end_pos = determine_end_position(
            center, config, inspection.method, rwy_heading, glide_slope
        )
        path_dist = distance_between(start_pos.lon, start_pos.lat, end_pos.lon, end_pos.lat)
        optimal_speed = compute_optimal_speed(path_dist, config.measurement_density, drone)

        if config.speed_override:
            speed = config.speed_override
        elif optimal_speed:
            speed = optimal_speed
            # save computed speed back to config so the operator can see it
            if inspection.config:
                inspection.config.speed_override = optimal_speed
            warnings.append(
                f"inspection {inspection.id}: speed auto-set to "
                f"{optimal_speed:.1f} m/s based on path geometry and frame rate"
            )
        else:
            speed = default_speed

        if drone:
            warning = _check_speed_framerate(speed, drone, optimal_speed)
            if warning:
                warnings.append(warning)

        if drone:
            warning = _check_sensor_fov(drone, lha_positions, MIN_ARC_RADIUS)
            if warning:
                warnings.append(warning)

        # phase 3 - compute waypoints
        pass_wps = compute_measurement_trajectory(
            inspection, config, center, rwy_heading, glide_slope, speed, setting_angles
        )

        # phase 3 - validate and reroute (section 3.3.5)
        violations = validate_inspection_pass(
            db, pass_wps, drone, data.constraints, data.obstacles, data.safety_zones, data.surfaces
        )

        obstacle_violations = [
            v for v in violations if not v.is_warning and "obstacle" in (v.message or "").lower()
        ]

        if obstacle_violations:
            pass_wps = resolve_inspection_collisions(
                db, pass_wps, data.obstacles, data.safety_zones, center
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

        hard = [v for v in violations if not v.is_warning]
        if hard:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "hard constraint violation",
                    "violations": [{"message": v.message} for v in hard],
                },
            )

        soft = [v for v in violations if v.is_warning]
        warnings.extend([v.message for v in soft])

        # phase 4 - post-inspection processing
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
                warnings.append(bw.message)

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
                heading=bearing_between(tc[0], tc[1], first_wp.lon, first_wp.lat),
                speed=default_speed,
                waypoint_type=WaypointType.TAKEOFF,
                camera_action=CameraAction.NONE,
            )
        )

    for i, ipass in enumerate(inspection_passes):
        # A* transit from previous endpoint to this pass start
        if all_waypoints:
            prev = all_waypoints[-1]
            start = ipass.waypoints[0]
            from_pt = Point3D(lon=prev.lon, lat=prev.lat, alt=prev.alt)
            to_pt = Point3D(lon=start.lon, lat=start.lat, alt=start.alt)

            transit_wps = compute_transit_path(
                db, from_pt, to_pt, data.obstacles, data.safety_zones, default_speed
            )
            all_waypoints.extend(transit_wps)

        all_waypoints.extend(ipass.waypoints)

    # landing via A* transit (section 3.3.7)
    if mission.landing_coordinate:
        lc = parse_ewkb(mission.landing_coordinate.data)["coordinates"]
        last = all_waypoints[-1]
        from_pt = Point3D(lon=last.lon, lat=last.lat, alt=last.alt)
        to_pt = Point3D(lon=lc[0], lat=lc[1], alt=lc[2])

        landing_transit = compute_transit_path(
            db, from_pt, to_pt, data.obstacles, data.safety_zones, default_speed
        )

        if landing_transit:
            landing_transit[-1].waypoint_type = WaypointType.LANDING
            all_waypoints.extend(landing_transit)
        else:
            all_waypoints.append(
                WaypointData(
                    lon=lc[0],
                    lat=lc[1],
                    alt=lc[2],
                    heading=bearing_between(last.lon, last.lat, lc[0], lc[1]),
                    speed=default_speed,
                    waypoint_type=WaypointType.LANDING,
                    camera_action=CameraAction.NONE,
                )
            )

    # final validation of assembled path (section 3.4.2)
    final_violations = validate_inspection_pass(
        db,
        all_waypoints,
        drone,
        data.constraints,
        data.obstacles,
        data.safety_zones,
        data.surfaces,
    )
    final_hard = [v for v in final_violations if not v.is_warning]
    if final_hard:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "final validation failed",
                "violations": [{"message": v.message} for v in final_hard],
            },
        )

    final_soft = [v for v in final_violations if v.is_warning]
    warnings.extend([v.message for v in final_soft])

    # compute final totals per-segment
    total_dist = 0.0
    total_dur = 0.0
    for j in range(len(all_waypoints)):
        if j > 0:
            prev = all_waypoints[j - 1]
            cur = all_waypoints[j]
            seg = distance_between(prev.lon, prev.lat, cur.lon, cur.lat)
            altitude_diff = cur.alt - prev.alt
            d = math.sqrt(seg**2 + altitude_diff**2)
            total_dist += d
            total_dur += d / max(cur.speed, 0.1)

        if all_waypoints[j].hover_duration:
            total_dur += all_waypoints[j].hover_duration

    flight_plan = persist_flight_plan(db, mission, all_waypoints, warnings, total_dist, total_dur)

    return flight_plan, warnings
