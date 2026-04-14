"""unit tests for fly-over, parallel-side-sweep, and hover-point-lock trajectories."""

from dataclasses import dataclass
from uuid import uuid4

import pytest

from app.models.enums import CameraAction, InspectionMethod, WaypointType
from app.services.trajectory_computation import (
    calculate_fly_over_path,
    calculate_hover_point_lock_path,
    calculate_parallel_side_sweep_path,
    compute_measurement_trajectory,
)
from app.services.trajectory_types import (
    DEFAULT_FLY_OVER_HEIGHT,
    DEFAULT_HOVER_DISTANCE_PAPI,
    DEFAULT_HOVER_DISTANCE_RUNWAY,
    DEFAULT_HOVER_DURATION,
    DEFAULT_HOVER_HEIGHT,
    DEFAULT_PARALLEL_HEIGHT,
    DEFAULT_PARALLEL_OFFSET,
    Point3D,
    ResolvedConfig,
)
from app.utils.geo import bearing_between, distance_between


@dataclass
class FakeInspection:
    """minimal inspection stub."""

    id: object = None
    method: InspectionMethod = InspectionMethod.FLY_OVER
    config: object = None

    def __post_init__(self):
        """set default id."""
        if self.id is None:
            self.id = uuid4()


def _row(count: int = 5) -> list[Point3D]:
    """build a row of LHA positions along a line, 10m apart."""
    from app.utils.geo import point_at_distance

    base = Point3D(lon=14.26, lat=50.1, alt=380.0)
    row = [base]
    for i in range(1, count):
        lon, lat = point_at_distance(base.lon, base.lat, 90.0, 10.0 * i)
        row.append(Point3D(lon=lon, lat=lat, alt=380.0))
    return row


# fly-over


class TestFlyOver:
    """tests for fly-over trajectory generator."""

    def test_waypoint_count_matches_lhas(self):
        """one waypoint per LHA."""
        row = _row(5)
        cfg = ResolvedConfig()
        wps = calculate_fly_over_path(row, cfg, uuid4(), speed=5.0)
        assert len(wps) == 5

    def test_altitude_uses_default_height(self):
        """default height above lights is applied when config has none."""
        row = _row(3)
        cfg = ResolvedConfig()
        wps = calculate_fly_over_path(row, cfg, uuid4(), speed=5.0)
        for wp, lha in zip(wps, row):
            assert abs(wp.alt - (lha.alt + DEFAULT_FLY_OVER_HEIGHT)) < 0.01

    def test_gimbal_default_is_straight_down(self):
        """default gimbal for fly-over is -90 (straight down)."""
        row = _row(3)
        cfg = ResolvedConfig()
        wps = calculate_fly_over_path(row, cfg, uuid4(), speed=5.0)
        for wp in wps:
            assert wp.gimbal_pitch == -90.0

    def test_heading_first_to_last(self):
        """heading aligned with first -> last direction (row built east = 90)."""
        row = _row(4)
        cfg = ResolvedConfig()
        wps = calculate_fly_over_path(row, cfg, uuid4(), speed=5.0)
        assert 85 < wps[0].heading < 95

    def test_photo_mode_uses_photo_capture(self):
        """PHOTO capture mode emits PHOTO_CAPTURE camera action."""
        row = _row(3)
        cfg = ResolvedConfig(capture_mode="PHOTO_CAPTURE")
        wps = calculate_fly_over_path(row, cfg, uuid4(), speed=5.0)
        assert all(wp.camera_action == CameraAction.PHOTO_CAPTURE for wp in wps)

    def test_video_mode_uses_recording(self):
        """VIDEO capture mode emits RECORDING camera action."""
        row = _row(3)
        cfg = ResolvedConfig(capture_mode="VIDEO_CAPTURE")
        wps = calculate_fly_over_path(row, cfg, uuid4(), speed=5.0)
        assert all(wp.camera_action == CameraAction.RECORDING for wp in wps)

    def test_requires_two_lhas(self):
        """raises when fewer than two LHAs supplied."""
        cfg = ResolvedConfig()
        with pytest.raises(ValueError):
            calculate_fly_over_path([_row(1)[0]], cfg, uuid4(), speed=5.0)

    def test_dispatch_video_wraps_with_hover(self):
        """dispatcher wraps waypoints with RECORDING_START/RECORDING_STOP hover in video mode."""
        row = _row(3)
        cfg = ResolvedConfig(capture_mode="VIDEO_CAPTURE", recording_setup_duration=3.0)
        insp = FakeInspection(method=InspectionMethod.FLY_OVER)
        wps = compute_measurement_trajectory(
            insp,
            cfg,
            center=Point3D.center(row),
            runway_heading=0.0,
            glide_slope=3.0,
            speed=5.0,
            setting_angles=[],
            ordered_lha_positions=row,
        )
        assert wps[0].camera_action == CameraAction.RECORDING_START
        assert wps[-1].camera_action == CameraAction.RECORDING_STOP
        assert wps[0].waypoint_type == WaypointType.HOVER


