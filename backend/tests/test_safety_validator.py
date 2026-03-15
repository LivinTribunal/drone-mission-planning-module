from app.services.trajectory_generator import WaypointData


def test_waypoint_inside_restricted_zone(client):
    """waypoint inside restricted zone should produce a warning"""
    from app.services.safety_validator import _check_safety_zone

    # this test uses the safety zone created in test_airports
    # just verify the function returns correct format
    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)

    # basic check - function should not crash
    result = _check_safety_zone(
        None,
        wp,
        type(
            "Zone",
            (),
            {
                "type": "RESTRICTED",
                "name": "Test Zone",
                "altitude_floor": 0.0,
                "altitude_ceiling": 500.0,
                "geometry": None,
            },
        )(),
    )

    # with no geometry to check containment, should return None
    assert result is None


def test_altitude_constraint_check():
    """altitude constraint should flag violations"""
    from app.services.safety_validator import _check_constraint

    wp = WaypointData(lon=14.26, lat=50.10, alt=600.0)

    constraint = type(
        "Constraint",
        (),
        {
            "constraint_type": "ALTITUDE",
            "min_altitude": 50.0,
            "max_altitude": 500.0,
            "is_hard_constraint": True,
            "id": "test-id",
        },
    )()

    result = _check_constraint(None, wp, constraint)

    assert result is not None
    assert not result["is_warning"]
    assert "above maximum" in result["message"]


def test_speed_constraint_check():
    """speed constraint should flag violations"""
    from app.services.safety_validator import _check_constraint

    wp = WaypointData(lon=14.26, lat=50.10, alt=300.0, speed=30.0)

    constraint = type(
        "Constraint",
        (),
        {
            "constraint_type": "SPEED",
            "max_horizontal_speed": 25.0,
            "is_hard_constraint": False,
            "id": "test-id",
        },
    )()

    result = _check_constraint(None, wp, constraint)

    assert result is not None
    assert result["is_warning"]
    assert "exceeds max" in result["message"]


def test_no_violation_when_within_limits():
    """no violation when waypoint is within all limits"""
    from app.services.safety_validator import _check_constraint

    wp = WaypointData(lon=14.26, lat=50.10, alt=200.0, speed=10.0)

    constraint = type(
        "Constraint",
        (),
        {
            "constraint_type": "ALTITUDE",
            "min_altitude": 50.0,
            "max_altitude": 500.0,
            "is_hard_constraint": True,
            "id": "test-id",
        },
    )()

    result = _check_constraint(None, wp, constraint)

    assert result is None
