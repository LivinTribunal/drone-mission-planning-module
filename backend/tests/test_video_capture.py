"""tests for video capture mode trajectory generation."""

from uuid import uuid4

from app.models.enums import CameraAction, WaypointType
from app.services.trajectory._common import _insert_video_hover_waypoints
from app.services.trajectory.methods import compute_measurement_trajectory
from app.services.trajectory.methods.horizontal_range import calculate_arc_path
from app.services.trajectory.methods.vertical_profile import calculate_vertical_path
from app.services.trajectory.segment_builder import _apply_camera_actions
from app.services.trajectory.types import Point3D, ResolvedConfig, WaypointData

# --- video mode arc path ---


def test_arc_path_video_mode_uses_recording_action():
    """video mode arc waypoints get RECORDING camera action."""
    config = ResolvedConfig(measurement_density=5, capture_mode="VIDEO_CAPTURE")
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    assert all(wp.camera_action == CameraAction.RECORDING for wp in wps)


def test_arc_path_photo_mode_uses_photo_capture():
    """photo mode arc waypoints get PHOTO_CAPTURE camera action."""
    config = ResolvedConfig(measurement_density=5, capture_mode="PHOTO_CAPTURE")
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    assert all(wp.camera_action == CameraAction.PHOTO_CAPTURE for wp in wps)


# --- video mode vertical path ---


def test_vertical_path_video_mode_uses_recording_action():
    """video mode vertical waypoints get RECORDING camera action."""
    config = ResolvedConfig(measurement_density=5, capture_mode="VIDEO_CAPTURE")
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])

    assert all(wp.camera_action == CameraAction.RECORDING for wp in wps)


def test_vertical_path_photo_mode_unchanged():
    """photo mode vertical waypoints get PHOTO_CAPTURE camera action."""
    config = ResolvedConfig(measurement_density=5, capture_mode="PHOTO_CAPTURE")
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])

    assert all(wp.camera_action == CameraAction.PHOTO_CAPTURE for wp in wps)


# --- insert video hover waypoints ---


def test_insert_video_hover_waypoints():
    """video hover wrapping adds RECORDING_START and RECORDING_STOP."""
    config = ResolvedConfig(recording_setup_duration=3.0)
    insp_id = uuid4()
    wps = [
        WaypointData(lon=14.0, lat=50.0, alt=400.0, inspection_id=insp_id),
        WaypointData(lon=14.1, lat=50.1, alt=410.0, inspection_id=insp_id),
    ]

    result = _insert_video_hover_waypoints(wps, config)

    assert len(result) == 4
    assert result[0].camera_action == CameraAction.RECORDING_START
    assert result[0].waypoint_type == WaypointType.HOVER
    assert result[0].hover_duration == 3.0
    assert result[0].inspection_id == insp_id
    assert result[-1].camera_action == CameraAction.RECORDING_STOP
    assert result[-1].waypoint_type == WaypointType.HOVER
    assert result[-1].hover_duration == 3.0


def test_insert_video_hover_empty_list():
    """empty waypoint list returns empty."""
    config = ResolvedConfig()
    result = _insert_video_hover_waypoints([], config)
    assert result == []


# --- compute_measurement_trajectory video integration ---


class FakeInspection:
    """minimal inspection for trajectory computation."""

    def __init__(self, method, insp_id=None):
        """init with method and optional id."""
        self.method = method
        self.id = insp_id or uuid4()


def test_compute_measurement_video_mode_wraps_arc():
    """video mode arc path gets recording start/stop wrapper."""
    config = ResolvedConfig(
        measurement_density=3,
        capture_mode="VIDEO_CAPTURE",
        recording_setup_duration=5.0,
    )
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)
    inspection = FakeInspection("HORIZONTAL_RANGE")

    wps = compute_measurement_trajectory(inspection, config, center, 243.0, 3.0, 5.0, [])

    # 3 measurement + 2 hover = 5
    assert len(wps) == 5
    assert wps[0].camera_action == CameraAction.RECORDING_START
    assert wps[0].waypoint_type == WaypointType.HOVER
    assert wps[-1].camera_action == CameraAction.RECORDING_STOP
    assert wps[-1].waypoint_type == WaypointType.HOVER

    # inner waypoints are RECORDING
    for wp in wps[1:-1]:
        assert wp.camera_action == CameraAction.RECORDING


def test_compute_measurement_photo_mode_no_wrapper():
    """photo mode does not add recording hover waypoints."""
    config = ResolvedConfig(measurement_density=3, capture_mode="PHOTO_CAPTURE")
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)
    inspection = FakeInspection("HORIZONTAL_RANGE")

    wps = compute_measurement_trajectory(inspection, config, center, 243.0, 3.0, 5.0, [])

    assert len(wps) == 3
    assert all(wp.camera_action == CameraAction.PHOTO_CAPTURE for wp in wps)


