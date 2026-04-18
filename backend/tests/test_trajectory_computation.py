"""unit tests for trajectory computation - arc paths, vertical paths, terrain correction."""

import math
from dataclasses import dataclass
from uuid import uuid4

import pytest

from app.models.enums import CameraAction, InspectionMethod, WaypointType
from app.services.trajectory.config_resolver import (
    check_sensor_fov,
    check_speed_framerate,
    compute_optimal_density,
    compute_optimal_speed,
    resolve_density,
    resolve_speed,
    resolve_with_defaults,
)
from app.services.trajectory.methods import compute_measurement_trajectory
from app.services.trajectory.methods.angular_sweep import calculate_arc_path
from app.services.trajectory.methods.fly_over import calculate_fly_over_path
from app.services.trajectory.methods.parallel_side_sweep import calculate_parallel_side_sweep_path
from app.services.trajectory.methods.vertical_profile import calculate_vertical_path
from app.services.trajectory.types import (
    DEFAULT_SWEEP_ANGLE,
    HOVER_ANGLE_TOLERANCE,
    MAX_ELEVATION_ANGLE,
    MIN_ELEVATION_ANGLE,
    Point3D,
    ResolvedConfig,
)

# test helpers


@dataclass
class FakeDrone:
    """minimal drone for computation tests."""

    camera_frame_rate: int = 30
    max_speed: float = 15.0
    sensor_fov: float = 60.0


@dataclass
class FakeInspection:
    """minimal inspection stub."""

    id: object = None
    method: InspectionMethod = InspectionMethod.ANGULAR_SWEEP
    config: object = None

    def __post_init__(self):
        """set default id."""
        if self.id is None:
            self.id = uuid4()


@dataclass
class FakeTemplate:
    """minimal template stub for resolve_with_defaults."""

    default_config: object = None


# resolve_with_defaults


class TestResolveWithDefaults:
    """tests for config resolution logic."""

    def test_no_config_no_template(self):
        """returns hardcoded defaults when both config and template are absent."""
        insp = FakeInspection(config=None)
        tmpl = FakeTemplate(default_config=None)
        result = resolve_with_defaults(insp, tmpl)
        assert result.measurement_density == 8
        assert result.altitude_offset == 0.0
        assert result.measurement_speed_override is None

    def test_template_config_applied(self):
        """template defaults are applied when inspection has no config."""
        from app.models.inspection import InspectionConfiguration

        tmpl_config = InspectionConfiguration(altitude_offset=3.0, measurement_density=12)
        insp = FakeInspection(config=None)
        tmpl = FakeTemplate(default_config=tmpl_config)
        result = resolve_with_defaults(insp, tmpl)
        assert result.altitude_offset == 3.0
        assert result.measurement_density == 12


# compute_optimal_density


class TestComputeOptimalDensity:
    """tests for density calculation based on setting angles."""

    def test_vertical_profile_with_angles(self):
        """density must be enough to land within tolerance of each setting angle."""
        config = ResolvedConfig()
        angles = [2.5, 3.5, 5.0]
        result = compute_optimal_density(InspectionMethod.VERTICAL_PROFILE, angles, config)
        assert result is not None
        # angular range = MAX_ELEVATION_ANGLE - MIN_ELEVATION_ANGLE
        # step = 2 * HOVER_ANGLE_TOLERANCE, density = ceil(range/step) + 1
        expected_range = MAX_ELEVATION_ANGLE - MIN_ELEVATION_ANGLE
        expected = math.ceil(expected_range / (2 * HOVER_ANGLE_TOLERANCE)) + 1
        assert result == expected

    def test_vertical_profile_no_angles(self):
        """no setting angles means no optimal density constraint."""
        config = ResolvedConfig()
        result = compute_optimal_density(InspectionMethod.VERTICAL_PROFILE, [], config)
        assert result is None

    def test_angular_sweep(self):
        """angular sweep needs at least one point per degree of sweep."""
        config = ResolvedConfig(sweep_angle=15.0)
        result = compute_optimal_density(InspectionMethod.ANGULAR_SWEEP, [], config)
        assert result is not None
        assert result == math.ceil(2 * 15.0) + 1

    def test_angular_sweep_default_angle(self):
        """uses DEFAULT_SWEEP_ANGLE when config has None."""
        config = ResolvedConfig(sweep_angle=None)
        result = compute_optimal_density(InspectionMethod.ANGULAR_SWEEP, [], config)
        assert result == math.ceil(2 * DEFAULT_SWEEP_ANGLE) + 1


# compute_optimal_speed


