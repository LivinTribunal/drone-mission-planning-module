from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.exceptions import TrajectoryGenerationError
from app.models.airport import AirfieldSurface, Obstacle, SafetyZone
from app.models.enums import ConstraintType, SurfaceType
from app.models.flight_plan import ConstraintRule
from app.models.mission import DroneProfile
from app.models.value_objects import Speed
from app.schemas.geometry import parse_ewkb
from app.services.geometry_converter import geojson_to_ewkt
from app.services.trajectory_types import (
    DEFAULT_RUNWAY_BUFFER,
    HARD_ZONE_TYPES,
    Violation,
    WaypointData,
)

# spatial queries use parameterized text() with PostGIS functions
# all inputs are bound parameters - no sql injection risk


def _line_ewkt(from_lon: float, from_lat: float, to_lon: float, to_lat: float) -> str:
    """build 2D EWKT linestring for spatial intersection checks."""
    return f"SRID=4326;LINESTRING({from_lon} {from_lat}, {to_lon} {to_lat})"


def validate_inspection_pass(
    db: Session,
    waypoints: list[WaypointData],
    drone: DroneProfile | None,
    constraints: list[ConstraintRule],
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    surfaces: list[AirfieldSurface],
) -> list[Violation]:
    """validate all waypoints in an inspection pass"""
    violations = []

    for i, wp in enumerate(waypoints):
        if drone:
            v = check_drone_constraints(wp, drone)
            if v:
                v.waypoint_index = i
                violations.append(v)

        for constraint in constraints:
            v = _check_constraint(db, wp, constraint, surfaces)
            if v:
                v.waypoint_index = i
                violations.append(v)

        for obstacle in obstacles:
            v = check_obstacle(db, wp, obstacle)
            if v:
                v.waypoint_index = i
                violations.append(v)

        for zone in zones:
            v = check_safety_zone(db, wp, zone)
            if v:
                v.waypoint_index = i
                violations.append(v)

    return violations


def check_drone_constraints(wp: WaypointData, drone: DroneProfile) -> Violation | None:
    """check if waypoint exceeds drone altitude or speed limits."""
    if drone.max_altitude is not None and wp.alt > drone.max_altitude:
        return Violation(
            is_warning=False,
            violation_kind="drone",
            message=(
                f"waypoint alt {wp.alt:.0f}m exceeds drone max altitude {drone.max_altitude:.0f}m"
            ),
        )

    # validate speed as value object
    try:
        Speed(wp.speed)
    except ValueError:
        return Violation(
            is_warning=False, violation_kind="drone", message=f"invalid speed value: {wp.speed}"
        )

    if drone.max_speed is not None and wp.speed > drone.max_speed:
        return Violation(
            is_warning=False,
            violation_kind="drone",
            message=(
                f"waypoint speed {wp.speed:.1f} m/s exceeds "
                f"drone max speed {drone.max_speed:.1f} m/s"
            ),
        )

    return None


def check_obstacle(db: Session, wp: WaypointData, obstacle: Obstacle) -> Violation | None:
    """check if waypoint is inside an obstacle's geometry below its height"""
    if not obstacle.geometry:
        return None

    wp_ewkt = _wp_to_ewkt(wp)

    contained = db.execute(
        text(
            "SELECT ST_Contains("
            "ST_Force2D(ST_GeomFromEWKT(:obs_geom)), "
            "ST_Force2D(ST_GeomFromEWKT(:point)))"
        ),
        {"obs_geom": _geom_to_ewkt(obstacle.geometry), "point": wp_ewkt},
    ).scalar()

    if not contained:
        return None

    obs_base_alt = 0.0
    if obstacle.position:
        try:
            obs_pos = parse_ewkb(obstacle.position.data)
            coords = obs_pos.get("coordinates", [])
            obs_base_alt = coords[2] if len(coords) > 2 else 0.0
        except Exception:
            pass

    obs_top = obs_base_alt + (obstacle.height or 0)

    if wp.alt <= obs_top:
        return Violation(
            is_warning=False,
            violation_kind="obstacle",
            message=(
                f"waypoint at {wp.alt:.0f}m intersects obstacle "
                f"'{obstacle.name}' (top: {obs_top:.0f}m)"
            ),
        )

    return None


