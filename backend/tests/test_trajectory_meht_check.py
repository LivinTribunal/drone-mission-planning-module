"""unit tests for meht-check trajectory generation."""

import math
from dataclasses import dataclass
from uuid import uuid4

import pytest

from app.models.enums import CameraAction, InspectionMethod, WaypointType
from app.services.trajectory.methods import compute_measurement_trajectory
from app.services.trajectory.methods.meht_check import calculate_meht_check_path
from app.services.trajectory.types import (
    DEFAULT_MEHT_HOVER_DURATION,
    Point3D,
    ResolvedConfig,
)
from app.utils.geo import bearing_between


@dataclass
class FakeInspection:
    """minimal inspection stub."""

    id: object = None
    method: InspectionMethod = InspectionMethod.MEHT_CHECK
    config: object = None

    def __post_init__(self):
        """set default id."""
        if self.id is None:
            self.id = uuid4()


# meht point calculation


class TestMehtPointCalculation:
    """tests for MEHT height formula."""

    def test_standard_3deg_glide_slope(self):
        """3 deg glide slope at 300m distance gives ~15.7m height."""
        distance = 300.0
        glide_slope = 3.0
        height = distance * math.tan(math.radians(glide_slope))
        assert abs(height - 15.72) < 0.1

    def test_steeper_glide_slope(self):
        """steeper angle produces higher MEHT."""
        distance = 300.0
        h3 = distance * math.tan(math.radians(3.0))
        h4 = distance * math.tan(math.radians(4.0))
        assert h4 > h3

    def test_zero_distance_gives_zero_height(self):
        """zero distance from threshold means zero MEHT height."""
        height = 0.0 * math.tan(math.radians(3.0))
        assert height == 0.0


# trajectory generation


class TestMehtCheckPath:
    """tests for meht-check trajectory generator."""

    def test_single_hover_waypoint(self):
        """produces exactly one hover waypoint."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_meht_check_path(meht, lha_center, 90.0, cfg, uuid4(), speed=0.0)
        assert len(wps) == 1
        assert wps[0].waypoint_type == WaypointType.HOVER

    def test_default_hover_duration(self):
        """uses default meht hover duration when config has none."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_meht_check_path(meht, lha_center, 90.0, cfg, uuid4(), speed=0.0)
        assert wps[0].hover_duration == DEFAULT_MEHT_HOVER_DURATION

    def test_custom_hover_duration(self):
        """config hover_duration overrides default."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig(hover_duration=20.0)
        wps = calculate_meht_check_path(meht, lha_center, 90.0, cfg, uuid4(), speed=0.0)
        assert wps[0].hover_duration == 20.0

    def test_position_matches_meht_point(self):
        """waypoint position is exactly the meht point."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_meht_check_path(meht, lha_center, 90.0, cfg, uuid4(), speed=0.0)
        assert wps[0].lon == meht.lon
        assert wps[0].lat == meht.lat
        assert wps[0].alt == meht.alt

    def test_heading_toward_lha_center(self):
        """drone heading points from meht toward the PAPI lha center."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        # lha center is east of meht
        lha_center = Point3D(lon=14.265, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_meht_check_path(meht, lha_center, 90.0, cfg, uuid4(), speed=0.0)
        expected = bearing_between(meht.lon, meht.lat, lha_center.lon, lha_center.lat)
        assert abs(wps[0].heading - expected) < 1.0

    def test_gimbal_pitch_computed(self):
        """gimbal pitch is computed from meht point to lha center."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_meht_check_path(meht, lha_center, 90.0, cfg, uuid4(), speed=0.0)
        # meht is above lha center, so gimbal should be negative (looking down)
        assert wps[0].gimbal_pitch is not None
        assert wps[0].gimbal_pitch < 0

    def test_gimbal_override(self):
        """config camera_gimbal_angle overrides computed pitch."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig(camera_gimbal_angle=-45.0)
        wps = calculate_meht_check_path(meht, lha_center, 90.0, cfg, uuid4(), speed=0.0)
        assert wps[0].gimbal_pitch == -45.0

    def test_camera_target_is_lha_center(self):
        """camera target is set to lha center."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_meht_check_path(meht, lha_center, 90.0, cfg, uuid4(), speed=0.0)
        assert wps[0].camera_target == lha_center

    def test_photo_mode(self):
        """photo capture mode emits PHOTO_CAPTURE camera action."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig(capture_mode="PHOTO_CAPTURE")
        wps = calculate_meht_check_path(meht, lha_center, 90.0, cfg, uuid4(), speed=0.0)
        assert wps[0].camera_action == CameraAction.PHOTO_CAPTURE

    def test_video_mode(self):
        """video capture mode emits RECORDING camera action."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig(capture_mode="VIDEO_CAPTURE")
        wps = calculate_meht_check_path(meht, lha_center, 90.0, cfg, uuid4(), speed=0.0)
        assert wps[0].camera_action == CameraAction.RECORDING

    def test_dispatch_requires_target(self):
        """dispatcher rejects meht-check without a computed meht position."""
        insp = FakeInspection(method=InspectionMethod.MEHT_CHECK)
        cfg = ResolvedConfig()
        with pytest.raises(ValueError):
            compute_measurement_trajectory(
                insp,
                cfg,
                center=Point3D(lon=14.26, lat=50.1, alt=380.0),
                runway_heading=0.0,
                glide_slope=3.0,
                speed=0.0,
                setting_angles=[],
                target_lha_position=None,
                target_agl_type="PAPI",
            )