class TestComputeOptimalSpeed:
    """tests for speed optimization based on frame rate."""

    def test_basic_calculation(self):
        """speed ensures camera captures at least one frame per waypoint spacing."""
        drone = FakeDrone(camera_frame_rate=30, max_speed=15.0)
        # 100m path, 11 points => spacing=10m, optimal=10*30=300 m/s
        # clamped to max_speed * 0.8 = 12.0
        result = compute_optimal_speed(100.0, 11, drone)
        assert result is not None
        assert result <= 15.0 * 0.8

    def test_no_drone(self):
        """returns None when no drone."""
        result = compute_optimal_speed(100.0, 11, None)
        assert result is None

    def test_no_frame_rate(self):
        """returns None when drone has no frame rate."""
        drone = FakeDrone(camera_frame_rate=0)
        result = compute_optimal_speed(100.0, 11, drone)
        assert result is None

    def test_low_density(self):
        """returns None when density < 2."""
        drone = FakeDrone()
        result = compute_optimal_speed(100.0, 1, drone)
        assert result is None

    def test_zero_distance(self):
        """returns None when path distance is zero."""
        drone = FakeDrone()
        result = compute_optimal_speed(0.0, 10, drone)
        assert result is None


# resolve_density


class TestResolveDensity:
    """tests for density resolution with auto-increase."""

    def test_suggests_when_below_optimal(self):
        """suggests higher density without overriding user's value."""
        config = ResolvedConfig(measurement_density=3, sweep_angle=15.0)
        density, suggestion = resolve_density(InspectionMethod.ANGULAR_SWEEP, [], config)
        assert density == 3
        assert suggestion is not None
        assert "recommended" in suggestion

    def test_no_increase_when_sufficient(self):
        """density stays as configured when >= optimal."""
        config = ResolvedConfig(measurement_density=100, sweep_angle=15.0)
        density, warning = resolve_density(InspectionMethod.ANGULAR_SWEEP, [], config)
        assert density == 100
        assert warning is None


# resolve_speed


class TestResolveSpeed:
    """tests for speed resolution."""

    def test_optimal_clamped_to_default(self):
        """optimal speed is clamped to default_speed."""
        drone = FakeDrone(camera_frame_rate=30, max_speed=20.0)
        speed, _, _ = resolve_speed(100.0, 11, drone, 3.0)
        assert speed == 3.0

    def test_default_used_when_no_optimal(self):
        """default_speed used when no drone for optimal calculation."""
        speed, _, _ = resolve_speed(100.0, 11, None, 5.0)
        assert speed == 5.0

    def test_clamped_to_optimal_warns_when_default_exceeds_ceiling(self):
        """warns when configured speed exceeds camera ceiling, even though chosen is clamped."""
        drone = FakeDrone(camera_frame_rate=1, max_speed=20.0)
        # spacing=10m, frame_rate=1 => optimal=10; default=15 => chosen=min(10,15)=10
        # default_speed(15) > optimal(10) so a warning is emitted
        speed, warning, _ = resolve_speed(100.0, 11, drone, 15.0)
        assert speed == 10.0
        assert warning is not None
        assert "15.0" in warning or "10.0" in warning


# check_speed_framerate


class TestCheckSpeedFramerate:
    """tests for speed vs frame rate compatibility check."""

    def test_compatible(self):
        """no warning when speed <= optimal."""
        drone = FakeDrone(camera_frame_rate=30)
        result = check_speed_framerate(5.0, drone, optimal_speed=10.0)
        assert result is None

    def test_exceeds_optimal(self):
        """warning when speed > optimal."""
        drone = FakeDrone(camera_frame_rate=30)
        result = check_speed_framerate(15.0, drone, optimal_speed=10.0)
        assert result is not None
        assert "exceeds" in result

    def test_no_frame_rate(self):
        """no check when drone has no frame rate."""
        drone = FakeDrone(camera_frame_rate=0)
        result = check_speed_framerate(15.0, drone, optimal_speed=10.0)
        assert result is None


# check_sensor_fov


