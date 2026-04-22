"""tests for direction_reversed flag - flips traversal for the three in-scope methods."""

from uuid import uuid4

import pytest

from app.models.enums import WaypointType
from app.schemas.flight_plan import InspectionFlightStats
from app.services.trajectory.methods.fly_over import calculate_fly_over_path
from app.services.trajectory.methods.horizontal_range import calculate_arc_path
from app.services.trajectory.methods.hover_point_lock import calculate_hover_point_lock_path
from app.services.trajectory.methods.meht_check import calculate_meht_check_path
from app.services.trajectory.methods.parallel_side_sweep import calculate_parallel_side_sweep_path
from app.services.trajectory.methods.vertical_profile import calculate_vertical_path
from app.services.trajectory.types import Point3D, ResolvedConfig
from app.utils.geo import point_at_distance


def _row(count: int = 5) -> list[Point3D]:
    """row of LHA positions along east, 10m apart."""
    base = Point3D(lon=14.26, lat=50.1, alt=380.0)
    out = [base]
    for i in range(1, count):
        lon, lat = point_at_distance(base.lon, base.lat, 90.0, 10.0 * i)
        out.append(Point3D(lon=lon, lat=lat, alt=380.0))
    return out


def _measurement_coords(wps) -> list[tuple[float, float]]:
    """extract (lon, lat) of measurement waypoints only."""
    return [(w.lon, w.lat) for w in wps if w.waypoint_type == WaypointType.MEASUREMENT]


# horizontal range - flip is inside the method itself


class TestHorizontalRangeReversal:
    """direction_reversed swaps the sweep endpoints in the arc path."""

    def test_natural_sweep_left_to_right(self):
        """with direction_reversed=False, first waypoint sits on the left (negative sweep)."""
        center = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg = ResolvedConfig(direction_reversed=False, measurement_density=5)
        wps = calculate_arc_path(
            center,
            runway_heading=0.0,
            glide_slope_angle=3.0,
            config=cfg,
            inspection_id=uuid4(),
            speed=5.0,
        )
        # runway heading 0 -> approach = 180 -> sweep arc sits south of center
        # natural: first wp is at approach - half_sweep (east of approach line)
        assert wps[0].lon > wps[-1].lon

    def test_reversed_sweep_right_to_left(self):
        """with direction_reversed=True, first/last longitudes swap."""
        center = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg_fwd = ResolvedConfig(direction_reversed=False, measurement_density=5)
        cfg_rev = ResolvedConfig(direction_reversed=True, measurement_density=5)
        wps_fwd = calculate_arc_path(center, 0.0, 3.0, cfg_fwd, uuid4(), speed=5.0)
        wps_rev = calculate_arc_path(center, 0.0, 3.0, cfg_rev, uuid4(), speed=5.0)
        assert wps_fwd[0].lon == pytest.approx(wps_rev[-1].lon)
        assert wps_fwd[-1].lon == pytest.approx(wps_rev[0].lon)

    def test_single_density_noop(self):
        """single-waypoint arc is identical regardless of direction_reversed."""
        center = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg_fwd = ResolvedConfig(direction_reversed=False, measurement_density=1)
        cfg_rev = ResolvedConfig(direction_reversed=True, measurement_density=1)
        wps_fwd = calculate_arc_path(center, 0.0, 3.0, cfg_fwd, uuid4(), speed=5.0)
        wps_rev = calculate_arc_path(center, 0.0, 3.0, cfg_rev, uuid4(), speed=5.0)
        assert len(wps_fwd) == 1 and len(wps_rev) == 1
        assert wps_fwd[0].lon == pytest.approx(wps_rev[0].lon)
        assert wps_fwd[0].lat == pytest.approx(wps_rev[0].lat)


# fly-over / parallel-side-sweep - orchestrator reverses ordered_lhas before dispatch,
# so the simulation here is: pass reversed positions and expect reversed output order.


class TestFlyOverReversal:
    """orchestrator-level list reversal gives reversed fly-over waypoint order."""

    def test_natural_order_matches_input(self):
        """with natural ordering, output waypoints trace input positions first->last."""
        row = _row(4)
        cfg = ResolvedConfig()
        wps = calculate_fly_over_path(row, cfg, uuid4(), speed=5.0)
        coords = _measurement_coords(wps)
        assert coords[0] == pytest.approx((row[0].lon, row[0].lat))
        assert coords[-1] == pytest.approx((row[-1].lon, row[-1].lat))

    def test_reversed_order_matches_reversed_input(self):
        """reversing the input list gives a fly-over that visits last->first."""
        row = _row(4)
        cfg = ResolvedConfig()
        wps_nat = calculate_fly_over_path(row, cfg, uuid4(), speed=5.0)
        wps_rev = calculate_fly_over_path(list(reversed(row)), cfg, uuid4(), speed=5.0)
        coords_nat = _measurement_coords(wps_nat)
        coords_rev = _measurement_coords(wps_rev)
        expected = list(reversed(coords_nat))
        assert len(coords_rev) == len(expected)
        for (alon, alat), (blon, blat) in zip(coords_rev, expected):
            assert alon == pytest.approx(blon)
            assert alat == pytest.approx(blat)


