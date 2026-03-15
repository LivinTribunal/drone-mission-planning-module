from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.airport import AirfieldSurface, SafetyZone
from app.models.flight_plan import ConstraintRule
from app.models.mission import DroneProfile
from app.services.geo import geojson_to_ewkt


def validate_inspection_pass(
    db: Session,
    waypoints: list,
    drone: DroneProfile | None,
    constraints: list[ConstraintRule],
    obstacles: list,
    zones: list[SafetyZone],
    surfaces: list[AirfieldSurface],
) -> list[dict]:
    """validate all waypoints in an inspection pass - returns violations"""
    violations = []

    for wp in waypoints:
        # drone physical limits
        if drone:
            v = check_drone_constraints(wp, drone)
            if v:
                violations.append(v)

        # explicit constraints (altitude, speed, geofence, runway buffer)
        for constraint in constraints:
            v = _check_constraint(db, wp, constraint, surfaces)
            if v:
                violations.append(v)

        # safety zones
        for zone in zones:
            v = check_safety_zone(db, wp, zone)
            if v:
                violations.append(v)

    return violations


def check_drone_constraints(wp, drone: DroneProfile) -> dict | None:
    """check waypoint against drone physical limits"""
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


def check_battery(
    cumulative_duration_s: float,
    drone: DroneProfile | None,
    reserve_margin: float = 0.15,
) -> dict | None:
    """check if cumulative flight time exceeds battery capacity"""
    if not drone or not drone.endurance_minutes:
        return None

    available_s = drone.endurance_minutes * 60 * (1 - reserve_margin)
    if cumulative_duration_s > available_s:
        return {
            "is_warning": True,
            "message": (
                f"estimated flight time {cumulative_duration_s:.0f}s exceeds "
                f"battery capacity {available_s:.0f}s (with {reserve_margin:.0%} reserve)"
            ),
            "constraint_id": None,
        }

    return None


def check_safety_zone(db: Session, wp, zone: SafetyZone) -> dict | None:
    """check if waypoint is inside an active safety zone"""
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

    # check altitude bounds
    if zone.altitude_floor is not None and wp.alt < zone.altitude_floor:
        return None
    if zone.altitude_ceiling is not None and wp.alt > zone.altitude_ceiling:
        return None

    # inside the zone - hard or soft depending on type
    is_hard = zone.type in ("PROHIBITED", "TEMPORARY_NO_FLY")

    return {
        "is_warning": not is_hard,
        "message": f"waypoint inside {zone.type} zone: {zone.name}",
        "constraint_id": None,
    }


def _check_constraint(
    db: Session,
    wp,
    constraint: ConstraintRule,
    surfaces: list[AirfieldSurface],
) -> dict | None:
    """check single waypoint against single constraint"""
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

    if ctype == "SPEED":
        if constraint.max_horizontal_speed and wp.speed > constraint.max_horizontal_speed:
            return _violation(
                constraint,
                f"speed {wp.speed:.1f} exceeds max {constraint.max_horizontal_speed:.1f} m/s",
            )

    if ctype == "GEOFENCE" and constraint.boundary:
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

    if ctype == "RUNWAY_BUFFER":
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
    """check if waypoint is too close to a runway"""
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
    """convert waypoint data to EWKT point string"""
    return geojson_to_ewkt({"type": "Point", "coordinates": [wp.lon, wp.lat, wp.alt]})


def _violation(constraint: ConstraintRule, message: str) -> dict:
    """create violation dict"""
    return {
        "is_warning": not constraint.is_hard_constraint,
        "message": message,
        "constraint_id": str(constraint.id),
    }