class TestCheckSensorFov:
    """tests for field of view coverage check."""

    def test_narrow_fov_warning(self):
        """warning when LHA spread exceeds sensor FOV."""
        drone = FakeDrone(sensor_fov=1.0)
        # two LHAs far apart
        positions = [
            Point3D(lon=14.0, lat=50.0, alt=300.0),
            Point3D(lon=14.01, lat=50.0, alt=300.0),
        ]
        result = check_sensor_fov(drone, positions, distance=100.0, approach_heading=0.0)
        assert result is not None
        assert "exceeds" in result

    def test_wide_fov_ok(self):
        """no warning when FOV covers all LHAs."""
        drone = FakeDrone(sensor_fov=90.0)
        positions = [
            Point3D(lon=14.0, lat=50.0, alt=300.0),
            Point3D(lon=14.0001, lat=50.0, alt=300.0),
        ]
        result = check_sensor_fov(drone, positions, distance=1000.0, approach_heading=0.0)
        assert result is None

    def test_single_lha_skipped(self):
        """fov check skipped with fewer than MIN_LHA_FOR_FOV_CHECK positions."""
        drone = FakeDrone(sensor_fov=1.0)
        positions = [Point3D(lon=14.0, lat=50.0, alt=300.0)]
        result = check_sensor_fov(drone, positions, distance=100.0)
        assert result is None


# calculate_arc_path


class TestCalculateArcPath:
    """tests for angular sweep path generation."""

    def _default_config(self, **overrides):
        """create config with sensible defaults."""
        kwargs = {
            "measurement_density": 6,
            "horizontal_distance": 400.0,
            "sweep_angle": 15.0,
            "altitude_offset": 0.0,
            "capture_mode": "PHOTO_CAPTURE",
        }
        kwargs.update(overrides)
        return ResolvedConfig(**kwargs)

    def test_correct_waypoint_count(self):
        """generates exactly density waypoints."""
        config = self._default_config(measurement_density=8)
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_arc_path(center, 60.0, 3.0, config, uuid4(), 5.0)
        assert len(wps) == 8

    def test_all_measurement_type(self):
        """all waypoints are MEASUREMENT type."""
        config = self._default_config()
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_arc_path(center, 60.0, 3.0, config, uuid4(), 5.0)
        assert all(wp.waypoint_type == WaypointType.MEASUREMENT for wp in wps)

    def test_constant_altitude(self):
        """arc path maintains constant altitude across sweep."""
        config = self._default_config()
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_arc_path(center, 60.0, 3.0, config, uuid4(), 5.0)
        alts = [wp.alt for wp in wps]
        assert max(alts) - min(alts) < 0.01

    def test_headings_face_center(self):
        """all waypoints should have heading pointing toward center."""
        config = self._default_config()
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_arc_path(center, 60.0, 3.0, config, uuid4(), 5.0)
        # heading should be roughly toward center, not away from it
        for wp in wps:
            assert 0 <= wp.heading < 360

    def test_video_capture_mode(self):
        """video capture mode sets RECORDING camera action."""
        config = self._default_config(capture_mode="VIDEO_CAPTURE")
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_arc_path(center, 60.0, 3.0, config, uuid4(), 5.0)
        assert all(wp.camera_action == CameraAction.RECORDING for wp in wps)

    def test_single_density(self):
        """density=1 places single waypoint on approach centerline."""
        config = self._default_config(measurement_density=1)
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_arc_path(center, 60.0, 3.0, config, uuid4(), 5.0)
        assert len(wps) == 1

    def test_altitude_offset_applied(self):
        """altitude_offset raises all waypoints."""
        config_no_offset = self._default_config(altitude_offset=0.0)
        config_with_offset = self._default_config(altitude_offset=10.0)
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)

        wps_base = calculate_arc_path(center, 60.0, 3.0, config_no_offset, uuid4(), 5.0)
        wps_offset = calculate_arc_path(center, 60.0, 3.0, config_with_offset, uuid4(), 5.0)

        for base, offset in zip(wps_base, wps_offset):
            assert abs(offset.alt - base.alt - 10.0) < 0.01

    def test_inspection_id_propagated(self):
        """inspection_id is set on all waypoints."""
        config = self._default_config()
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        insp_id = uuid4()
        wps = calculate_arc_path(center, 60.0, 3.0, config, insp_id, 5.0)
        assert all(wp.inspection_id == insp_id for wp in wps)

    def test_measurement_speed_override_applies(self):
        """measurement_speed_override wins over transit speed."""
        config = self._default_config(measurement_speed_override=2.0)
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_arc_path(center, 60.0, 3.0, config, uuid4(), 7.0)
        assert wps, "expected at least one waypoint"
        for wp in wps:
            assert wp.speed == 2.0

    def test_measurement_speed_falls_back_to_transit(self):
        """without measurement_speed_override, waypoints use the transit speed."""
        config = self._default_config()
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_arc_path(center, 60.0, 3.0, config, uuid4(), 7.0)
        for wp in wps:
            assert wp.speed == 7.0


# calculate_vertical_path


