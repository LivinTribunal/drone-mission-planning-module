from app.services.trajectory.types import WaypointData

# altitude constraint


def test_altitude_above_max():
    """waypoint above max altitude triggers hard violation."""
    from app.services.trajectory.validation import _check_constraint

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
    """waypoint below min altitude triggers violation."""
    from app.services.trajectory.validation import _check_constraint

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
    """speed above max triggers soft warning."""
    from app.services.trajectory.validation import _check_constraint

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


# db=None guard for spatial constraint types


def test_geofence_constraint_with_no_db():
    """geofence constraint with db=None returns soft warning violation."""
    from app.services.trajectory.validation import _check_constraint

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    constraint = type(
        "C",
        (),
        {
            "constraint_type": "GEOFENCE",
            "boundary": b"fake-ewkb",
            "is_hard_constraint": True,
            "id": "test-id",
        },
    )()

    result = _check_constraint(None, wp, constraint, [])
    assert result is not None
    assert result.is_warning is True
    assert "GEOFENCE" in result.message
    assert result.violation_kind == "constraint"


def test_runway_buffer_constraint_with_no_db():
    """runway buffer constraint with db=None returns soft warning violation."""
    from app.services.trajectory.validation import _check_constraint

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    constraint = type(
        "C",
        (),
        {
            "constraint_type": "RUNWAY_BUFFER",
            "lateral_buffer": 100.0,
            "is_hard_constraint": True,
            "id": "test-id",
        },
    )()

    result = _check_constraint(None, wp, constraint, [])
    assert result is not None
    assert result.is_warning is True
    assert "RUNWAY_BUFFER" in result.message
    assert result.violation_kind == "constraint"


# drone constraints


def test_drone_max_altitude():
    """waypoint exceeding drone max altitude returns violation."""
    from app.services.trajectory.validation import check_drone_constraints

    wp = WaypointData(lon=14.26, lat=50.10, alt=600.0)
    drone = type("D", (), {"max_altitude": 500.0, "max_speed": 23.0})()

    assert check_drone_constraints(wp, drone) is not None


def test_drone_within_limits():
    """waypoint within drone limits returns no violation."""
    from app.services.trajectory.validation import check_drone_constraints

    wp = WaypointData(lon=14.26, lat=50.10, alt=200.0, speed=10.0)
    drone = type("D", (), {"max_altitude": 500.0, "max_speed": 23.0})()

    assert check_drone_constraints(wp, drone) is None


# battery


def test_battery_exceeded():
    """flight duration exceeding battery endurance returns violation."""
    from app.services.trajectory.validation import check_battery

    drone = type("D", (), {"endurance_minutes": 55.0})()

    assert check_battery(3600.0, drone, 0.15) is not None


def test_battery_ok():
    """flight within battery endurance returns no violation."""
    from app.services.trajectory.validation import check_battery

    drone = type("D", (), {"endurance_minutes": 55.0})()

    assert check_battery(1000.0, drone, 0.15) is None


# safety zone + obstacle


def test_safety_zone_no_geometry():
    """zone with no geometry is skipped."""
    from app.services.trajectory.validation import check_safety_zone

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


def test_obstacle_check_local_no_containment():
    """obstacle check returns False when waypoint is outside."""
    from shapely.geometry import box

    from app.services.trajectory.types import LocalObstacle
    from app.services.trajectory.validation import check_obstacle

    obs = LocalObstacle(
        polygon=box(0, 0, 10, 10),
        name="Test",
        height=40.0,
        base_alt=0.0,
        buffer_distance=5.0,
    )
    # point outside the obstacle
    assert check_obstacle(20.0, 20.0, 5.0, obs) is False


def test_obstacle_check_local_inside_below_top():
    """obstacle check returns True when inside and below obstacle top."""
    from shapely.geometry import box

    from app.services.trajectory.types import LocalObstacle
    from app.services.trajectory.validation import check_obstacle

    obs = LocalObstacle(
        polygon=box(0, 0, 10, 10),
        name="Test",
        height=40.0,
        base_alt=0.0,
        buffer_distance=0.0,
    )
    # point inside the obstacle, alt below top
    assert check_obstacle(5.0, 5.0, 30.0, obs) is True


def test_obstacle_check_local_inside_above_top():
    """obstacle check returns False when inside but above obstacle top."""
    from shapely.geometry import box

    from app.services.trajectory.types import LocalObstacle
    from app.services.trajectory.validation import check_obstacle

    obs = LocalObstacle(
        polygon=box(0, 0, 10, 10),
        name="Test",
        height=40.0,
        base_alt=0.0,
        buffer_distance=0.0,
    )
    # point inside but alt above top
    assert check_obstacle(5.0, 5.0, 50.0, obs) is False


# zero-value constraint checks - regression tests for truthiness bug


