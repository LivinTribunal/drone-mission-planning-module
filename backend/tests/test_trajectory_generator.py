import math

from app.models.enums import CameraAction, InspectionMethod, WaypointType
from app.services.trajectory_types import Point3D, ResolvedConfig, WaypointData
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

    config = ResolvedConfig(measurement_density=10)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    assert len(wps) == 10
    assert all(wp.waypoint_type == WaypointType.MEASUREMENT for wp in wps)


def test_arc_path_radius():
    """all arc waypoints should be >= 350m from center"""
    from app.services.trajectory_generator import MIN_ARC_RADIUS, calculate_arc_path

    config = ResolvedConfig(measurement_density=8)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    for wp in wps:
        dist = distance_between(center.lon, center.lat, wp.lon, wp.lat)
        assert dist >= MIN_ARC_RADIUS * 0.95


def test_arc_path_heading_towards_center():
    """measurement waypoints should point at LHA center"""
    from app.services.trajectory_generator import calculate_arc_path

    config = ResolvedConfig(measurement_density=5)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    for wp in wps:
        expected = bearing_between(wp.lon, wp.lat, center.lon, center.lat)
        diff = abs(wp.heading - expected)
        if diff > 180:
            diff = 360 - diff

        assert diff < 1.0


def test_arc_path_altitude_uses_glide_slope():
    """arc altitude = center_alt + r * tan(glide_slope) + offset"""
    from app.services.trajectory_generator import MIN_ARC_RADIUS, calculate_arc_path

    config = ResolvedConfig(measurement_density=3, altitude_offset=5.0)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)
    glide_slope = 3.0
    radius = MIN_ARC_RADIUS

    expected_alt = center.alt + radius * math.tan(math.radians(glide_slope)) + 5.0

    wps = calculate_arc_path(center, 243.0, glide_slope, config, None, 5.0)

    for wp in wps:
        assert abs(wp.alt - expected_alt) < 0.1


# vertical path tests
def test_vertical_path_count():
    """vertical path should generate measurement_density waypoints"""
    from app.services.trajectory_generator import calculate_vertical_path

    config = ResolvedConfig(measurement_density=8)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])

    assert len(wps) == 8


def test_vertical_path_altitude_increases():
    """altitude should increase from min to max elevation angle"""
    from app.services.trajectory_generator import calculate_vertical_path

    config = ResolvedConfig(measurement_density=6)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])
    alts = [wp.alt for wp in wps]

    for i in range(1, len(alts)):
        assert alts[i] > alts[i - 1]


def test_vertical_path_same_horizontal():
    """all vertical profile waypoints at same lon/lat"""
    from app.services.trajectory_generator import calculate_vertical_path

    config = ResolvedConfig(measurement_density=5)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])

    for wp in wps:
        assert abs(wp.lon - wps[0].lon) < 0.0001
        assert abs(wp.lat - wps[0].lat) < 0.0001


def test_vertical_path_hover_at_transitions():
    """HOVER waypoints inserted at LHA setting angle boundaries"""
    from app.services.trajectory_generator import calculate_vertical_path

    # optimal density for 0.05 tolerance over 4.6 range = ceil(4.6/0.1)+1 = 47
    # use 50 to be safe
    config = ResolvedConfig(measurement_density=50, hover_duration=5.0)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)
    setting_angles = [3.0, 3.5, 4.0, 4.5]

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, setting_angles)

    hover_wps = [wp for wp in wps if wp.waypoint_type == WaypointType.HOVER]

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

    template = type("T", (), {"default_config": template_config})()

    override_config = InspectionConfiguration(measurement_density=15)

    inspection = type("I", (), {"config": override_config})()

    result = _resolve_with_defaults(inspection, template)

    assert result.measurement_density == 15
    assert result.speed_override == 5.0
    assert result.altitude_offset == 2.0


def test_resolve_with_defaults_no_configs():
    """hardcoded defaults when no config provided"""
    from app.services.trajectory_generator import _resolve_with_defaults

    template = type("T", (), {"default_config": None})()
    inspection = type("I", (), {"config": None})()

    result = _resolve_with_defaults(inspection, template)

    assert result.measurement_density == 8
    assert result.altitude_offset == 0.0


# camera action tests
def test_lead_in_lead_out_none():
    """first and last waypoints should have NONE camera action"""
    from app.services.trajectory_generator import _apply_camera_actions

    wps = [
        WaypointData(lon=0, lat=0, alt=0),
        WaypointData(lon=0, lat=0, alt=0),
        WaypointData(lon=0, lat=0, alt=0),
    ]

    _apply_camera_actions(wps)

    assert wps[0].camera_action == CameraAction.NONE
    assert wps[1].camera_action == CameraAction.PHOTO_CAPTURE
    assert wps[2].camera_action == CameraAction.NONE