def check_battery(
    cumulative_duration_s: float,
    drone: DroneProfile | None,
    reserve_margin: float = 0.15,
) -> Violation | None:
    """soft warning if cumulative flight time exceeds battery capacity"""
    if not drone or drone.endurance_minutes is None:
        return None

    available_s = drone.endurance_minutes * 60 * (1 - reserve_margin)
    if cumulative_duration_s > available_s:
        return Violation(
            is_warning=True,
            violation_kind="battery",
            message=(
                f"estimated flight time {cumulative_duration_s:.0f}s exceeds "
                f"battery capacity {available_s:.0f}s "
                f"(with {reserve_margin:.0%} reserve)"
            ),
        )

    return None


def check_safety_zone(db: Session, wp: WaypointData, zone: SafetyZone) -> Violation | None:
    """check if waypoint is inside a safety zone's geometry and altitude band"""
    if not zone.geometry:
        return None

    wp_ewkt = _wp_to_ewkt(wp)

    contained = db.execute(
        text(
            "SELECT ST_Contains("
            "ST_Force2D(ST_GeomFromEWKT(:zone_geom)), "
            "ST_Force2D(ST_GeomFromEWKT(:point)))"
        ),
        {"zone_geom": _geom_to_ewkt(zone.geometry), "point": wp_ewkt},
    ).scalar()

    if not contained:
        return None

    if zone.altitude_floor is not None and wp.alt < zone.altitude_floor:
        return None
    if zone.altitude_ceiling is not None and wp.alt > zone.altitude_ceiling:
        return None

    is_hard = zone.type in HARD_ZONE_TYPES

    return Violation(
        is_warning=not is_hard,
        violation_kind="safety_zone",
        message=f"waypoint inside {zone.type} zone: {zone.name}",
    )


# segment intersection for visibility graph edge validation
def segments_intersect_obstacle(
    db: Session,
    from_lon: float,
    from_lat: float,
    to_lon: float,
    to_lat: float,
    obstacle: Obstacle,
) -> bool:
    """check if a line segment intersects an obstacle's 2D footprint"""
    if not obstacle.geometry:
        return False

    line_ewkt = _line_ewkt(from_lon, from_lat, to_lon, to_lat)

    result = db.execute(
        text(
            "SELECT ST_Intersects("
            "ST_Force2D(ST_GeomFromEWKT(:obs_geom)), "
            "ST_Force2D(ST_GeomFromEWKT(:line)))"
        ),
        {"obs_geom": _geom_to_ewkt(obstacle.geometry), "line": line_ewkt},
    ).scalar()

    return bool(result)


def segments_intersect_zone(
    db: Session,
    from_lon: float,
    from_lat: float,
    to_lon: float,
    to_lat: float,
    zone: SafetyZone,
) -> bool:
    """check if a line segment intersects a hard safety zone's 2D footprint"""
    if not zone.geometry:
        return False

    if zone.type not in HARD_ZONE_TYPES:
        return False

    line_ewkt = _line_ewkt(from_lon, from_lat, to_lon, to_lat)

    result = db.execute(
        text(
            "SELECT ST_Intersects("
            "ST_Force2D(ST_GeomFromEWKT(:zone_geom)), "
            "ST_Force2D(ST_GeomFromEWKT(:line)))"
        ),
        {"zone_geom": _geom_to_ewkt(zone.geometry), "line": line_ewkt},
    ).scalar()

    return bool(result)


def segment_runway_crossing_length(
    db: Session,
    from_lon: float,
    from_lat: float,
    to_lon: float,
    to_lat: float,
    surface: AirfieldSurface,
) -> float:
    """length in meters of segment inside a runway's buffered area.
    uses ST_Buffer on the centerline with half the runway width to create
    the runway polygon on-the-fly. returns 0 if no crossing."""
    if not surface.geometry:
        return 0.0

    half_width = (surface.width or 45.0) / 2.0
    line_ewkt = _line_ewkt(from_lon, from_lat, to_lon, to_lat)

    # buffer the centerline by half width to get runway polygon, then intersect
    result = db.execute(
        text(
            "SELECT ST_Length(ST_Intersection("
            "ST_Buffer(ST_Force2D(ST_GeomFromEWKT(:surf_geom))::geography, :half_width)::geometry, "
            "ST_Force2D(ST_GeomFromEWKT(:line))"
            ")::geography)"
        ),
        {
            "surf_geom": _geom_to_ewkt(surface.geometry),
            "line": line_ewkt,
            "half_width": half_width,
        },
    ).scalar()

    return float(result) if result else 0.0


