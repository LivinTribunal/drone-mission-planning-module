"""drone capability checks - altitude, speed, and battery endurance."""

from __future__ import annotations

from app.models.mission import DroneProfile
from app.models.value_objects import Speed

from ..types import Violation, WaypointData


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


def check_battery(
    cumulative_duration_s: float,
    drone: DroneProfile | None,
    reserve_margin: float = 0.15,
) -> Violation | None:
    """soft warning if cumulative flight time exceeds battery capacity."""
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
