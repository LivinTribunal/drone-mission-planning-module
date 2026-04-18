"""backward-compatible re-exports - use app.services.trajectory.orchestrator instead."""

from app.services.trajectory.helpers import _apply_camera_actions  # noqa: F401
from app.services.trajectory.orchestrator import (  # noqa: F401
    _generate_trajectory_inner,
    _load_mission_data,
    _parse_coordinate,
    _segment_duration_with_accel,
    generate_trajectory,
)