class TestParallelSideSweepReversal:
    """orchestrator-level list reversal gives reversed parallel-side-sweep order."""

    def test_reversed_order_matches_reversed_input(self):
        """reversing the input list reverses the parallel-side-sweep output."""
        row = _row(4)
        runway_center = Point3D(lon=14.26, lat=50.105, alt=380.0)
        cfg = ResolvedConfig()
        wps_nat = calculate_parallel_side_sweep_path(row, runway_center, cfg, uuid4(), speed=3.0)
        wps_rev = calculate_parallel_side_sweep_path(
            list(reversed(row)), runway_center, cfg, uuid4(), speed=3.0
        )
        coords_nat = _measurement_coords(wps_nat)
        coords_rev = _measurement_coords(wps_rev)
        expected = list(reversed(coords_nat))
        assert len(coords_rev) == len(expected)
        for (alon, alat), (blon, blat) in zip(coords_rev, expected):
            assert alon == pytest.approx(blon, abs=1e-6)
            assert alat == pytest.approx(blat, abs=1e-6)


# excluded methods - direction_reversed must not change the output


class TestExcludedMethodsNoOp:
    """hover-point-lock, meht-check, vertical-profile are untouched by direction_reversed."""

    def test_vertical_profile_ignores_flag(self):
        """vertical_profile produces identical waypoints regardless of direction_reversed."""
        center = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg_fwd = ResolvedConfig(direction_reversed=False, measurement_density=6)
        cfg_rev = ResolvedConfig(direction_reversed=True, measurement_density=6)
        wps_fwd = calculate_vertical_path(center, 0.0, cfg_fwd, uuid4(), 5.0, [])
        wps_rev = calculate_vertical_path(center, 0.0, cfg_rev, uuid4(), 5.0, [])
        assert len(wps_fwd) == len(wps_rev)
        for a, b in zip(wps_fwd, wps_rev):
            assert a.lon == pytest.approx(b.lon)
            assert a.lat == pytest.approx(b.lat)
            assert a.alt == pytest.approx(b.alt)

    def test_hover_point_lock_ignores_flag(self):
        """hover-point-lock is a single waypoint - direction_reversed has nothing to flip."""
        target = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg_fwd = ResolvedConfig(direction_reversed=False)
        cfg_rev = ResolvedConfig(direction_reversed=True)
        wps_fwd = calculate_hover_point_lock_path(target, "PAPI", 0.0, cfg_fwd, uuid4(), 5.0)
        wps_rev = calculate_hover_point_lock_path(target, "PAPI", 0.0, cfg_rev, uuid4(), 5.0)
        assert len(wps_fwd) == len(wps_rev) == 1
        assert wps_fwd[0].lon == pytest.approx(wps_rev[0].lon)
        assert wps_fwd[0].lat == pytest.approx(wps_rev[0].lat)

    def test_meht_check_ignores_flag(self):
        """meht-check is a single waypoint with a procedure-fixed direction."""
        meht_point = Point3D(lon=14.26, lat=50.098, alt=380.0)
        lha_center = Point3D(lon=14.26, lat=50.1, alt=380.0)
        cfg_fwd = ResolvedConfig(direction_reversed=False)
        cfg_rev = ResolvedConfig(direction_reversed=True)
        wps_fwd = calculate_meht_check_path(meht_point, lha_center, cfg_fwd, uuid4(), 5.0)
        wps_rev = calculate_meht_check_path(meht_point, lha_center, cfg_rev, uuid4(), 5.0)
        assert len(wps_fwd) == len(wps_rev)
        for a, b in zip(wps_fwd, wps_rev):
            assert a.lon == pytest.approx(b.lon)
            assert a.lat == pytest.approx(b.lat)


# schema smoke tests


class TestInspectionFlightStatsSchema:
    """bearing field defaults to None and accepts an int."""

    def test_direction_bearing_defaults_none(self):
        """direction_bearing is optional and defaults to None."""
        stats = InspectionFlightStats(
            inspection_id=uuid4(),
            min_altitude_agl=5.0,
            max_altitude_agl=25.0,
            min_altitude_msl=305.0,
            max_altitude_msl=325.0,
            waypoint_count=8,
            segment_duration=42.0,
        )
        assert stats.direction_bearing is None

    def test_direction_bearing_accepts_int(self):
        """direction_bearing accepts an int degree value."""
        stats = InspectionFlightStats(
            inspection_id=uuid4(),
            min_altitude_agl=5.0,
            max_altitude_agl=25.0,
            min_altitude_msl=305.0,
            max_altitude_msl=325.0,
            waypoint_count=8,
            segment_duration=42.0,
            direction_bearing=142,
        )
        assert stats.direction_bearing == 142


class TestResolvedConfigHasFlag:
    """ResolvedConfig exposes direction_reversed with a False default."""

    def test_default_is_false(self):
        """resolved config defaults direction_reversed to False."""
        assert ResolvedConfig().direction_reversed is False

    def test_accepts_true(self):
        """direction_reversed can be explicitly set."""
        assert ResolvedConfig(direction_reversed=True).direction_reversed is True