def test_compute_measurement_video_vertical():
    """video mode vertical path gets recording wrapper."""
    config = ResolvedConfig(
        measurement_density=4,
        capture_mode="VIDEO_CAPTURE",
        recording_setup_duration=2.0,
    )
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)
    inspection = FakeInspection("VERTICAL_PROFILE")

    wps = compute_measurement_trajectory(inspection, config, center, 243.0, 3.0, 3.0, [])

    # 4 measurement + 2 hover = 6
    assert len(wps) == 6
    assert wps[0].camera_action == CameraAction.RECORDING_START
    assert wps[-1].camera_action == CameraAction.RECORDING_STOP


# --- _apply_camera_actions guard ---


def test_apply_camera_actions_preserves_recording_start():
    """_apply_camera_actions does not override RECORDING_START/STOP."""
    wps = [
        WaypointData(
            lon=14.0,
            lat=50.0,
            alt=400.0,
            camera_action=CameraAction.RECORDING_START,
        ),
        WaypointData(
            lon=14.1,
            lat=50.1,
            alt=410.0,
            camera_action=CameraAction.RECORDING,
        ),
        WaypointData(
            lon=14.2,
            lat=50.2,
            alt=420.0,
            camera_action=CameraAction.RECORDING_STOP,
        ),
    ]

    _apply_camera_actions(wps)

    assert wps[0].camera_action == CameraAction.RECORDING_START
    assert wps[-1].camera_action == CameraAction.RECORDING_STOP


def test_apply_camera_actions_normal_behavior():
    """_apply_camera_actions sets first/last to NONE for normal waypoints."""
    wps = [
        WaypointData(
            lon=14.0,
            lat=50.0,
            alt=400.0,
            camera_action=CameraAction.PHOTO_CAPTURE,
        ),
        WaypointData(
            lon=14.1,
            lat=50.1,
            alt=410.0,
            camera_action=CameraAction.PHOTO_CAPTURE,
        ),
        WaypointData(
            lon=14.2,
            lat=50.2,
            alt=420.0,
            camera_action=CameraAction.PHOTO_CAPTURE,
        ),
    ]

    _apply_camera_actions(wps)

    assert wps[0].camera_action == CameraAction.NONE
    assert wps[-1].camera_action == CameraAction.NONE
    assert wps[1].camera_action == CameraAction.PHOTO_CAPTURE


# --- config resolution ---


def test_resolved_config_defaults():
    """resolved config defaults to VIDEO_CAPTURE and 5s setup duration."""
    config = ResolvedConfig()

    assert config.capture_mode == "VIDEO_CAPTURE"
    assert config.recording_setup_duration == 5.0


def test_resolved_config_override():
    """resolved config accepts overridden values."""
    config = ResolvedConfig(capture_mode="PHOTO_CAPTURE", recording_setup_duration=10.0)

    assert config.capture_mode == "PHOTO_CAPTURE"
    assert config.recording_setup_duration == 10.0


# --- duration calculation includes hover ---


def test_video_hover_duration_included():
    """video hover waypoints with hover_duration contribute to total duration."""
    config = ResolvedConfig(
        measurement_density=2,
        capture_mode="VIDEO_CAPTURE",
        recording_setup_duration=5.0,
    )
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)
    inspection = FakeInspection("HORIZONTAL_RANGE")

    wps = compute_measurement_trajectory(inspection, config, center, 243.0, 3.0, 5.0, [])

    hover_wps = [wp for wp in wps if wp.hover_duration is not None]
    assert len(hover_wps) == 2
    total_hover = sum(wp.hover_duration for wp in hover_wps)
    assert total_hover == 10.0  # 2 x 5.0


# --- merge fields ---


def test_merge_fields_include_capture_mode():
    """_MERGE_FIELDS includes capture_mode and recording_setup_duration."""
    from app.models.inspection import InspectionConfiguration

    assert "capture_mode" in InspectionConfiguration._MERGE_FIELDS
    assert "recording_setup_duration" in InspectionConfiguration._MERGE_FIELDS


# --- config_fields includes new fields ---


def test_config_fields_include_capture_mode():
    """CONFIG_FIELDS includes capture_mode and recording_setup_duration."""
    from app.models.inspection import CONFIG_FIELDS

    assert "capture_mode" in CONFIG_FIELDS
    assert "recording_setup_duration" in CONFIG_FIELDS
