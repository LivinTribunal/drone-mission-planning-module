"""regression test for the density=1 guard in compute_optimal_speed."""

from dataclasses import dataclass

from app.services.trajectory_computation import compute_optimal_speed


@dataclass
class _Drone:
    """minimal drone stub for optimal-speed calculation."""

    camera_frame_rate: int = 30
    max_speed: float = 15.0


def test_density_one_does_not_divide_by_zero():
    """density=1 returns None instead of raising ZeroDivisionError."""
    assert compute_optimal_speed(100.0, 1, _Drone()) is None


def test_density_zero_does_not_divide_by_zero():
    """density=0 returns None instead of raising ZeroDivisionError."""
    assert compute_optimal_speed(100.0, 0, _Drone()) is None


def test_density_two_returns_value():
    """density>=2 computes a finite speed."""
    result = compute_optimal_speed(100.0, 2, _Drone())
    assert result is not None and result > 0
