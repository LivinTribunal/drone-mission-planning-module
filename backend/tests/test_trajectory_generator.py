import math

from app.utils.geo import (
    bearing_between,
    center_of_points,
    distance_between,
    elevation_angle,
    point_at_distance,
)
from tests.data.trajectory import (
    TRAJECTORY_AGL_PAYLOAD,
    TRAJECTORY_AIRPORT_PAYLOAD,
    TRAJECTORY_DRONE_PAYLOAD,
    TRAJECTORY_SURFACE_PAYLOAD,
    make_lha_payload,
)


# geo utility tests
def test_distance_prague_brno():
    """distance between prague and brno - roughly 185km"""
    dist = distance_between(14.42, 50.08, 16.61, 49.19)

    assert 180_000 < dist < 200_000


def test_bearing_north():
    """bearing due north should be ~0 degrees"""
    b = bearing_between(14.0, 50.0, 14.0, 51.0)

    assert abs(b) < 1.0 or abs(b - 360) < 1.0


def test_bearing_east():
    """bearing due east should be ~90 degrees"""
    b = bearing_between(14.0, 50.0, 15.0, 50.0)

    assert abs(b - 90) < 1.0


def test_point_at_distance_roundtrip():
    """point 1km east and back should return ~1km distance"""
    lon, lat = 14.26, 50.10
    lon2, lat2 = point_at_distance(lon, lat, 90, 1000)
    dist = distance_between(lon, lat, lon2, lat2)

    assert abs(dist - 1000) < 1.0


def test_centroid_single_point():
    """centroid of one point is the point"""
    c = center_of_points([(14.26, 50.10, 380.0)])

    assert c == (14.26, 50.10, 380.0)


def test_centroid_symmetric():
    """centroid of symmetric triangle"""
    c = center_of_points([(0.0, 0.0, 100.0), (2.0, 0.0, 100.0), (1.0, 1.0, 100.0)])

    assert abs(c[0] - 1.0) < 0.01
    assert abs(c[2] - 100.0) < 0.01


def test_elevation_angle_above():
    """elevation angle looking up"""
    angle = elevation_angle(14.0, 50.0, 0.0, 14.0, 50.0, 100.0)

    assert angle == 90.0


# arc path tests
def test_arc_path_count():
    """arc path should generate measurement_density waypoints"""
    from app.services.trajectory_generator import calculate_arc_path

    config = {"measurement_density": 10, "altitude_offset": 0.0}
    center = (14.274, 50.098, 380.0)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    assert len(wps) == 10
    assert all(wp.waypoint_type == "MEASUREMENT" for wp in wps)


def test_arc_path_radius():
    """all arc waypoints should be >= 350m from center"""
    from app.services.trajectory_generator import MIN_ARC_RADIUS, calculate_arc_path

    config = {"measurement_density": 8, "altitude_offset": 0.0}
    center = (14.274, 50.098, 380.0)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    for wp in wps:
        dist = distance_between(center[0], center[1], wp.lon, wp.lat)
        assert dist >= MIN_ARC_RADIUS * 0.95


def test_arc_path_heading_towards_center():
    """measurement waypoints should point at LHA center"""
    from app.services.trajectory_generator import calculate_arc_path

    config = {"measurement_density": 5, "altitude_offset": 0.0}
    center = (14.274, 50.098, 380.0)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    for wp in wps:
        expected = bearing_between(wp.lon, wp.lat, center[0], center[1])
        diff = abs(wp.heading - expected)
        if diff > 180:
            diff = 360 - diff

        assert diff < 1.0


def test_arc_path_altitude_uses_glide_slope():
    """arc altitude = center_alt + r * tan(glide_slope) + offset"""
    from app.services.trajectory_generator import MIN_ARC_RADIUS, calculate_arc_path

    config = {"measurement_density": 3, "altitude_offset": 5.0}
    center = (14.274, 50.098, 380.0)
    glide_slope = 3.0
    radius = MIN_ARC_RADIUS

    expected_alt = center[2] + radius * math.tan(math.radians(glide_slope)) + 5.0

    wps = calculate_arc_path(center, 243.0, glide_slope, config, None, 5.0)

    for wp in wps:
        assert abs(wp.alt - expected_alt) < 0.1


