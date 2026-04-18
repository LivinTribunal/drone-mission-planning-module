"""backward-compatible re-exports - use app.services.trajectory submodules instead."""

from app.models.inspection import CONFIG_FIELDS  # noqa: F401
from app.services.trajectory.config_resolver import (  # noqa: F401
    _resolve_measurement_speed,
    check_sensor_fov,
    check_speed_framerate,
    compute_optimal_density,
    compute_optimal_speed,
    overlay_config,
    resolve_density,
    resolve_speed,
    resolve_with_defaults,
)
from app.services.trajectory.helpers import (  # noqa: F401
    _apply_terrain_delta,
    _insert_video_hover_waypoints,
    _opposite_bearing,
    _parse_lha_position,
    _vertical_profile_max_elevation,
    determine_end_position,
    determine_start_position,
    find_lha_by_id,
    find_lha_in_surfaces,
    get_glide_slope_angle,
    get_lha_positions,
    get_lha_positions_from_surfaces,
    get_lha_setting_angles,
    get_ordered_lha_positions,
    get_runway_centerline_midpoint,
    get_runway_heading,
)
from app.services.trajectory.methods import compute_measurement_trajectory  # noqa: F401
from app.services.trajectory.methods.angular_sweep import calculate_arc_path  # noqa: F401
from app.services.trajectory.methods.fly_over import calculate_fly_over_path  # noqa: F401
from app.services.trajectory.methods.hover_point_lock import (  # noqa: F401
    calculate_hover_point_lock_path,
)
from app.services.trajectory.methods.parallel_side_sweep import (  # noqa: F401
    calculate_parallel_side_sweep_path,
)
from app.services.trajectory.methods.vertical_profile import calculate_vertical_path  # noqa: F401