class TestCalculateVerticalPath:
    """tests for vertical profile path generation."""

    def _default_config(self, **overrides):
        """create config with sensible defaults."""
        kwargs = {
            "measurement_density": 8,
            "horizontal_distance": 400.0,
            "hover_duration": 3.0,
            "altitude_offset": 0.0,
            "capture_mode": "PHOTO_CAPTURE",
        }
        kwargs.update(overrides)
        return ResolvedConfig(**kwargs)

    def test_correct_waypoint_count(self):
        """generates exactly density waypoints."""
        config = self._default_config()
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_vertical_path(center, 60.0, config, uuid4(), 5.0, [])
        assert len(wps) == 8

    def test_altitude_increases(self):
        """vertical profile waypoints ascend from min to max elevation."""
        config = self._default_config(measurement_density=10)
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_vertical_path(center, 60.0, config, uuid4(), 5.0, [])
        alts = [wp.alt for wp in wps]
        assert alts == sorted(alts), "altitudes should be monotonically increasing"
        assert alts[-1] > alts[0], "last waypoint should be higher than first"

    def test_constant_lon_lat(self):
        """vertical profile keeps drone at same horizontal position."""
        config = self._default_config()
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_vertical_path(center, 60.0, config, uuid4(), 5.0, [])
        lons = [wp.lon for wp in wps]
        lats = [wp.lat for wp in wps]
        # all should be the same position (vertical climb)
        assert max(lons) - min(lons) < 1e-8
        assert max(lats) - min(lats) < 1e-8

    def test_no_hover_at_setting_angles(self):
        """vertical profile is one continuous measurement pass - no HOVER stops at
        LHA setting angles even when density is high enough to land on them."""
        config = self._default_config(measurement_density=5)
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        mid_angle = (MIN_ELEVATION_ANGLE + MAX_ELEVATION_ANGLE) / 2
        wps = calculate_vertical_path(center, 60.0, config, uuid4(), 5.0, [mid_angle])

        hover_wps = [wp for wp in wps if wp.waypoint_type == WaypointType.HOVER]
        assert len(hover_wps) == 0
        # every waypoint is a measurement and carries no hover_duration
        assert all(wp.waypoint_type == WaypointType.MEASUREMENT for wp in wps)
        assert all(wp.hover_duration is None for wp in wps)

    def test_no_hover_without_angles(self):
        """no HOVER waypoints when no setting angles."""
        config = self._default_config()
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_vertical_path(center, 60.0, config, uuid4(), 5.0, [])
        hover_wps = [wp for wp in wps if wp.waypoint_type == WaypointType.HOVER]
        assert len(hover_wps) == 0

    def test_measurement_speed_override_applies(self):
        """measurement_speed_override wins over the passed transit speed."""
        config = self._default_config(measurement_speed_override=2.0)
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_vertical_path(center, 60.0, config, uuid4(), 7.0, [])
        assert wps, "expected at least one waypoint"
        for wp in wps:
            assert wp.speed == 2.0

    def test_measurement_speed_falls_back_to_transit(self):
        """without measurement_speed_override, waypoints use the transit speed."""
        config = self._default_config()
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        wps = calculate_vertical_path(center, 60.0, config, uuid4(), 7.0, [])
        for wp in wps:
            assert wp.speed == 7.0


# compute_measurement_trajectory