# vertical path tests
def test_vertical_path_count():
    """vertical path should generate measurement_density waypoints"""
    from app.services.trajectory_generator import calculate_vertical_path

    config = {"measurement_density": 8, "hover_duration": None}
    center = (14.274, 50.098, 380.0)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])

    assert len(wps) == 8


def test_vertical_path_altitude_increases():
    """altitude should increase from min to max elevation angle"""
    from app.services.trajectory_generator import calculate_vertical_path

    config = {"measurement_density": 6, "hover_duration": None}
    center = (14.274, 50.098, 380.0)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])
    alts = [wp.alt for wp in wps]

    for i in range(1, len(alts)):
        assert alts[i] > alts[i - 1]


def test_vertical_path_same_horizontal():
    """all vertical profile waypoints at same lon/lat"""
    from app.services.trajectory_generator import calculate_vertical_path

    config = {"measurement_density": 5, "hover_duration": None}
    center = (14.274, 50.098, 380.0)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])

    for wp in wps:
        assert abs(wp.lon - wps[0].lon) < 0.0001
        assert abs(wp.lat - wps[0].lat) < 0.0001


def test_vertical_path_hover_at_transitions():
    """HOVER waypoints inserted at LHA setting angle boundaries"""
    from app.services.trajectory_generator import calculate_vertical_path

    config = {"measurement_density": 20, "hover_duration": 5.0}
    center = (14.274, 50.098, 380.0)
    # setting angles from seed data: 3.0, 3.5, 4.0, 4.5
    setting_angles = [3.0, 3.5, 4.0, 4.5]

    wps = calculate_vertical_path(
        center,
        243.0,
        config,
        None,
        3.0,
        setting_angles,
    )

    hover_wps = [wp for wp in wps if wp.waypoint_type == "HOVER"]

    # should have at least some HOVER waypoints near transition angles
    assert len(hover_wps) >= 1

    for hwp in hover_wps:
        assert hwp.hover_duration == 5.0


# config resolution tests
def test_resolve_with_defaults_merge():
    """field-by-field merge: override > template > hardcoded"""
    from app.models.inspection import InspectionConfiguration
    from app.services.trajectory_generator import _resolve_with_defaults

    template_config = InspectionConfiguration(
        measurement_density=10,
        speed_override=5.0,
        altitude_offset=2.0,
    )

    # mock template with default_config
    template = type("T", (), {"default_config": template_config})()

    override_config = InspectionConfiguration(
        measurement_density=15,
    )

    inspection = type("I", (), {"config": override_config})()

    result = _resolve_with_defaults(inspection, template)

    # override takes precedence
    assert result["measurement_density"] == 15
    # template default fills gaps
    assert result["speed_override"] == 5.0
    assert result["altitude_offset"] == 2.0


def test_resolve_with_defaults_no_configs():
    """hardcoded defaults when no config provided"""
    from app.services.trajectory_generator import _resolve_with_defaults

    template = type("T", (), {"default_config": None})()
    inspection = type("I", (), {"config": None})()

    result = _resolve_with_defaults(inspection, template)

    assert result["measurement_density"] == 8
    assert result["altitude_offset"] == 0.0


# camera action tests
def test_lead_in_lead_out_none():
    """first and last waypoints should have NONE camera action"""
    from app.services.trajectory_generator import _apply_camera_actions
    from app.services.trajectory_types import WaypointData

    wps = [
        WaypointData(lon=0, lat=0, alt=0, camera_action="PHOTO_CAPTURE"),
        WaypointData(lon=0, lat=0, alt=0, camera_action="PHOTO_CAPTURE"),
        WaypointData(lon=0, lat=0, alt=0, camera_action="PHOTO_CAPTURE"),
    ]

    _apply_camera_actions(wps)

    assert wps[0].camera_action == "NONE"
    assert wps[1].camera_action == "PHOTO_CAPTURE"
    assert wps[2].camera_action == "NONE"


# gimbal pitch tests


def test_arc_path_has_gimbal_pitch():
    """arc waypoints should have gimbal pitch computed"""
    from app.services.trajectory_generator import calculate_arc_path

    config = {"measurement_density": 5, "altitude_offset": 0.0}
    center = (14.274, 50.098, 380.0)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    for wp in wps:
        assert wp.gimbal_pitch is not None
        # pitch should be negative since drone is above center
        assert wp.gimbal_pitch < 0


