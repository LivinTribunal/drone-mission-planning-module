"""unit tests for meht-check trajectory generation."""

import math
from dataclasses import dataclass, field
from unittest.mock import patch
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
        wps = calculate_meht_check_path(meht, lha_center, cfg, uuid4(), speed=0.0)
        assert len(wps) == 1
        assert wps[0].waypoint_type == WaypointType.HOVER

    def test_default_hover_duration(self):
        """uses default meht hover duration when config has none."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_meht_check_path(meht, lha_center, cfg, uuid4(), speed=0.0)
        assert wps[0].hover_duration == DEFAULT_MEHT_HOVER_DURATION

    def test_custom_hover_duration(self):
        """config hover_duration overrides default."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig(hover_duration=20.0)
        wps = calculate_meht_check_path(meht, lha_center, cfg, uuid4(), speed=0.0)
        assert wps[0].hover_duration == 20.0

    def test_position_matches_meht_point(self):
        """waypoint position is exactly the meht point."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_meht_check_path(meht, lha_center, cfg, uuid4(), speed=0.0)
        assert wps[0].lon == meht.lon
        assert wps[0].lat == meht.lat
        assert wps[0].alt == meht.alt

    def test_heading_toward_lha_center(self):
        """drone heading points from meht toward the PAPI lha center."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        # lha center is east of meht
        lha_center = Point3D(lon=14.265, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_meht_check_path(meht, lha_center, cfg, uuid4(), speed=0.0)
        expected = bearing_between(meht.lon, meht.lat, lha_center.lon, lha_center.lat)
        assert abs(wps[0].heading - expected) < 1.0

    def test_gimbal_pitch_computed(self):
        """gimbal pitch is computed from meht point to lha center."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_meht_check_path(meht, lha_center, cfg, uuid4(), speed=0.0)
        # meht is above lha center, so gimbal should be negative (looking down)
        assert wps[0].gimbal_pitch is not None
        assert wps[0].gimbal_pitch < 0

    def test_gimbal_override(self):
        """config camera_gimbal_angle overrides computed pitch."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig(camera_gimbal_angle=-45.0)
        wps = calculate_meht_check_path(meht, lha_center, cfg, uuid4(), speed=0.0)
        assert wps[0].gimbal_pitch == -45.0

    def test_camera_target_is_lha_center(self):
        """camera target is set to lha center."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_meht_check_path(meht, lha_center, cfg, uuid4(), speed=0.0)
        assert wps[0].camera_target == lha_center

    def test_photo_mode(self):
        """photo capture mode emits PHOTO_CAPTURE camera action."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig(capture_mode="PHOTO_CAPTURE")
        wps = calculate_meht_check_path(meht, lha_center, cfg, uuid4(), speed=0.0)
        assert wps[0].camera_action == CameraAction.PHOTO_CAPTURE

    def test_video_mode(self):
        """video capture mode emits RECORDING camera action."""
        meht = Point3D(lon=14.26, lat=50.1, alt=395.0)
        lha_center = Point3D(lon=14.263, lat=50.1, alt=380.0)
        cfg = ResolvedConfig(capture_mode="VIDEO_CAPTURE")
        wps = calculate_meht_check_path(meht, lha_center, cfg, uuid4(), speed=0.0)
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


# prepare step


@dataclass
class FakeAgl:
    """minimal AGL stub for prepare tests."""

    surface_id: object = None
    distance_from_threshold: float | None = 300.0

    def __post_init__(self):
        """set default surface_id."""
        if self.surface_id is None:
            self.surface_id = uuid4()


@dataclass
class FakeSurface:
    """minimal surface stub for prepare tests."""

    id: object = None
    heading: float | None = None
    threshold_position: object = None

    def __post_init__(self):
        """set default id."""
        if self.id is None:
            self.id = uuid4()


@dataclass
class FakeTemplate:
    """minimal template stub for prepare tests."""

    targets: list = field(default_factory=list)


class TestPrepareMehtCheck:
    """tests for _prepare_meht_check horizontal position offset."""

    @patch("app.services.trajectory.methods.get_threshold_position")
    def test_meht_point_offset_from_threshold(self, mock_threshold):
        """meht point lat/lon must differ from threshold when dist > 0."""
        from app.services.trajectory.methods import _prepare_meht_check

        threshold = Point3D(lon=14.26, lat=50.1, alt=380.0)
        mock_threshold.return_value = threshold

        surface_id = uuid4()
        agl = FakeAgl(surface_id=surface_id, distance_from_threshold=300.0)
        surface = FakeSurface(id=surface_id, heading=90.0)
        template = FakeTemplate(targets=[agl])

        result = _prepare_meht_check(
            inspection=FakeInspection(),
            config=ResolvedConfig(),
            center=Point3D(lon=14.26, lat=50.1, alt=380.0),
            rwy_heading=90.0,
            glide_slope=3.0,
            ordered_lhas=[],
            default_speed=5.0,
            template=template,
            surfaces=[surface],
            label="test",
        )

        pos = result.target_lha_pos
        assert pos is not None
        assert pos.lon != threshold.lon or pos.lat != threshold.lat

    @patch("app.services.trajectory.methods.get_threshold_position")
    def test_meht_point_altitude_correct(self, mock_threshold):
        """altitude = threshold alt + meht height + altitude offset."""
        from app.services.trajectory.methods import _prepare_meht_check

        threshold = Point3D(lon=14.26, lat=50.1, alt=380.0)
        mock_threshold.return_value = threshold

        surface_id = uuid4()
        agl = FakeAgl(surface_id=surface_id, distance_from_threshold=300.0)
        template = FakeTemplate(targets=[agl])

        config = ResolvedConfig(altitude_offset=5.0)
        result = _prepare_meht_check(
            inspection=FakeInspection(),
            config=config,
            center=Point3D(lon=14.26, lat=50.1, alt=380.0),
            rwy_heading=90.0,
            glide_slope=3.0,
            ordered_lhas=[],
            default_speed=5.0,
            template=template,
            surfaces=[FakeSurface(id=surface_id)],
            label="test",
        )

        expected_height = 300.0 * math.tan(math.radians(3.0))
        expected_alt = 380.0 + expected_height + 5.0
        assert abs(result.target_lha_pos.alt - expected_alt) < 0.01

    @patch("app.services.trajectory.methods.get_threshold_position")
    def test_meht_offset_direction_reciprocal(self, mock_threshold):
        """offset should be along reciprocal heading (approach direction)."""
        from app.services.trajectory.methods import _prepare_meht_check

        threshold = Point3D(lon=14.26, lat=50.1, alt=380.0)
        mock_threshold.return_value = threshold

        surface_id = uuid4()
        agl = FakeAgl(surface_id=surface_id, distance_from_threshold=300.0)
        template = FakeTemplate(targets=[agl])

        # rwy heading north (0) - approach from south (180) - lat should decrease
        result = _prepare_meht_check(
            inspection=FakeInspection(),
            config=ResolvedConfig(),
            center=Point3D(lon=14.26, lat=50.1, alt=380.0),
            rwy_heading=0.0,
            glide_slope=3.0,
            ordered_lhas=[],
            default_speed=5.0,
            template=template,
            surfaces=[FakeSurface(id=surface_id)],
            label="test",
        )

        pos = result.target_lha_pos
        assert pos.lat < threshold.lat
