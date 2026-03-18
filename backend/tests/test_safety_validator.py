from app.services.trajectory_types import WaypointData

# altitude constraint


def test_altitude_above_max():
    from app.services.safety_validator import _check_constraint

    wp = WaypointData(lon=14.26, lat=50.10, alt=600.0)
    constraint = type(
        "C",
        (),
        {
            "constraint_type": "ALTITUDE",
            "min_altitude": 50.0,
            "max_altitude": 500.0,
            "is_hard_constraint": True,
            "id": "test-id",
        },
    )()

    result = _check_constraint(None, wp, constraint, [])

    assert result is not None
    assert not result.is_warning
    assert "above max" in result.message


def test_altitude_below_min():
    from app.services.safety_validator import _check_constraint

    wp = WaypointData(lon=14.26, lat=50.10, alt=30.0)
    constraint = type(
        "C",
        (),
        {
            "constraint_type": "ALTITUDE",
            "min_altitude": 50.0,
            "max_altitude": 500.0,
            "is_hard_constraint": True,
            "id": "test-id",
        },
    )()

    result = _check_constraint(None, wp, constraint, [])

    assert result is not None
    assert "below min" in result.message


# speed constraint


def test_speed_exceeds_max():
    from app.services.safety_validator import _check_constraint

    wp = WaypointData(lon=14.26, lat=50.10, alt=300.0, speed=30.0)
    constraint = type(
        "C",
        (),
        {
            "constraint_type": "SPEED",
            "max_horizontal_speed": 25.0,
            "is_hard_constraint": False,
            "id": "test-id",
        },
    )()

    result = _check_constraint(None, wp, constraint, [])

    assert result is not None
    assert result.is_warning


# drone constraints


def test_drone_max_altitude():
    from app.services.safety_validator import check_drone_constraints

    wp = WaypointData(lon=14.26, lat=50.10, alt=600.0)
    drone = type("D", (), {"max_altitude": 500.0, "max_speed": 23.0})()

    assert check_drone_constraints(wp, drone) is not None


def test_drone_within_limits():
    from app.services.safety_validator import check_drone_constraints

    wp = WaypointData(lon=14.26, lat=50.10, alt=200.0, speed=10.0)
    drone = type("D", (), {"max_altitude": 500.0, "max_speed": 23.0})()

    assert check_drone_constraints(wp, drone) is None


# battery


def test_battery_exceeded():
    from app.services.safety_validator import check_battery

    drone = type("D", (), {"endurance_minutes": 55.0})()

    assert check_battery(3600.0, drone, 0.15) is not None


def test_battery_ok():
    from app.services.safety_validator import check_battery

    drone = type("D", (), {"endurance_minutes": 55.0})()

    assert check_battery(1000.0, drone, 0.15) is None


# safety zone + obstacle


def test_safety_zone_no_geometry():
    from app.services.safety_validator import check_safety_zone

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    zone = type(
        "Z",
        (),
        {
            "type": "RESTRICTED",
            "name": "Test",
            "altitude_floor": 0.0,
            "altitude_ceiling": 500.0,
            "geometry": None,
        },
    )()

    assert check_safety_zone(None, wp, zone) is None


def test_obstacle_no_geometry():
    from app.services.safety_validator import check_obstacle

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    obs = type(
        "O",
        (),
        {
            "geometry": None,
            "position": None,
            "height": 40.0,
            "name": "Test",
        },
    )()

    assert check_obstacle(None, wp, obs) is None


# zero-value constraint checks - regression tests for truthiness bug


def test_altitude_constraint_zero_min():
    """constraint with min_altitude=0 must still fire when waypoint is below 0"""
    from app.services.safety_validator import _check_constraint

    wp = WaypointData(lon=14.26, lat=50.10, alt=-5.0)
    constraint = type(
        "C",
        (),
        {
            "constraint_type": "ALTITUDE",
            "min_altitude": 0.0,
            "max_altitude": 500.0,
            "is_hard_constraint": True,
            "id": "test-id",
        },
    )()

    result = _check_constraint(None, wp, constraint, [])

    assert result is not None
    assert "below min" in result.message


def test_altitude_constraint_zero_max():
    """constraint with max_altitude=0 must still fire when waypoint is above 0"""
    from app.services.safety_validator import _check_constraint

    wp = WaypointData(lon=14.26, lat=50.10, alt=5.0)
    constraint = type(
        "C",
        (),
        {
            "constraint_type": "ALTITUDE",
            "min_altitude": None,
            "max_altitude": 0.0,
            "is_hard_constraint": True,
            "id": "test-id",
        },
    )()

    result = _check_constraint(None, wp, constraint, [])

    assert result is not None
    assert "above max" in result.message


def test_speed_constraint_zero_max():
    """constraint with max_horizontal_speed=0 must fire when waypoint has any speed"""
    from app.services.safety_validator import _check_constraint

    wp = WaypointData(lon=14.26, lat=50.10, alt=300.0, speed=1.0)
    constraint = type(
        "C",
        (),
        {
            "constraint_type": "SPEED",
            "max_horizontal_speed": 0.0,
            "is_hard_constraint": True,
            "id": "test-id",
        },
    )()

    result = _check_constraint(None, wp, constraint, [])

    assert result is not None


def test_drone_zero_max_altitude():
    """drone with max_altitude=0 must trigger violation"""
    from app.services.safety_validator import check_drone_constraints

    wp = WaypointData(lon=14.26, lat=50.10, alt=5.0)
    drone = type("D", (), {"max_altitude": 0.0, "max_speed": 23.0})()

    assert check_drone_constraints(wp, drone) is not None


def test_drone_zero_max_speed():
    """drone with max_speed=0 must trigger violation"""
    from app.services.safety_validator import check_drone_constraints

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0, speed=1.0)
    drone = type("D", (), {"max_altitude": 500.0, "max_speed": 0.0})()

    assert check_drone_constraints(wp, drone) is not None


# segment intersection null-geometry early exits


def test_segments_intersect_obstacle_null_geometry():
    """obstacle with no geometry returns False"""
    from app.services.safety_validator import segments_intersect_obstacle

    obstacle = type("O", (), {"geometry": None})()
    result = segments_intersect_obstacle(None, 14.0, 50.0, 14.1, 50.1, obstacle)

    assert result is False


def test_segments_intersect_zone_null_geometry():
    """safety zone with no geometry returns False"""
    from app.services.safety_validator import segments_intersect_zone

    zone = type("Z", (), {"geometry": None, "type": "PROHIBITED"})()
    result = segments_intersect_zone(None, 14.0, 50.0, 14.1, 50.1, zone)

    assert result is False


# check_speed_framerate fallback branch


def test_speed_framerate_fallback_no_optimal():
    """fallback fires when optimal_speed is None and speed exceeds max_speed margin"""
    from app.services.trajectory_computation import check_speed_framerate

    drone = type("D", (), {"camera_frame_rate": 30, "max_speed": 10.0})()
    warning = check_speed_framerate(speed=9.5, drone=drone, optimal_speed=None)

    assert warning is not None
    assert "too high" in warning


def test_speed_framerate_fallback_skipped_with_optimal():
    """fallback does not fire when optimal_speed is computed"""
    from app.services.trajectory_computation import check_speed_framerate

    drone = type("D", (), {"camera_frame_rate": 30, "max_speed": 10.0})()
    warning = check_speed_framerate(speed=4.0, drone=drone, optimal_speed=5.0)

    assert warning is None