# gimbal pitch tests
def test_arc_path_has_gimbal_pitch():
    """arc waypoints should have gimbal pitch computed"""
    from app.services.trajectory_generator import calculate_arc_path

    config = ResolvedConfig(measurement_density=5)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    for wp in wps:
        assert wp.gimbal_pitch is not None
        assert wp.gimbal_pitch < 0


def test_vertical_path_has_gimbal_pitch():
    """vertical profile waypoints should have gimbal pitch"""
    from app.services.trajectory_generator import calculate_vertical_path

    config = ResolvedConfig(measurement_density=5)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

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
    from app.services.trajectory_generator import determine_end_position, determine_start_position

    config = ResolvedConfig(measurement_density=8)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    start = determine_start_position(center, config, InspectionMethod.ANGULAR_SWEEP, 243.0, 3.0)
    end = determine_end_position(center, config, InspectionMethod.ANGULAR_SWEEP, 243.0, 3.0)

    assert start.lon != end.lon or start.lat != end.lat
    assert abs(start.alt - end.alt) < 0.01


# config override tests
def test_config_override_sweep_angle():
    """arc path uses overridden sweep angle"""
    from app.services.trajectory_generator import calculate_arc_path

    default_config = ResolvedConfig(measurement_density=5)
    wide_config = ResolvedConfig(measurement_density=5, sweep_angle=20.0)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    default_wps = calculate_arc_path(center, 243.0, 3.0, default_config, None, 5.0)
    wide_wps = calculate_arc_path(center, 243.0, 3.0, wide_config, None, 5.0)

    # wider sweep = more spread between first and last waypoint
    default_spread = distance_between(
        default_wps[0].lon, default_wps[0].lat, default_wps[-1].lon, default_wps[-1].lat
    )
    wide_spread = distance_between(
        wide_wps[0].lon, wide_wps[0].lat, wide_wps[-1].lon, wide_wps[-1].lat
    )

    assert wide_spread > default_spread


def test_config_override_horizontal_distance():
    """vertical path uses overridden horizontal distance"""
    from app.services.trajectory_generator import calculate_vertical_path

    default_config = ResolvedConfig(measurement_density=5)
    far_config = ResolvedConfig(measurement_density=5, horizontal_distance=600.0)
    center = Point3D(lon=14.274, lat=50.098, alt=380.0)

    default_wps = calculate_vertical_path(center, 243.0, default_config, None, 3.0, [])
    far_wps = calculate_vertical_path(center, 243.0, far_config, None, 3.0, [])

    # farther distance = higher altitudes (same elevation angle, more distance)
    assert far_wps[0].alt > default_wps[0].alt


# Point3D tests
def test_point3d_roundtrip():
    """Point3D to_tuple and from_tuple"""
    p = Point3D(lon=14.26, lat=50.10, alt=380.0)

    assert p.to_tuple() == (14.26, 50.10, 380.0)
    assert Point3D.from_tuple(p.to_tuple()) == p


# optimal density tests
def test_compute_optimal_density_vertical():
    """optimal density for vertical profile covers all transition angles"""
    from app.services.trajectory_generator import compute_optimal_density

    config = ResolvedConfig()
    setting_angles = [3.0, 3.5, 4.0, 4.5]

    density = compute_optimal_density(InspectionMethod.VERTICAL_PROFILE, setting_angles, config)

    assert density is not None
    # 4.6 range / (2 * 0.05 tolerance) + 1 = 47
    assert density >= 47


def test_compute_optimal_density_arc():
    """optimal density for arc provides at least one point per degree"""
    from app.services.trajectory_generator import compute_optimal_density

    config = ResolvedConfig()

    density = compute_optimal_density(InspectionMethod.ANGULAR_SWEEP, [], config)

    assert density is not None
    # 2 * 15 degrees + 1 = 31
    assert density >= 31


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

    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "ANGULAR_SWEEP"},
    )

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200
    data = response.json()

    fp = data["flight_plan"]
    assert fp["mission_id"] == mission_id
    assert fp["airport_id"] == airport_id
    assert len(fp["waypoints"]) >= 6
    assert fp["total_distance"] > 0
    assert fp["estimated_duration"] > 0

    types = [wp["waypoint_type"] for wp in fp["waypoints"]]
    assert "MEASUREMENT" in types

    camera_actions = [wp["camera_action"] for wp in fp["waypoints"]]
    assert "NONE" in camera_actions

    m = client.get(f"/api/v1/missions/{mission_id}").json()
    assert m["status"] == "PLANNED"

    fp2 = client.get(f"/api/v1/missions/{mission_id}/flight-plan")
    assert fp2.status_code == 200
    assert len(fp2.json()["waypoints"]) == len(fp["waypoints"])