class TestComputeMeasurementTrajectory:
    """tests for the dispatch function."""

    def test_arc_dispatch(self):
        """dispatches to arc path for ANGULAR_SWEEP."""
        config = ResolvedConfig(
            measurement_density=6,
            horizontal_distance=400.0,
            sweep_angle=15.0,
            capture_mode="PHOTO_CAPTURE",
        )
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        insp = FakeInspection(method=InspectionMethod.ANGULAR_SWEEP)
        wps = compute_measurement_trajectory(insp, config, center, 60.0, 3.0, 5.0, [])
        assert len(wps) == 6
        assert all(wp.waypoint_type == WaypointType.MEASUREMENT for wp in wps)

    def test_vertical_dispatch(self):
        """dispatches to vertical path for VERTICAL_PROFILE."""
        config = ResolvedConfig(
            measurement_density=8,
            horizontal_distance=400.0,
            hover_duration=3.0,
            capture_mode="PHOTO_CAPTURE",
        )
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        insp = FakeInspection(method=InspectionMethod.VERTICAL_PROFILE)
        wps = compute_measurement_trajectory(insp, config, center, 60.0, 3.0, 5.0, [])
        assert len(wps) == 8

    def test_video_mode_adds_hover_bookends(self):
        """VIDEO_CAPTURE mode wraps waypoints with recording start/stop hovers."""
        config = ResolvedConfig(
            measurement_density=6,
            horizontal_distance=400.0,
            sweep_angle=15.0,
            capture_mode="VIDEO_CAPTURE",
            recording_setup_duration=5.0,
        )
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        insp = FakeInspection(method=InspectionMethod.ANGULAR_SWEEP)
        wps = compute_measurement_trajectory(insp, config, center, 60.0, 3.0, 5.0, [])
        # 6 measurement + 2 hover bookends
        assert len(wps) == 8
        assert wps[0].camera_action == CameraAction.RECORDING_START
        assert wps[-1].camera_action == CameraAction.RECORDING_STOP

    def test_unsupported_method_raises(self):
        """raises ValueError for unknown inspection method."""
        config = ResolvedConfig()
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        insp = FakeInspection(method="UNKNOWN")
        with pytest.raises(ValueError, match="unsupported"):
            compute_measurement_trajectory(insp, config, center, 60.0, 3.0, 5.0, [])

    def test_terrain_correction_applied(self):
        """terrain delta shifts waypoint altitudes."""
        config = ResolvedConfig(
            measurement_density=4,
            horizontal_distance=400.0,
            sweep_angle=15.0,
            capture_mode="PHOTO_CAPTURE",
        )
        center = Point3D(lon=14.26, lat=50.1, alt=300.0)
        insp = FakeInspection(method=InspectionMethod.ANGULAR_SWEEP)

        # flat provider - all elevations same as center, so no delta
        from app.services.elevation_provider import FlatElevationProvider

        provider = FlatElevationProvider(300.0)
        wps_flat = compute_measurement_trajectory(
            insp, config, center, 60.0, 3.0, 5.0, [], elevation_provider=provider
        )

        wps_no_terrain = compute_measurement_trajectory(
            insp, config, center, 60.0, 3.0, 5.0, [], elevation_provider=None
        )

        # flat terrain should produce same altitudes as no terrain correction
        for flat, raw in zip(wps_flat, wps_no_terrain):
            assert abs(flat.alt - raw.alt) < 0.1


# calculate_fly_over_path


class TestCalculateFlyOverPath:
    """tests for fly-over path measurement speed handling."""

    @staticmethod
    def _lha_row() -> list[Point3D]:
        """two LHA positions forming a short row."""
        return [
            Point3D(lon=14.260, lat=50.100, alt=300.0),
            Point3D(lon=14.261, lat=50.100, alt=300.0),
        ]

    def test_measurement_speed_override_applies(self):
        """measurement_speed_override wins over transit speed."""
        config = ResolvedConfig(
            measurement_speed_override=2.0,
            capture_mode="PHOTO_CAPTURE",
        )
        wps = calculate_fly_over_path(self._lha_row(), config, uuid4(), 7.0)
        assert wps, "expected at least one waypoint"
        for wp in wps:
            assert wp.speed == 2.0

    def test_measurement_speed_falls_back_to_transit(self):
        """without measurement_speed_override, waypoints use the transit speed."""
        config = ResolvedConfig(capture_mode="PHOTO_CAPTURE")
        wps = calculate_fly_over_path(self._lha_row(), config, uuid4(), 7.0)
        for wp in wps:
            assert wp.speed == 7.0


# calculate_parallel_side_sweep_path


class TestCalculateParallelSideSweepPath:
    """tests for parallel-side-sweep path measurement speed handling."""

    @staticmethod
    def _lha_row() -> list[Point3D]:
        """two LHA positions forming a short row."""
        return [
            Point3D(lon=14.260, lat=50.100, alt=300.0),
            Point3D(lon=14.261, lat=50.100, alt=300.0),
        ]

    @staticmethod
    def _runway_center() -> Point3D:
        """runway centerline reference point."""
        return Point3D(lon=14.2605, lat=50.101, alt=300.0)

    def test_measurement_speed_override_applies(self):
        """measurement_speed_override wins over transit speed."""
        config = ResolvedConfig(
            measurement_speed_override=2.0,
            capture_mode="PHOTO_CAPTURE",
        )
        wps = calculate_parallel_side_sweep_path(
            self._lha_row(), self._runway_center(), config, uuid4(), 7.0
        )
        assert wps, "expected at least one waypoint"
        for wp in wps:
            assert wp.speed == 2.0

    def test_measurement_speed_falls_back_to_transit(self):
        """without measurement_speed_override, waypoints use the transit speed."""
        config = ResolvedConfig(capture_mode="PHOTO_CAPTURE")
        wps = calculate_parallel_side_sweep_path(
            self._lha_row(), self._runway_center(), config, uuid4(), 7.0
        )
        for wp in wps:
            assert wp.speed == 7.0
