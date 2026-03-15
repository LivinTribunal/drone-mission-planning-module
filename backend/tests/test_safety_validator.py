from app.services.trajectory_generator import WaypointData

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
    assert not result["is_warning"]
    assert "above max" in result["message"]


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
    assert "below min" in result["message"]


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
    assert result["is_warning"]


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