def _check_constraint(
    db: Session,
    wp: WaypointData,
    constraint: ConstraintRule,
    surfaces: list[AirfieldSurface],
) -> Violation | None:
    """dispatch waypoint check based on constraint type"""
    ctype = constraint.constraint_type

    if ctype == ConstraintType.ALTITUDE:
        if constraint.min_altitude is not None and wp.alt < constraint.min_altitude:
            return _violation(
                constraint,
                f"alt {wp.alt:.0f}m below min {constraint.min_altitude:.0f}m",
            )
        if constraint.max_altitude is not None and wp.alt > constraint.max_altitude:
            return _violation(
                constraint,
                f"alt {wp.alt:.0f}m above max {constraint.max_altitude:.0f}m",
            )

    elif ctype == ConstraintType.SPEED:
        max_speed = constraint.max_horizontal_speed
        if max_speed is not None and wp.speed > max_speed:
            return _violation(
                constraint,
                f"speed {wp.speed:.1f} exceeds max {constraint.max_horizontal_speed:.1f} m/s",
            )

    elif ctype == ConstraintType.GEOFENCE and constraint.boundary:
        wp_ewkt = _wp_to_ewkt(wp)
        contained = db.execute(
            text(
                "SELECT ST_Contains("
                "ST_Force2D(ST_GeomFromEWKT(:boundary)), "
                "ST_Force2D(ST_GeomFromEWKT(:point)))"
            ),
            {"boundary": _geom_to_ewkt(constraint.boundary), "point": wp_ewkt},
        ).scalar()

        if not contained:
            return _violation(constraint, "waypoint outside geofence boundary")

    elif ctype == ConstraintType.RUNWAY_BUFFER:
        v = _check_runway_buffer(db, wp, constraint, surfaces)
        if v:
            return v

    return None


def _check_runway_buffer(
    db: Session,
    wp: WaypointData,
    constraint: ConstraintRule,
    surfaces: list[AirfieldSurface],
) -> Violation | None:
    """check if waypoint is within lateral buffer of a runway centerline"""
    buffer_m = constraint.lateral_buffer or DEFAULT_RUNWAY_BUFFER
    wp_ewkt = _wp_to_ewkt(wp)

    for surface in surfaces:
        if surface.surface_type != SurfaceType.RUNWAY:
            continue
        if not surface.geometry:
            continue

        too_close = db.execute(
            text(
                "SELECT ST_DWithin("
                "ST_Force2D(ST_GeomFromEWKT(:rwy_geom))::geography, "
                "ST_Force2D(ST_GeomFromEWKT(:point))::geography, "
                ":buffer)"
            ),
            {
                "rwy_geom": _geom_to_ewkt(surface.geometry),
                "point": wp_ewkt,
                "buffer": buffer_m,
            },
        ).scalar()

        if too_close:
            return _violation(
                constraint,
                f"waypoint within {buffer_m:.0f}m of runway {surface.identifier}",
            )

    return None


def _wp_to_ewkt(wp) -> str:
    """convert waypoint position to EWKT point string"""
    return geojson_to_ewkt({"type": "Point", "coordinates": [wp.lon, wp.lat, wp.alt]})


def _geom_to_ewkt(geom) -> str:
    """convert WKBElement to EWKT string for use in text() queries"""
    try:
        geojson = parse_ewkb(geom.data)
        return geojson_to_ewkt(geojson)
    except Exception as e:
        raise TrajectoryGenerationError(f"failed to parse geometry: {e}") from e


def _violation(constraint: ConstraintRule, message: str) -> Violation:
    """create a violation from a constraint, inheriting its hard/soft flag"""
    return Violation(
        is_warning=not constraint.is_hard_constraint,
        violation_kind="constraint",
        message=message,
        constraint_id=str(constraint.id),
    )