def test_altitude_constraint_zero_min():
    """constraint with min_altitude=0 must still fire when waypoint is below 0"""
    from app.services.trajectory.validation import _check_constraint

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
    from app.services.trajectory.validation import _check_constraint

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
    from app.services.trajectory.validation import _check_constraint

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
    from app.services.trajectory.validation import check_drone_constraints

    wp = WaypointData(lon=14.26, lat=50.10, alt=5.0)
    drone = type("D", (), {"max_altitude": 0.0, "max_speed": 23.0})()

    assert check_drone_constraints(wp, drone) is not None


def test_drone_zero_max_speed():
    """drone with max_speed=0 must trigger violation"""
    from app.services.trajectory.validation import check_drone_constraints

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0, speed=1.0)
    drone = type("D", (), {"max_altitude": 500.0, "max_speed": 0.0})()

    assert check_drone_constraints(wp, drone) is not None


# Shapely-based segment intersection tests


def test_segments_intersect_obstacle_crossing():
    """line crossing obstacle polygon returns True."""
    from shapely.geometry import box

    from app.services.trajectory.types import LocalObstacle
    from app.services.trajectory.validation import segments_intersect_obstacle

    obs = LocalObstacle(
        polygon=box(4, 4, 6, 6),
        name="Test",
        height=10.0,
        base_alt=0.0,
        buffer_distance=0.0,
    )
    assert segments_intersect_obstacle(0, 5, 10, 5, obs) is True


def test_segments_intersect_obstacle_no_crossing():
    """line not crossing obstacle polygon returns False."""
    from shapely.geometry import box

    from app.services.trajectory.types import LocalObstacle
    from app.services.trajectory.validation import segments_intersect_obstacle

    obs = LocalObstacle(
        polygon=box(4, 4, 6, 6),
        name="Test",
        height=10.0,
        base_alt=0.0,
        buffer_distance=0.0,
    )
    assert segments_intersect_obstacle(0, 0, 10, 0, obs) is False


def test_segments_intersect_zone_crossing():
    """line crossing zone polygon returns True."""
    from shapely.geometry import box

    from app.services.trajectory.validation import segments_intersect_zone

    zone_poly = box(4, 4, 6, 6)
    assert segments_intersect_zone(0, 5, 10, 5, zone_poly) is True


def test_segment_runway_crossing_length_positive():
    """line crossing runway polygon returns positive length."""
    from shapely.geometry import box

    from app.services.trajectory.validation import segment_runway_crossing_length

    runway_poly = box(-100, -25, 100, 25)
    length = segment_runway_crossing_length(0, -50, 0, 50, runway_poly)
    assert length > 0
    assert abs(length - 50.0) < 1.0


def test_segment_runway_crossing_length_no_crossing():
    """line not crossing runway polygon returns 0."""
    from shapely.geometry import box

    from app.services.trajectory.validation import segment_runway_crossing_length

    runway_poly = box(-100, -25, 100, 25)
    length = segment_runway_crossing_length(0, 30, 10, 30, runway_poly)
    assert length == 0.0


# check_speed_framerate fallback branch


def test_speed_framerate_fallback_no_optimal():
    """fallback fires when optimal_speed is None and speed exceeds max_speed margin"""
    from app.services.trajectory.config_resolver import check_speed_framerate

    drone = type("D", (), {"camera_frame_rate": 30, "max_speed": 10.0})()
    warning = check_speed_framerate(speed=9.5, drone=drone, optimal_speed=None)

    assert warning is not None
    assert "too high" in warning


def test_speed_framerate_fallback_skipped_with_optimal():
    """fallback does not fire when optimal_speed is computed"""
    from app.services.trajectory.config_resolver import check_speed_framerate

    drone = type("D", (), {"camera_frame_rate": 30, "max_speed": 10.0})()
    warning = check_speed_framerate(speed=4.0, drone=drone, optimal_speed=5.0)

    assert warning is None


# obstacle altitude band tests


def test_obstacle_below_base_alt_no_violation():
    """waypoint below obstacle base_alt should not trigger violation."""
    from shapely.geometry import box

    from app.services.trajectory.types import LocalObstacle
    from app.services.trajectory.validation import check_obstacle

    obs = LocalObstacle(
        polygon=box(0, 0, 10, 10),
        name="Elevated",
        height=20.0,
        base_alt=10.0,
        buffer_distance=0.0,
    )
    # waypoint inside 2d footprint but below base_alt
    assert check_obstacle(5.0, 5.0, 5.0, obs) is False


def test_obstacle_ground_level_inside_violation():
    """waypoint at ground level inside a ground-level obstacle triggers violation."""
    from shapely.geometry import box

    from app.services.trajectory.types import LocalObstacle
    from app.services.trajectory.validation import check_obstacle

    obs = LocalObstacle(
        polygon=box(0, 0, 10, 10),
        name="Ground",
        height=20.0,
        base_alt=0.0,
        buffer_distance=0.0,
    )
    # waypoint at alt=0 inside ground-level obstacle
    assert check_obstacle(5.0, 5.0, 0.0, obs) is True
