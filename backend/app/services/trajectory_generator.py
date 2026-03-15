import math
from dataclasses import dataclass, field
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.agl import AGL, LHA
from app.models.airport import AirfieldSurface, Airport
from app.models.flight_plan import ConstraintRule, FlightPlan, ValidationResult, Waypoint
from app.models.inspection import Inspection, InspectionConfiguration, InspectionTemplate
from app.models.mission import Mission
from app.schemas.geometry import parse_ewkb
from app.services.safety_validator import validate_waypoints
from app.utils.geo import bearing, centroid, destination_point, total_path_distance

# arc sweep defaults
MIN_ARC_RADIUS = 350.0
DEFAULT_SWEEP_ANGLE = 10.0  # degrees each side of centerline
DEFAULT_HORIZONTAL_DISTANCE = 400.0
MIN_ELEVATION_ANGLE = 1.9
MAX_ELEVATION_ANGLE = 6.5


@dataclass
class WaypointData:
    """intermediate waypoint representation before persisting"""

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
class GenerationResult:
    """result of trajectory generation"""

    waypoints: list[WaypointData] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    total_distance: float = 0.0
    estimated_duration: float = 0.0


def _resolve_config(
    inspection: Inspection, template: InspectionTemplate
) -> InspectionConfiguration:
    """merge inspection override config with template defaults"""
    if inspection.config:
        return inspection.config
    if template.default_config:
        return template.default_config

    # fallback - empty config
    return InspectionConfiguration(
        altitude_offset=0.0,
        speed_override=5.0,
        measurement_density=8,
    )


def _get_lha_positions(
    template: InspectionTemplate, db: Session
) -> list[tuple[float, float, float]]:
    """get LHA positions for template targets"""
    positions = []

    for agl in template.targets:
        lhas = db.query(LHA).filter(LHA.agl_id == agl.id).all()
        for lha in lhas:
            geojson = parse_ewkb(lha.position.data)
            c = geojson["coordinates"]
            positions.append((c[0], c[1], c[2]))

    return positions


def _get_runway_heading(agl: AGL, db: Session) -> float:
    """get runway heading for the surface this AGL belongs to"""
    surface = db.query(AirfieldSurface).filter(AirfieldSurface.id == agl.surface_id).first()
    if surface and surface.heading:
        return surface.heading

    return 0.0


def _check_speed_framerate(speed: float, drone: object) -> str | None:
    """check if speed is compatible with camera frame rate"""
    if not hasattr(drone, "camera_frame_rate") or not drone.camera_frame_rate:
        return None

    # at the given speed, ensure frame rate provides enough overlap
    # rough check: if speed > max_speed * 0.8, warn
    if drone.max_speed and speed > drone.max_speed * 0.8:
        return f"speed {speed} m/s may be too high for frame rate {drone.camera_frame_rate} fps"

    return None


def calculate_arc_path(
    center: tuple[float, float, float],
    runway_heading: float,
    config: InspectionConfiguration,
    inspection_id: UUID,
    speed: float,
) -> list[WaypointData]:
    """phase 3 - angular sweep waypoints along an arc"""
    density = config.measurement_density or 8
    altitude_offset = config.altitude_offset or 0.0
    radius = max(MIN_ARC_RADIUS, 350.0)
    half_sweep = DEFAULT_SWEEP_ANGLE

    # arc center at glide slope altitude
    arc_alt = center[2] + altitude_offset

    # compute waypoints along the arc
    waypoints = []
    for i in range(density):
        theta = math.radians(-half_sweep + (2 * half_sweep / max(density - 1, 1)) * i)

        # arc formula: xi = xc + r*sin(theta), yi = yc + r*cos(theta)
        # in geographic coords, use destination_point from center
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
    config: InspectionConfiguration,
    inspection_id: UUID,
    speed: float,
) -> list[WaypointData]:
    """phase 3 - vertical profile waypoints at varying altitude"""
    density = config.measurement_density or 8
    distance = DEFAULT_HORIZONTAL_DISTANCE

    # fixed horizontal position at distance from center
    approach_heading = (runway_heading + 180) % 360
    lon, lat = destination_point(center[0], center[1], approach_heading, distance)

    waypoints = []
    for i in range(density):
        # elevation angle from min to max
        angle_range = MAX_ELEVATION_ANGLE - MIN_ELEVATION_ANGLE
        phi = MIN_ELEVATION_ANGLE + angle_range / max(density - 1, 1) * i
        alt = center[2] + distance * math.tan(math.radians(phi))

        heading_to_center = bearing(lon, lat, center[0], center[1])

        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=alt,
                heading=heading_to_center,
                speed=speed,
                waypoint_type="MEASUREMENT",
                camera_action="PHOTO_CAPTURE",
                camera_target=center,
                inspection_id=inspection_id,
            )
        )

    return waypoints


