import math
from dataclasses import dataclass, field
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.agl import AGL
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.flight_plan import ConstraintRule
from app.models.inspection import (
    Inspection,
    InspectionTemplate,
)
from app.models.mission import DroneProfile, Mission
from app.schemas.geometry import parse_ewkb
from app.services.safety_validator import check_battery, validate_inspection_pass
from app.utils.geo import (
    angular_span_at_distance,
    bearing,
    centroid,
    destination_point,
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
HOVER_ANGLE_TOLERANCE = 0.3  # degrees - closeness to transition angle


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


@dataclass
class InspectionPass:
    """waypoints from a single inspection"""

    waypoints: list[WaypointData] = field(default_factory=list)
    inspection_id: UUID | None = None


@dataclass
class MissionData:
    """all data loaded in phase 1 - no further DB reads after this"""

    mission: Mission
    airport: Airport
    drone: DroneProfile | None
    obstacles: list[Obstacle]
    safety_zones: list[SafetyZone]
    surfaces: list[AirfieldSurface]
    constraints: list[ConstraintRule]
    default_speed: float


# phase 1 - load all data


def _load_mission_data(db: Session, mission_id: UUID) -> MissionData:
    """load everything needed for trajectory computation"""
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

    # constraints not tied to a specific flight plan
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


def _resolve_with_defaults(inspection: Inspection, template: InspectionTemplate) -> dict:
    """field-by-field merge: override > template default > hardcoded default"""
    defaults = {
        "altitude_offset": 0.0,
        "speed_override": None,
        "measurement_density": 8,
        "custom_tolerances": None,
        "density": None,
        "hover_duration": None,
    }

    result = dict(defaults)

    # apply template defaults
    if template.default_config:
        tc = template.default_config
        for key in defaults:
            val = getattr(tc, key, None) if hasattr(tc, key) else None
            if val is not None:
                result[key] = val

    # apply operator overrides
    if inspection.config:
        ic = inspection.config
        for key in defaults:
            val = getattr(ic, key, None) if hasattr(ic, key) else None
            if val is not None:
                result[key] = val

    return result


def _get_lha_positions(
    template: InspectionTemplate,
) -> list[tuple[float, float, float]]:
    """extract LHA positions from template targets - no DB needed after phase 1"""
    positions = []

    for agl in template.targets:
        for lha in agl.lhas:
            geojson = parse_ewkb(lha.position.data)
            c = geojson["coordinates"]
            positions.append((c[0], c[1], c[2]))

    return positions


def _get_lha_setting_angles(template: InspectionTemplate) -> list[float]:
    """get sorted setting angles from all LHAs in template targets"""
    angles = []

    for agl in template.targets:
        for lha in agl.lhas:
            if lha.setting_angle is not None:
                angles.append(lha.setting_angle)

    return sorted(angles)


def _get_glide_slope_angle(template: InspectionTemplate) -> float:
    """get glide slope angle from the first AGL target"""
    for agl in template.targets:
        if agl.glide_slope_angle:
            return agl.glide_slope_angle

    return 3.0


def _get_runway_heading(template: InspectionTemplate, surfaces: list) -> float:
    """get runway heading from the surface the first target AGL belongs to"""
    for agl in template.targets:
        for surface in surfaces:
            if surface.id == agl.surface_id and surface.heading:
                return surface.heading

    return 0.0


def _check_speed_framerate(speed: float, drone: DroneProfile) -> str | None:
    """check if speed is compatible with camera frame rate"""
    if not drone.camera_frame_rate:
        return None

    if drone.max_speed and speed > drone.max_speed * 0.8:
        return (
            f"speed {speed:.1f} m/s may be too high for "
            f"frame rate {drone.camera_frame_rate} fps"
        )

    return None


def _check_sensor_fov(
    drone: DroneProfile,
    lha_positions: list[tuple[float, float, float]],
    distance: float,
) -> str | None:
    """check if sensor FOV covers all 4 LHA units at given distance"""
    if not drone.sensor_fov or len(lha_positions) < 2:
        return None

    # compute angular span of LHA array from a point at given distance
    center = centroid(lha_positions)
    obs_lon, obs_lat = destination_point(center[0], center[1], 0.0, distance)
    span = angular_span_at_distance(lha_positions, obs_lon, obs_lat)

    if span > drone.sensor_fov:
        return (
            f"LHA array span {span:.1f}° exceeds sensor FOV "
            f"{drone.sensor_fov:.1f}° at {distance:.0f}m"
        )

    return None


# phase 3 - waypoint computation


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

    # altitude at glide slope angle and distance r
    arc_alt = center[2] + radius * math.tan(math.radians(glide_slope_angle)) + altitude_offset

    waypoints = []
    for i in range(density):
        # theta from -alpha to +alpha
        if density > 1:
            theta = math.radians(-half_sweep + (2 * half_sweep / (density - 1)) * i)
        else:
            theta = 0.0

        # equation 3.1: xi = xc + r*sin(theta), yi = yc + r*cos(theta)
        angle = runway_heading + math.degrees(theta)
        lon, lat = destination_point(center[0], center[1], angle, radius)

        heading_to_center = bearing(lon, lat, center[0], center[1])

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
    """equation 3.2 - vertical profile path with HOVER at transitions"""
    density = config["measurement_density"]
    hover_duration = config.get("hover_duration")
    distance = DEFAULT_HORIZONTAL_DISTANCE

    # fixed position on extended centerline, behind PAPI
    approach_heading = (runway_heading + 180) % 360
    lon, lat = destination_point(center[0], center[1], approach_heading, distance)

    heading_to_center = bearing(lon, lat, center[0], center[1])

    waypoints = []
    for i in range(density):
        # phi from min to max elevation
        if density > 1:
            phi = (
                MIN_ELEVATION_ANGLE
                + (MAX_ELEVATION_ANGLE - MIN_ELEVATION_ANGLE) / (density - 1) * i
            )
        else:
            phi = (MIN_ELEVATION_ANGLE + MAX_ELEVATION_ANGLE) / 2

        # equation 3.2: hi = d * tan(phi)
        alt = center[2] + distance * math.tan(math.radians(phi))

        # check if this is near a transition angle boundary
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
            )
        )

    return waypoints


