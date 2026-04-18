"""inspection method registry - maps InspectionMethod enum to path computation."""

from typing import Callable

from app.core.exceptions import TrajectoryGenerationError
from app.models.enums import InspectionMethod
from app.utils.geo import distance_between

from ..helpers import (
    _apply_terrain_delta,
    _insert_video_hover_waypoints,
    determine_end_position,
    determine_start_position,
    find_lha_by_id,
    find_lha_in_surfaces,
    get_runway_centerline_midpoint,
)
from ..types import (
    DEFAULT_FLY_OVER_SPEED,
    DEFAULT_PARALLEL_SPEED,
    Degrees,
    MetersPerSecond,
    MethodPrep,
    Point3D,
    ResolvedConfig,
    WaypointData,
)
from .angular_sweep import calculate_arc_path
from .fly_over import calculate_fly_over_path
from .hover_point_lock import calculate_hover_point_lock_path
from .parallel_side_sweep import calculate_parallel_side_sweep_path
from .vertical_profile import calculate_vertical_path

# methods that need terrain delta applied before video wrapper
_TERRAIN_DELTA_METHODS = frozenset(
    {InspectionMethod.ANGULAR_SWEEP, InspectionMethod.VERTICAL_PROFILE}
)


def _prepare_angular_sweep(
    inspection, config, center, rwy_heading, glide_slope, ordered_lhas, default_speed, **_kw
) -> MethodPrep:
    """pre-computation for angular sweep."""
    start = determine_start_position(center, config, inspection.method, rwy_heading, glide_slope)
    end = determine_end_position(center, config, inspection.method, rwy_heading, glide_slope)
    path_dist = distance_between(start.lon, start.lat, end.lon, end.lat)
    return MethodPrep(
        path_distance=path_dist,
        default_speed=default_speed,
        density_for_speed=config.measurement_density,
        needs_fov_check=True,
    )


def _prepare_vertical_profile(
    inspection, config, center, rwy_heading, glide_slope, ordered_lhas, default_speed, **_kw
) -> MethodPrep:
    """pre-computation for vertical profile."""
    start = determine_start_position(center, config, inspection.method, rwy_heading, glide_slope)
    end = determine_end_position(center, config, inspection.method, rwy_heading, glide_slope)
    path_dist = distance_between(start.lon, start.lat, end.lon, end.lat)
    return MethodPrep(
        path_distance=path_dist,
        default_speed=default_speed,
        density_for_speed=config.measurement_density,
        needs_fov_check=True,
    )


def _prepare_fly_over(
    inspection, config, center, rwy_heading, glide_slope, ordered_lhas, default_speed, **_kw
) -> MethodPrep:
    """pre-computation for fly-over."""
    path_dist = 0.0
    for k in range(1, len(ordered_lhas)):
        path_dist += distance_between(
            ordered_lhas[k - 1].lon,
            ordered_lhas[k - 1].lat,
            ordered_lhas[k].lon,
            ordered_lhas[k].lat,
        )
    return MethodPrep(
        path_distance=path_dist,
        default_speed=DEFAULT_FLY_OVER_SPEED,
        density_for_speed=max(len(ordered_lhas), 2),
    )


def _prepare_parallel_side_sweep(
    inspection,
    config,
    center,
    rwy_heading,
    glide_slope,
    ordered_lhas,
    default_speed,
    template,
    surfaces,
    label,
    **_kw,
) -> MethodPrep:
    """pre-computation for parallel side sweep."""
    runway_center = get_runway_centerline_midpoint(template, surfaces)
    if runway_center is None:
        raise TrajectoryGenerationError(
            f"{label}: parallel-side-sweep requires a runway surface "
            "with a centerline for its target AGL"
        )
    path_dist = 0.0
    for k in range(1, len(ordered_lhas)):
        path_dist += distance_between(
            ordered_lhas[k - 1].lon,
            ordered_lhas[k - 1].lat,
            ordered_lhas[k].lon,
            ordered_lhas[k].lat,
        )
    return MethodPrep(
        path_distance=path_dist,
        default_speed=DEFAULT_PARALLEL_SPEED,
        density_for_speed=max(len(ordered_lhas), 2),
        runway_center=runway_center,
    )


def _prepare_hover_point_lock(
    inspection,
    config,
    center,
    rwy_heading,
    glide_slope,
    ordered_lhas,
    default_speed,
    template,
    surfaces,
    label,
    **_kw,
) -> MethodPrep:
    """pre-computation for hover-point-lock."""
    selected_id = config.selected_lha_id
    if selected_id is None:
        raise TrajectoryGenerationError(f"{label}: hover-point-lock requires a selected LHA")
    match = find_lha_by_id(template, selected_id)
    if match is None:
        match = find_lha_in_surfaces(surfaces, selected_id)
    if match is None:
        raise TrajectoryGenerationError(f"{label}: selected LHA {selected_id} not found in airport")
    target_lha_pos, target_agl = match
    target_agl_type = target_agl.agl_type

    heading_override = None
    for surface in surfaces:
        if surface.id == target_agl.surface_id and surface.heading:
            heading_override = surface.heading
            break

    return MethodPrep(
        path_distance=0.0,
        default_speed=default_speed,
        density_for_speed=config.measurement_density,
        target_lha_pos=target_lha_pos,
        target_agl_type=target_agl_type,
        rwy_heading_override=heading_override,
    )


