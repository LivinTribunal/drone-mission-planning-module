from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.airport import AirfieldSurface, Obstacle, SafetyZone
from app.models.enums import SafetyZoneType
from app.models.flight_plan import ConstraintRule
from app.models.mission import DroneProfile
from app.services.geometry_converter import geojson_to_ewkt

# spatial queries use parameterized text() with PostGIS functions
# this is the data-layer spatial computation described in section 3.1.3
# all inputs are bound parameters - no sql injection risk


def validate_inspection_pass(
    db: Session,
    waypoints: list,
    drone: DroneProfile | None,
    constraints: list[ConstraintRule],
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    surfaces: list[AirfieldSurface],
) -> list[dict]:
    """validate all waypoints in an inspection pass"""
    violations = []

    for wp in waypoints:
        if drone:
            v = check_drone_constraints(wp, drone)
            if v:
                violations.append(v)

        for constraint in constraints:
            v = _check_constraint(db, wp, constraint, surfaces)
            if v:
                violations.append(v)

        for obstacle in obstacles:
            v = check_obstacle(db, wp, obstacle)
            if v:
                violations.append(v)

        for zone in zones:
            v = check_safety_zone(db, wp, zone)
            if v:
                violations.append(v)

    return violations


def validate_flight_plan(
    db: Session,
    waypoints: list,
    drone: DroneProfile | None,
    constraints: list[ConstraintRule],
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    surfaces: list[AirfieldSurface],
) -> list[dict]:
    """validate entire flight plan - section 3.4.2"""
    return validate_inspection_pass(
        db,
        waypoints,
        drone,
        constraints,
        obstacles,
        zones,
        surfaces,
    )


def check_drone_constraints(wp, drone: DroneProfile) -> dict | None:
    if drone.max_altitude and wp.alt > drone.max_altitude:
        return {
            "is_warning": False,
            "message": (
                f"waypoint alt {wp.alt:.0f}m exceeds drone max altitude {drone.max_altitude:.0f}m"
            ),
            "constraint_id": None,
        }

    if drone.max_speed and wp.speed > drone.max_speed:
        return {
            "is_warning": False,
            "message": (
                f"waypoint speed {wp.speed:.1f} m/s exceeds drone max "
                f"speed {drone.max_speed:.1f} m/s"
            ),
            "constraint_id": None,
        }

    return None


def check_obstacle(db: Session, wp, obstacle: Obstacle) -> dict | None:
    """spatial intersection test - section 3.3.5"""
    if not obstacle.geometry:
        return None

    wp_ewkt = _wp_to_ewkt(wp)

    contained = db.execute(
        text(
            "SELECT ST_Contains("
            "ST_Force2D(:obs_geom::geometry), "
            "ST_Force2D(ST_GeomFromEWKT(:point)))"
        ),
        {"obs_geom": obstacle.geometry, "point": wp_ewkt},
    ).scalar()

    if not contained:
        return None

    # altitude check - obstacle extends from base to base + height
    obs_base_alt = 0.0
    if obstacle.position:
        from app.schemas.geometry import parse_ewkb

        obs_pos = parse_ewkb(obstacle.position.data)
        obs_base_alt = obs_pos["coordinates"][2]

    obs_top = obs_base_alt + (obstacle.height or 0)

    if wp.alt <= obs_top:
        return {
            "is_warning": False,
            "message": (
                f"waypoint at {wp.alt:.0f}m intersects obstacle "
                f"'{obstacle.name}' (top: {obs_top:.0f}m)"
            ),
            "constraint_id": None,
        }

    return None


def check_battery(
    cumulative_duration_s: float,
    drone: DroneProfile | None,
    reserve_margin: float = 0.15,
) -> dict | None:
    if not drone or not drone.endurance_minutes:
        return None

    available_s = drone.endurance_minutes * 60 * (1 - reserve_margin)
    if cumulative_duration_s > available_s:
        return {
            "is_warning": True,
            "message": (
                f"estimated flight time {cumulative_duration_s:.0f}s exceeds "
                f"battery capacity {available_s:.0f}s "
                f"(with {reserve_margin:.0%} reserve)"
            ),
            "constraint_id": None,
        }

    return None


def check_safety_zone(db: Session, wp, zone: SafetyZone) -> dict | None:
    if not zone.geometry:
        return None

    wp_ewkt = _wp_to_ewkt(wp)

    contained = db.execute(
        text(
            "SELECT ST_Contains("
            "ST_Force2D(:zone_geom::geometry), "
            "ST_Force2D(ST_GeomFromEWKT(:point)))"
        ),
        {"zone_geom": zone.geometry, "point": wp_ewkt},
    ).scalar()

    if not contained:
        return None

    if zone.altitude_floor is not None and wp.alt < zone.altitude_floor:
        return None
    if zone.altitude_ceiling is not None and wp.alt > zone.altitude_ceiling:
        return None

    is_hard = zone.type in (SafetyZoneType.PROHIBITED, SafetyZoneType.TEMPORARY_NO_FLY)

    return {
        "is_warning": not is_hard,
        "message": f"waypoint inside {zone.type} zone: {zone.name}",
        "constraint_id": None,
    }


