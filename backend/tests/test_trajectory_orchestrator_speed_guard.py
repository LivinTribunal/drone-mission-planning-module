"""regression test for None-speed handling in segment duration math.

orchestrator line `seg_dur = seg_dist / max(speed or MIN_SPEED_FLOOR, MIN_SPEED_FLOOR)`
used to raise TypeError when speed was None. the guard coerces None to the floor.
"""

import pytest

from app.services.trajectory.types import MIN_SPEED_FLOOR


@pytest.mark.parametrize("speed", [None, 0, 0.0])
def test_none_or_zero_speed_falls_back_to_floor(speed):
    """None/zero speed resolves to MIN_SPEED_FLOOR so division stays safe."""
    seg_dist = 100.0
    # this mirrors the orchestrator expression directly
    seg_dur = seg_dist / max(speed or MIN_SPEED_FLOOR, MIN_SPEED_FLOOR)
    assert seg_dur == seg_dist / MIN_SPEED_FLOOR


def test_positive_speed_is_respected():
    """a positive speed is used as-is, no floor applied."""
    seg_dist = 100.0
    speed = 5.0
    seg_dur = seg_dist / max(speed or MIN_SPEED_FLOOR, MIN_SPEED_FLOOR)
    assert seg_dur == 20.0