def generate_trajectory(db: Session, mission_id: UUID) -> FlightPlan:
    """5-phase trajectory generation pipeline"""

    # phase 1 - load mission data
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
            .joinedload(InspectionTemplate.targets),
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

    drone = mission.drone_profile
    default_speed = mission.default_speed or 5.0

    # delete existing flight plan if regenerating
    if mission.flight_plan:
        db.delete(mission.flight_plan)
        db.flush()

    result = GenerationResult()
    sorted_inspections = sorted(mission.inspections, key=lambda i: i.sequence_order)

    # phase 2 + 3 - inspection loop and waypoint computation
    for inspection in sorted_inspections:
        template = inspection.template
        config = _resolve_config(inspection, template)
        speed = config.speed_override or default_speed

        # speed/framerate check
        if drone:
            warning = _check_speed_framerate(speed, drone)
            if warning:
                result.warnings.append(warning)

        # compute LHA center point
        lha_positions = _get_lha_positions(template, db)
        if not lha_positions:
            result.warnings.append(f"inspection {inspection.id}: no LHA positions found")
            continue

        center = centroid(lha_positions)

        # get runway heading for arc computation
        first_agl = template.targets[0] if template.targets else None
        runway_heading = _get_runway_heading(first_agl, db) if first_agl else 0.0

        # phase 3 - compute waypoints based on method
        if inspection.method == "ANGULAR_SWEEP":
            waypoints = calculate_arc_path(center, runway_heading, config, inspection.id, speed)
        elif inspection.method == "VERTICAL_PROFILE":
            waypoints = calculate_vertical_path(
                center, runway_heading, config, inspection.id, speed
            )
        else:
            result.warnings.append(f"unknown method: {inspection.method}")
            continue

        result.waypoints.extend(waypoints)

    if not result.waypoints:
        raise HTTPException(status_code=400, detail="no waypoints generated")

    # phase 5 - add takeoff/landing and transit paths
    all_waypoints = []

    # takeoff
    if mission.takeoff_coordinate:
        tc = parse_ewkb(mission.takeoff_coordinate.data)["coordinates"]
        all_waypoints.append(
            WaypointData(
                lon=tc[0],
                lat=tc[1],
                alt=tc[2],
                heading=bearing(tc[0], tc[1], result.waypoints[0].lon, result.waypoints[0].lat),
                speed=default_speed,
                waypoint_type="TAKEOFF",
                camera_action="NONE",
            )
        )

    # transit to first measurement + measurements + transits between segments
    prev_wp = all_waypoints[-1] if all_waypoints else None
    for wp in result.waypoints:
        if prev_wp and prev_wp.waypoint_type != "MEASUREMENT":
            # add transit from previous to current
            all_waypoints.append(
                WaypointData(
                    lon=(prev_wp.lon + wp.lon) / 2,
                    lat=(prev_wp.lat + wp.lat) / 2,
                    alt=(prev_wp.alt + wp.alt) / 2,
                    heading=bearing(prev_wp.lon, prev_wp.lat, wp.lon, wp.lat),
                    speed=default_speed,
                    waypoint_type="TRANSIT",
                    camera_action="NONE",
                )
            )
        all_waypoints.append(wp)
        prev_wp = wp

    # landing
    if mission.landing_coordinate:
        lc = parse_ewkb(mission.landing_coordinate.data)["coordinates"]
        last = all_waypoints[-1] if all_waypoints else result.waypoints[-1]
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

    # compute totals
    path_points = [(wp.lon, wp.lat, wp.alt) for wp in all_waypoints]
    result.total_distance = total_path_distance(path_points)
    avg_speed = sum(wp.speed for wp in all_waypoints) / len(all_waypoints)
    result.estimated_duration = result.total_distance / max(avg_speed, 1.0)

    # phase 4 - validate against constraints
    constraints = db.query(ConstraintRule).filter(ConstraintRule.flight_plan_id == None).all()  # noqa: E711
    violations = validate_waypoints(db, all_waypoints, constraints, airport)

    hard_violations = [v for v in violations if not v["is_warning"]]
    if hard_violations:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "hard constraint violations",
                "violations": hard_violations,
            },
        )

    soft_violations = [v for v in violations if v["is_warning"]]
    result.warnings.extend([v["message"] for v in soft_violations])

    # phase 5 - persist flight plan
    from app.services.geo import geojson_to_ewkt

    flight_plan = FlightPlan(
        mission_id=mission_id,
        airport_id=mission.airport_id,
        total_distance=result.total_distance,
        estimated_duration=result.estimated_duration,
    )
    db.add(flight_plan)
    db.flush()

    for i, wp in enumerate(all_waypoints, start=1):
        target_ewkt = None
        if wp.camera_target:
            target_ewkt = geojson_to_ewkt(
                {
                    "type": "Point",
                    "coordinates": list(wp.camera_target),
                }
            )

        db_wp = Waypoint(
            flight_plan_id=flight_plan.id,
            inspection_id=wp.inspection_id,
            sequence_order=i,
            position=geojson_to_ewkt(
                {
                    "type": "Point",
                    "coordinates": [wp.lon, wp.lat, wp.alt],
                }
            ),
            heading=wp.heading,
            speed=wp.speed,
            hover_duration=wp.hover_duration,
            camera_action=wp.camera_action,
            waypoint_type=wp.waypoint_type,
            camera_target=target_ewkt,
        )
        db.add(db_wp)

    # save validation result
    if soft_violations:
        val_result = ValidationResult(
            flight_plan_id=flight_plan.id,
            passed=True,
        )
        db.add(val_result)
        db.flush()

        from app.models.flight_plan import ValidationViolation

        for v in soft_violations:
            db.add(
                ValidationViolation(
                    validation_result_id=val_result.id,
                    is_warning=True,
                    message=v["message"],
                )
            )

    # set mission status to PLANNED
    mission.status = "PLANNED"
    db.commit()
    db.refresh(flight_plan)

    return flight_plan