# phase 4 - post-inspection processing


def _apply_camera_actions(waypoints: list[WaypointData]):
    """lead-in and lead-out waypoints get NONE camera action"""
    if len(waypoints) >= 2:
        waypoints[0].camera_action = "NONE"
        waypoints[-1].camera_action = "NONE"


def _segment_duration(points: list[tuple[float, float, float]], speed: float) -> float:
    """estimated time to fly a segment"""
    dist = total_path_distance(points)

    return dist / max(speed, 0.1)


# phase 5 - final assembly


def _build_transit_waypoint(
    from_wp: WaypointData,
    to_wp: WaypointData,
    speed: float,
) -> WaypointData:
    """straight-line transit from one point to another"""
    return WaypointData(
        lon=to_wp.lon,
        lat=to_wp.lat,
        alt=to_wp.alt,
        heading=bearing(from_wp.lon, from_wp.lat, to_wp.lon, to_wp.lat),
        speed=speed,
        waypoint_type="TRANSIT",
        camera_action="NONE",
    )


# main pipeline


def generate_trajectory(db: Session, mission_id: UUID) -> dict:
    """5-phase trajectory generation pipeline per thesis section 3.3"""

    # phase 1 - load mission data
    data = _load_mission_data(db, mission_id)
    mission = data.mission
    drone = data.drone
    default_speed = data.default_speed

    # delete existing flight plan if regenerating
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

        # phase 2 - resolve config, checks
        config = _resolve_with_defaults(inspection, template)
        speed = config["speed_override"] or default_speed

        if drone:
            w = _check_speed_framerate(speed, drone)
            if w:
                warnings.append(w)

        lha_positions = _get_lha_positions(template)
        if not lha_positions:
            warnings.append(f"inspection {inspection.id}: no LHA positions found")
            continue

        center = centroid(lha_positions)
        glide_slope = _get_glide_slope_angle(template)
        rwy_heading = _get_runway_heading(template, data.surfaces)

        # sensor FOV check
        if drone:
            radius = max(MIN_ARC_RADIUS, 350.0)
            w = _check_sensor_fov(drone, lha_positions, radius)
            if w:
                warnings.append(w)

        # phase 3 - compute waypoints
        if inspection.method == "ANGULAR_SWEEP":
            pass_wps = calculate_arc_path(
                center,
                rwy_heading,
                glide_slope,
                config,
                inspection.id,
                speed,
            )
        elif inspection.method == "VERTICAL_PROFILE":
            setting_angles = _get_lha_setting_angles(template)
            pass_wps = calculate_vertical_path(
                center,
                rwy_heading,
                config,
                inspection.id,
                speed,
                setting_angles,
            )
        else:
            warnings.append(f"unknown method: {inspection.method}")
            continue

        # validate this inspection pass immediately (phase 3)
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
                detail={
                    "error": "hard constraint violation",
                    "violations": hard,
                },
            )

        soft = [v for v in violations if v["is_warning"]]
        warnings.extend([v["message"] for v in soft])

        # phase 4 - post-inspection processing
        _apply_camera_actions(pass_wps)

        # running totals
        points = [(wp.lon, wp.lat, wp.alt) for wp in pass_wps]
        seg_dist = total_path_distance(points)
        seg_dur = _segment_duration(points, speed)

        # add hover durations
        for wp in pass_wps:
            if wp.hover_duration:
                seg_dur += wp.hover_duration

        cumulative_distance += seg_dist
        cumulative_duration += seg_dur

        # battery check after each pass
        if drone:
            bw = check_battery(cumulative_duration, drone, DEFAULT_RESERVE_MARGIN)
            if bw:
                warnings.append(bw["message"])

        inspection_passes.append(
            InspectionPass(
                waypoints=pass_wps,
                inspection_id=inspection.id,
            )
        )

    if not inspection_passes:
        raise HTTPException(status_code=400, detail="no waypoints generated")

    # phase 5 - final assembly
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
        # transit from previous endpoint to this pass start
        if all_waypoints:
            transit = _build_transit_waypoint(
                all_waypoints[-1],
                ipass.waypoints[0],
                default_speed,
            )
            all_waypoints.append(transit)

        all_waypoints.extend(ipass.waypoints)

    # landing
    if mission.landing_coordinate:
        lc = parse_ewkb(mission.landing_coordinate.data)["coordinates"]
        last = all_waypoints[-1]
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

    # compute final totals per-segment
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

    # persist via flight_plan_service
    from app.services.flight_plan_service import persist_flight_plan

    flight_plan = persist_flight_plan(
        db,
        mission,
        all_waypoints,
        warnings,
        total_dist,
        total_dur,
    )

    return {"flight_plan": flight_plan, "warnings": warnings}