# segment intersection for visibility graph edge validation (section 3.3.7)


def segments_intersect_obstacle(
    db: Session,
    from_lon: float,
    from_lat: float,
    to_lon: float,
    to_lat: float,
    obstacle,
) -> bool:
    if not obstacle.geometry:
        return False

    line_ewkt = f"SRID=4326;LINESTRING({from_lon} {from_lat}, {to_lon} {to_lat})"

    result = db.execute(
        text(
            "SELECT ST_Intersects("
            "ST_Force2D(:obs_geom::geometry), "
            "ST_Force2D(ST_GeomFromEWKT(:line)))"
        ),
        {"obs_geom": obstacle.geometry, "line": line_ewkt},
    ).scalar()

    return bool(result)


def segments_intersect_zone(
    db: Session,
    from_lon: float,
    from_lat: float,
    to_lon: float,
    to_lat: float,
    zone,
) -> bool:
    if not zone.geometry:
        return False

    if zone.type not in (SafetyZoneType.PROHIBITED, SafetyZoneType.TEMPORARY_NO_FLY):
        return False

    line_ewkt = f"SRID=4326;LINESTRING({from_lon} {from_lat}, {to_lon} {to_lat})"

    result = db.execute(
        text(
            "SELECT ST_Intersects("
            "ST_Force2D(:zone_geom::geometry), "
            "ST_Force2D(ST_GeomFromEWKT(:line)))"
        ),
        {"zone_geom": zone.geometry, "line": line_ewkt},
    ).scalar()

    return bool(result)


def _check_constraint(
    db: Session,
    wp,
    constraint: ConstraintRule,
    surfaces: list[AirfieldSurface],
) -> dict | None:
    ctype = constraint.constraint_type

    if ctype == "ALTITUDE":
        if constraint.min_altitude and wp.alt < constraint.min_altitude:
            return _violation(
                constraint,
                f"alt {wp.alt:.0f}m below min {constraint.min_altitude:.0f}m",
            )
        if constraint.max_altitude and wp.alt > constraint.max_altitude:
            return _violation(
                constraint,
                f"alt {wp.alt:.0f}m above max {constraint.max_altitude:.0f}m",
            )

    elif ctype == "SPEED":
        if constraint.max_horizontal_speed and wp.speed > constraint.max_horizontal_speed:
            return _violation(
                constraint,
                f"speed {wp.speed:.1f} exceeds max {constraint.max_horizontal_speed:.1f} m/s",
            )

    elif ctype == "GEOFENCE" and constraint.boundary:
        wp_ewkt = _wp_to_ewkt(wp)
        contained = db.execute(
            text(
                "SELECT ST_Contains("
                "ST_Force2D(:boundary::geometry), "
                "ST_Force2D(ST_GeomFromEWKT(:point)))"
            ),
            {"boundary": constraint.boundary, "point": wp_ewkt},
        ).scalar()

        if not contained:
            return _violation(constraint, "waypoint outside geofence boundary")

    elif ctype == "RUNWAY_BUFFER":
        v = _check_runway_buffer(db, wp, constraint, surfaces)
        if v:
            return v

    return None


def _check_runway_buffer(
    db: Session,
    wp,
    constraint: ConstraintRule,
    surfaces: list[AirfieldSurface],
) -> dict | None:
    """PostGIS ST_DWithin for runway buffer check - section 3.4.1"""
    buffer_m = constraint.lateral_buffer or 100.0
    wp_ewkt = _wp_to_ewkt(wp)

    for surface in surfaces:
        if surface.surface_type != "RUNWAY":
            continue
        if not surface.geometry:
            continue

        too_close = db.execute(
            text(
                "SELECT ST_DWithin("
                "ST_Force2D(:rwy_geom::geometry)::geography, "
                "ST_Force2D(ST_GeomFromEWKT(:point))::geography, "
                ":buffer)"
            ),
            {
                "rwy_geom": surface.geometry,
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
    return geojson_to_ewkt({"type": "Point", "coordinates": [wp.lon, wp.lat, wp.alt]})


def _violation(constraint: ConstraintRule, message: str) -> dict:
    return {
        "is_warning": not constraint.is_hard_constraint,
        "message": message,
        "constraint_id": str(constraint.id),
    }