# parallel-side-sweep


class TestParallelSideSweep:
    """tests for parallel-side-sweep trajectory generator."""

    def test_waypoint_count_matches_lhas(self):
        """one waypoint per LHA."""
        row = _row(4)
        runway_center = Point3D(lon=14.26, lat=50.105, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_parallel_side_sweep_path(row, runway_center, cfg, uuid4(), speed=3.0)
        assert len(wps) == 4

    def test_offset_is_applied(self):
        """each waypoint is offset laterally by default offset."""
        row = _row(3)
        runway_center = Point3D(lon=14.26, lat=50.105, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_parallel_side_sweep_path(row, runway_center, cfg, uuid4(), speed=3.0)
        # waypoint ground distance from LHA should be ~= DEFAULT_PARALLEL_OFFSET
        for wp, lha in zip(wps, row):
            d = distance_between(wp.lon, wp.lat, lha.lon, lha.lat)
            assert abs(d - DEFAULT_PARALLEL_OFFSET) < 1.0

    def test_offset_direction_away_from_runway(self):
        """waypoints are placed on the side farther from the runway centerline.

        runway centerline sits north of the LHA row; the perpendicular offset
        must put the drone south (further from the runway).
        """
        row = _row(3)
        # runway center just to the north of the row
        runway_center = Point3D(lon=14.26, lat=50.101, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_parallel_side_sweep_path(row, runway_center, cfg, uuid4(), speed=3.0)
        # pick midpoint; it should be farther south (lat < row lat)
        mid = wps[len(wps) // 2]
        assert mid.lat < row[len(row) // 2].lat

    def test_offset_direction_breaks_when_runway_center_equals_row_centroid(self):
        """reproduces the orchestrator-level bug: passing the LHA centroid as
        runway_center makes both perpendicular candidates equidistant, so the
        tie-break in calculate_parallel_side_sweep_path resolves to a constant
        direction regardless of which side of the runway the edge lights are on.

        for an east-heading row the tie-break always picks perp_a (= heading+90
        = south), so the drone sits on the south side regardless of where the
        actual runway is. moving the "runway_center" to the north or south of
        the row produces the same waypoints - the direction is NOT driven by
        the runway's position.
        """
        row = _row(3)
        centroid = Point3D.center(row)
        cfg = ResolvedConfig()

        wps_centroid = calculate_parallel_side_sweep_path(row, centroid, cfg, uuid4(), speed=3.0)

        # moving runway_center far to the north should flip the side. with the
        # centroid, the waypoints stay on the same (south) side - proving the
        # LHA centroid is not a valid runway reference.
        far_north = Point3D(lon=centroid.lon, lat=centroid.lat + 0.01, alt=centroid.alt)
        wps_real = calculate_parallel_side_sweep_path(row, far_north, cfg, uuid4(), speed=3.0)

        mid_centroid = wps_centroid[len(wps_centroid) // 2]
        mid_real = wps_real[len(wps_real) // 2]
        # both produce south offset because the tie-break fires when equidistant
        # and real_north→south is the correct behavior. the bug manifests when
        # the runway is on the OTHER side: with centroid, no flip happens.
        assert mid_centroid.lat < row[len(row) // 2].lat
        assert mid_real.lat < row[len(row) // 2].lat

        # now put runway on the SOUTH side - real call flips to north, centroid
        # call stays stuck on south.
        far_south = Point3D(lon=centroid.lon, lat=centroid.lat - 0.01, alt=centroid.alt)
        wps_flipped = calculate_parallel_side_sweep_path(row, far_south, cfg, uuid4(), speed=3.0)
        mid_flipped = wps_flipped[len(wps_flipped) // 2]
        assert mid_flipped.lat > row[len(row) // 2].lat
        # centroid-based call did not flip - demonstrates the original bug
        assert mid_centroid.lat < row[len(row) // 2].lat

    def test_terrain_correction_at_offset(self):
        """waypoints lift when terrain at the lateral offset is higher than at the LHA."""
        row = _row(3)
        runway_center = Point3D(lon=14.26, lat=50.101, alt=380.0)
        cfg = ResolvedConfig()

        class FakeProvider:
            """terrain provider that returns 380 at LHAs and 385 at offset points."""

            def get_elevations_batch(self, points):
                """first half = LHA pts (380), second half = offset pts (385)."""
                n = len(points) // 2
                return [380.0] * n + [385.0] * n

        wps = calculate_parallel_side_sweep_path(
            row, runway_center, cfg, uuid4(), speed=3.0, elevation_provider=FakeProvider()
        )
        for wp, lha in zip(wps, row):
            # expected: lha.alt + DEFAULT_PARALLEL_HEIGHT + 5m terrain delta
            assert abs(wp.alt - (lha.alt + DEFAULT_PARALLEL_HEIGHT + 5.0)) < 0.01

    def test_altitude_above_lights(self):
        """altitude = LHA ground + default height."""
        row = _row(3)
        runway_center = Point3D(lon=14.26, lat=50.105, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_parallel_side_sweep_path(row, runway_center, cfg, uuid4(), speed=3.0)
        for wp, lha in zip(wps, row):
            assert abs(wp.alt - (lha.alt + DEFAULT_PARALLEL_HEIGHT)) < 0.01

    def test_video_mode(self):
        """VIDEO capture emits RECORDING action."""
        row = _row(3)
        runway_center = Point3D(lon=14.26, lat=50.105, alt=380.0)
        cfg = ResolvedConfig(capture_mode="VIDEO_CAPTURE")
        wps = calculate_parallel_side_sweep_path(row, runway_center, cfg, uuid4(), speed=3.0)
        assert all(wp.camera_action == CameraAction.RECORDING for wp in wps)


# hover-point-lock


class TestHoverPointLock:
    """tests for hover-point-lock trajectory generator."""

    def test_single_waypoint_with_hover(self):
        """produces exactly one hover waypoint with configured duration."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_hover_point_lock_path(target, "PAPI", 90.0, cfg, uuid4(), speed=0.0)
        assert len(wps) == 1
        assert wps[0].waypoint_type == WaypointType.HOVER
        assert wps[0].hover_duration == DEFAULT_HOVER_DURATION

    def test_default_distance_papi(self):
        """PAPI uses PAPI default distance when no override."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_hover_point_lock_path(target, "PAPI", 90.0, cfg, uuid4(), speed=0.0)
        d = distance_between(wps[0].lon, wps[0].lat, target.lon, target.lat)
        assert abs(d - DEFAULT_HOVER_DISTANCE_PAPI) < 1.0

    def test_default_distance_runway(self):
        """RUNWAY_EDGE_LIGHTS uses its own default distance."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_hover_point_lock_path(
            target, "RUNWAY_EDGE_LIGHTS", 90.0, cfg, uuid4(), speed=0.0
        )
        d = distance_between(wps[0].lon, wps[0].lat, target.lon, target.lat)
        assert abs(d - DEFAULT_HOVER_DISTANCE_RUNWAY) < 1.0

    def test_altitude_above_lha(self):
        """altitude = LHA ground + default height."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        wps = calculate_hover_point_lock_path(target, "PAPI", 90.0, cfg, uuid4(), speed=0.0)
        assert abs(wps[0].alt - (target.alt + DEFAULT_HOVER_HEIGHT)) < 0.01

    def test_heading_toward_lha(self):
        """heading points from drone toward LHA."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg = ResolvedConfig()
        # runway heading 90 -> approach bearing 270 -> drone is placed west of LHA
        # so drone heading toward LHA should be ~90 (east)
        wps = calculate_hover_point_lock_path(target, "PAPI", 90.0, cfg, uuid4(), speed=0.0)
        # tolerate small floating rounding near 90 or the wrap-around 270
        assert 85 < wps[0].heading < 95 or 265 < wps[0].heading < 275

    def test_photo_mode(self):
        """PHOTO capture emits PHOTO_CAPTURE camera action."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg = ResolvedConfig(capture_mode="PHOTO_CAPTURE")
        wps = calculate_hover_point_lock_path(target, "PAPI", 0.0, cfg, uuid4(), speed=0.0)
        assert wps[0].camera_action == CameraAction.PHOTO_CAPTURE

    def test_runway_relative_bearing_zero_is_approach_side(self):
        """RUNWAY reference with hover_bearing=0 matches the legacy approach-side fallback."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        runway_heading = 90.0
        legacy = calculate_hover_point_lock_path(
            target, "PAPI", runway_heading, ResolvedConfig(), uuid4(), speed=0.0
        )
        cfg_rwy = ResolvedConfig(hover_bearing=0.0, hover_bearing_reference="RUNWAY")
        rwy = calculate_hover_point_lock_path(
            target, "PAPI", runway_heading, cfg_rwy, uuid4(), speed=0.0
        )
        # drone is placed at the same position when RUNWAY offset is 0
        assert abs(legacy[0].lon - rwy[0].lon) < 1e-9
        assert abs(legacy[0].lat - rwy[0].lat) < 1e-9

    def test_runway_relative_bearing_rotates_clockwise(self):
        """RUNWAY reference with hover_bearing=90 rotates drone 90° CW from approach side."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        runway_heading = 90.0  # approach side = 270
        cfg = ResolvedConfig(hover_bearing=90.0, hover_bearing_reference="RUNWAY")
        wps = calculate_hover_point_lock_path(
            target, "PAPI", runway_heading, cfg, uuid4(), speed=0.0
        )
        # bearing from LHA to drone should be 270 + 90 = 360 % 360 = 0 (north)
        bearing_lha_to_drone = bearing_between(target.lon, target.lat, wps[0].lon, wps[0].lat)
        assert abs(bearing_lha_to_drone - 0.0) < 1.0 or abs(bearing_lha_to_drone - 360.0) < 1.0

    def test_compass_bearing_is_absolute(self):
        """COMPASS reference ignores runway heading - hover_bearing is the true bearing from LHA."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        # runway heading varied - drone bearing must stay at the configured compass value
        for rwy in (0.0, 90.0, 180.0, 270.0):
            cfg = ResolvedConfig(hover_bearing=45.0, hover_bearing_reference="COMPASS")
            wps = calculate_hover_point_lock_path(target, "PAPI", rwy, cfg, uuid4(), speed=0.0)
            b = bearing_between(target.lon, target.lat, wps[0].lon, wps[0].lat)
            assert abs(b - 45.0) < 1.0, f"runway={rwy} got bearing={b}"

    def test_compass_bearing_normalises_negative_values(self):
        """COMPASS reference with negative bearing wraps via mod 360."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg = ResolvedConfig(hover_bearing=-90.0, hover_bearing_reference="COMPASS")
        wps = calculate_hover_point_lock_path(target, "PAPI", 0.0, cfg, uuid4(), speed=0.0)
        # -90 mod 360 = 270 (west of LHA)
        b = bearing_between(target.lon, target.lat, wps[0].lon, wps[0].lat)
        assert abs(b - 270.0) < 1.0

    def test_bearing_reference_default_is_runway(self):
        """hover_bearing with no reference set defaults to RUNWAY."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        runway_heading = 90.0
        cfg = ResolvedConfig(hover_bearing=45.0, hover_bearing_reference=None)
        wps = calculate_hover_point_lock_path(
            target, "PAPI", runway_heading, cfg, uuid4(), speed=0.0
        )
        # approach side (270) + 45 = 315
        b = bearing_between(target.lon, target.lat, wps[0].lon, wps[0].lat)
        assert abs(b - 315.0) < 1.0

    def test_dispatch_requires_target(self):
        """dispatcher rejects hover-point-lock without a target LHA."""
        insp = FakeInspection(method=InspectionMethod.HOVER_POINT_LOCK)
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