PREPARE_REGISTRY: dict[InspectionMethod, Callable[..., MethodPrep]] = {
    InspectionMethod.ANGULAR_SWEEP: _prepare_angular_sweep,
    InspectionMethod.VERTICAL_PROFILE: _prepare_vertical_profile,
    InspectionMethod.FLY_OVER: _prepare_fly_over,
    InspectionMethod.PARALLEL_SIDE_SWEEP: _prepare_parallel_side_sweep,
    InspectionMethod.HOVER_POINT_LOCK: _prepare_hover_point_lock,
}


def compute_measurement_trajectory(
    inspection,
    config: ResolvedConfig,
    center: Point3D,
    runway_heading: Degrees,
    glide_slope: Degrees,
    speed: MetersPerSecond,
    setting_angles: list[Degrees],
    elevation_provider=None,
    ordered_lha_positions: list[Point3D] | None = None,
    target_lha_position: Point3D | None = None,
    target_agl_type: str | None = None,
    runway_center: Point3D | None = None,
) -> list[WaypointData]:
    """dispatch to the path computation matching the inspection method."""
    handler = METHOD_REGISTRY.get(inspection.method)
    if handler is None:
        raise ValueError(f"unsupported inspection method: {inspection.method}")

    waypoints = handler(
        inspection=inspection,
        config=config,
        center=center,
        runway_heading=runway_heading,
        glide_slope=glide_slope,
        speed=speed,
        setting_angles=setting_angles,
        elevation_provider=elevation_provider,
        ordered_lha_positions=ordered_lha_positions,
        target_lha_position=target_lha_position,
        target_agl_type=target_agl_type,
        runway_center=runway_center,
    )

    # terrain correction before video wrapper
    if inspection.method in _TERRAIN_DELTA_METHODS:
        _apply_terrain_delta(waypoints, center, elevation_provider)

    # video mode - wrap with recording start/stop hover waypoints
    if config.capture_mode == "VIDEO_CAPTURE":
        waypoints = _insert_video_hover_waypoints(waypoints, config)

    return waypoints


def _angular_sweep_handler(
    inspection, config, center, runway_heading, glide_slope, speed, **_kw
) -> list[WaypointData]:
    """handler for ANGULAR_SWEEP method."""
    return calculate_arc_path(center, runway_heading, glide_slope, config, inspection.id, speed)


def _vertical_profile_handler(
    inspection, config, center, runway_heading, speed, setting_angles, **_kw
) -> list[WaypointData]:
    """handler for VERTICAL_PROFILE method."""
    return calculate_vertical_path(
        center, runway_heading, config, inspection.id, speed, setting_angles
    )


def _fly_over_handler(
    inspection, config, speed, ordered_lha_positions, **_kw
) -> list[WaypointData]:
    """handler for FLY_OVER method."""
    if not ordered_lha_positions:
        raise ValueError("fly-over requires ordered LHA positions")
    return calculate_fly_over_path(ordered_lha_positions, config, inspection.id, speed)


def _parallel_side_sweep_handler(
    inspection, config, speed, elevation_provider, ordered_lha_positions, runway_center, **_kw
) -> list[WaypointData]:
    """handler for PARALLEL_SIDE_SWEEP method."""
    if not ordered_lha_positions:
        raise ValueError("parallel-side-sweep requires ordered LHA positions")
    if runway_center is None:
        raise ValueError("parallel-side-sweep requires a runway centerline reference point")
    return calculate_parallel_side_sweep_path(
        ordered_lha_positions,
        runway_center,
        config,
        inspection.id,
        speed,
        elevation_provider=elevation_provider,
    )


def _hover_point_lock_handler(
    inspection, config, runway_heading, speed, target_lha_position, target_agl_type, **_kw
) -> list[WaypointData]:
    """handler for HOVER_POINT_LOCK method."""
    if target_lha_position is None:
        raise ValueError("hover-point-lock requires a target LHA position")
    return calculate_hover_point_lock_path(
        target_lha_position,
        target_agl_type or "",
        runway_heading,
        config,
        inspection.id,
        speed,
    )


METHOD_REGISTRY: dict[InspectionMethod, Callable] = {
    InspectionMethod.ANGULAR_SWEEP: _angular_sweep_handler,
    InspectionMethod.VERTICAL_PROFILE: _vertical_profile_handler,
    InspectionMethod.FLY_OVER: _fly_over_handler,
    InspectionMethod.PARALLEL_SIDE_SWEEP: _parallel_side_sweep_handler,
    InspectionMethod.HOVER_POINT_LOCK: _hover_point_lock_handler,
}
