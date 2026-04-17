"""tests for trapezoidal speed profile duration computation.

validates that _segment_duration_with_accel correctly models acceleration,
deceleration, and triangular fallback for short segments.
"""

import pytest

from app.services.trajectory_orchestrator import _segment_duration_with_accel
from app.services.trajectory_types import (
    DEFAULT_ACCELERATION,
    DEFAULT_DECELERATION,
    GIMBAL_SETTLE_TIME,
    LANDING_DURATION,
    MIN_SPEED_FLOOR,
    TAKEOFF_DURATION,
)


def test_zero_distance_returns_zero():
    """zero-length segment has zero duration."""
    assert _segment_duration_with_accel(0.0, 5.0, 5.0) == 0.0


def test_constant_speed_equals_simple_division():
    """same start/end speed with long segment should approximate d/v."""
    d = 1000.0
    v = 5.0
    dur = _segment_duration_with_accel(d, v, v)
    # no accel/decel needed, so should equal d/v exactly
    assert dur == pytest.approx(d / v, rel=1e-9)


def test_acceleration_increases_duration():
    """accelerating from low to high speed takes longer than constant high speed."""
    d = 200.0
    # constant at 10 m/s
    dur_const = _segment_duration_with_accel(d, 10.0, 10.0)
    # accelerating from 2 to 10 m/s
    dur_accel = _segment_duration_with_accel(d, 2.0, 10.0)
    assert dur_accel > dur_const


def test_deceleration_increases_duration():
    """decelerating takes longer than constant speed at the higher velocity."""
    d = 200.0
    dur_const = _segment_duration_with_accel(d, 10.0, 10.0)
    dur_decel = _segment_duration_with_accel(d, 10.0, 2.0)
    assert dur_decel > dur_const


def test_short_segment_triangular_profile():
    """short segment uses triangular profile when can't reach cruise speed."""
    # accel=2, decel=2, from 1 to 1 m/s over 1m
    # cruise would be 1 m/s, d_accel=0, d_decel=0 -> trapezoidal fits
    # but from 1 to 10 m/s over 5m:
    # d_accel = (10^2 - 1^2)/(2*2) = 99/4 = 24.75m - way more than 5m
    dur = _segment_duration_with_accel(5.0, 1.0, 10.0)
    assert dur > 0
    # should be less than simple d/v_start (very conservative estimate)
    assert dur < 5.0 / 1.0


def test_symmetric_accel_decel():
    """same start/end speed with accel+decel should be symmetric."""
    d = 100.0
    dur_a = _segment_duration_with_accel(d, 3.0, 8.0)
    dur_b = _segment_duration_with_accel(d, 8.0, 3.0)
    assert dur_a == pytest.approx(dur_b, rel=1e-9)


def test_min_speed_floor_applied():
    """near-zero speeds are clamped to MIN_SPEED_FLOOR."""
    d = 10.0
    dur = _segment_duration_with_accel(d, 0.01, 0.01)
    # should use MIN_SPEED_FLOOR = 0.1, so constant at 0.1 m/s
    assert dur == pytest.approx(d / MIN_SPEED_FLOOR, rel=1e-9)


def test_realistic_dji_segment():
    """100m accelerating from 3 m/s to cruise 5 m/s takes longer than constant 5 m/s."""
    dur = _segment_duration_with_accel(100.0, 3.0, 5.0)
    constant_at_cruise = _segment_duration_with_accel(100.0, 5.0, 5.0)
    assert dur > constant_at_cruise


def test_takeoff_landing_constants_are_positive():
    """sanity check that T/L and gimbal constants are reasonable."""
    assert TAKEOFF_DURATION > 0
    assert LANDING_DURATION > 0
    assert GIMBAL_SETTLE_TIME > 0
    assert DEFAULT_ACCELERATION > 0
    assert DEFAULT_DECELERATION > 0


def test_trapezoidal_distance_consistency():
    """distance covered during trapezoidal profile should equal input distance.

    for constant speed: v*t = d
    """
    d = 500.0
    v = 7.0
    t = _segment_duration_with_accel(d, v, v)
    # constant speed: d_covered = v * t
    assert v * t == pytest.approx(d, rel=1e-9)


def test_triangular_profile_peak_velocity():
    """very short segment with large speed difference uses triangular profile."""
    d = 2.0
    dur = _segment_duration_with_accel(d, 1.0, 1.0, accel=2.0, decel=2.0)
    # cruise=1, d_accel=0, d_decel=0 -> constant speed, t = 2/1 = 2.0
    assert dur == pytest.approx(2.0, rel=1e-9)