def test_vertical_path_has_gimbal_pitch():
    """vertical profile waypoints should have gimbal pitch"""
    from app.services.trajectory_generator import calculate_vertical_path

    config = {"measurement_density": 5, "hover_duration": None}
    center = (14.274, 50.098, 380.0)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])

    for wp in wps:
        assert wp.gimbal_pitch is not None


# A* pathfinding tests


def test_astar_direct_path():
    """A* should find direct path when no obstacles"""
    from app.utils.geo import astar

    nodes = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0)]
    graph = {0: [(1, 1.0)], 1: [(0, 1.0)]}

    path = astar(graph, 0, 1, nodes)

    assert path == [0, 1]


def test_astar_around_obstacle():
    """A* should route around when direct path blocked"""
    from app.utils.geo import astar

    # 0 -> 1 is blocked, must go through 2
    nodes = [(0.0, 0.0, 0.0), (2.0, 0.0, 0.0), (1.0, 1.0, 0.0)]
    graph = {
        0: [(2, 1.5)],
        1: [(2, 1.5)],
        2: [(0, 1.5), (1, 1.5)],
    }

    path = astar(graph, 0, 1, nodes)

    assert path == [0, 2, 1]


def test_astar_no_path():
    """A* should return None when no path exists"""
    from app.utils.geo import astar

    nodes = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0)]
    graph = {0: [], 1: []}

    path = astar(graph, 0, 1, nodes)

    assert path is None


# interface methods


def test_determine_start_end_positions():
    """determineStartPosition / determineEndPosition per section 3.3.9"""
    from app.services.trajectory_generator import (
        determine_end_position,
        determine_start_position,
    )

    config = {"measurement_density": 8, "altitude_offset": 0.0}
    center = (14.274, 50.098, 380.0)

    start = determine_start_position(center, config, "ANGULAR_SWEEP", 243.0, 3.0)
    end = determine_end_position(center, config, "ANGULAR_SWEEP", 243.0, 3.0)

    assert start[0] != end[0] or start[1] != end[1]
    assert start[2] == end[2]  # same altitude for arc


# full pipeline e2e test
def test_full_pipeline(client):
    """end-to-end trajectory generation with real PostGIS"""
    airport = client.post("/api/v1/airports", json=TRAJECTORY_AIRPORT_PAYLOAD).json()
    airport_id = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{airport_id}/surfaces", json=TRAJECTORY_SURFACE_PAYLOAD
    ).json()
    surface_id = surface["id"]

    agl = client.post(
        f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls",
        json=TRAJECTORY_AGL_PAYLOAD,
    ).json()
    agl_id = agl["id"]

    for i in range(1, 5):
        client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas",
            json=make_lha_payload(i),
        )

    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": "E2E Test Template",
            "methods": ["ANGULAR_SWEEP"],
            "target_agl_ids": [agl_id],
            "default_config": {"measurement_density": 6, "speed_override": 5.0},
        },
    ).json()

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    # create mission
    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "E2E Trajectory Test",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 5.0,
        },
    ).json()
    mission_id = mission["id"]

    # add inspection
    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "ANGULAR_SWEEP"},
    )

    # generate trajectory
    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200
    data = response.json()

    fp = data["flight_plan"]
    assert fp["mission_id"] == mission_id
    assert fp["airport_id"] == airport_id
    assert len(fp["waypoints"]) >= 6
    assert fp["total_distance"] > 0
    assert fp["estimated_duration"] > 0

    # check waypoint types
    types = [wp["waypoint_type"] for wp in fp["waypoints"]]
    assert "MEASUREMENT" in types

    # check some waypoints have NONE camera action (lead-in/lead-out)
    camera_actions = [wp["camera_action"] for wp in fp["waypoints"]]
    assert "NONE" in camera_actions

    # mission should be PLANNED
    m = client.get(f"/api/v1/missions/{mission_id}").json()
    assert m["status"] == "PLANNED"

    # get flight plan endpoint
    fp2 = client.get(f"/api/v1/missions/{mission_id}/flight-plan")
    assert fp2.status_code == 200
    assert len(fp2.json()["waypoints"]) == len(fp["waypoints"])
