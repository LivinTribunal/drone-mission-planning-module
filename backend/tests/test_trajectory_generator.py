from app.utils.geo import bearing, centroid, destination_point, haversine

# geo utility tests


def test_haversine_basic():
    """haversine between two known points"""
    # prague to brno - roughly 185km
    dist = haversine(14.42, 50.08, 16.61, 49.19)
    assert 180_000 < dist < 200_000


def test_bearing_north():
    """bearing due north should be ~0 degrees"""
    b = bearing(14.0, 50.0, 14.0, 51.0)
    assert abs(b) < 1.0 or abs(b - 360) < 1.0


def test_destination_point_roundtrip():
    """destination point and back should return to start"""
    lon, lat = 14.26, 50.10
    lon2, lat2 = destination_point(lon, lat, 90, 1000)
    dist = haversine(lon, lat, lon2, lat2)

    assert abs(dist - 1000) < 1.0


def test_centroid_single_point():
    """centroid of one point is the point itself"""
    c = centroid([(14.26, 50.10, 380.0)])
    assert c == (14.26, 50.10, 380.0)


def test_centroid_multiple_points():
    """centroid of symmetric points"""
    c = centroid([(0.0, 0.0, 100.0), (2.0, 0.0, 100.0), (1.0, 1.0, 100.0)])

    assert abs(c[0] - 1.0) < 0.01
    assert abs(c[2] - 100.0) < 0.01


# arc path tests


def test_arc_path_generates_correct_count():
    """arc path should generate measurement_density waypoints"""
    from app.models.inspection import InspectionConfiguration
    from app.services.trajectory_generator import calculate_arc_path

    config = InspectionConfiguration(measurement_density=10, altitude_offset=0.0)
    center = (14.274, 50.098, 380.0)

    waypoints = calculate_arc_path(center, 243.0, config, None, 5.0)

    assert len(waypoints) == 10
    assert all(wp.waypoint_type == "MEASUREMENT" for wp in waypoints)


def test_arc_path_radius_minimum():
    """all arc waypoints should be at least MIN_ARC_RADIUS from center"""
    from app.models.inspection import InspectionConfiguration
    from app.services.trajectory_generator import MIN_ARC_RADIUS, calculate_arc_path

    config = InspectionConfiguration(measurement_density=8)
    center = (14.274, 50.098, 380.0)

    waypoints = calculate_arc_path(center, 243.0, config, None, 5.0)

    for wp in waypoints:
        dist = haversine(center[0], center[1], wp.lon, wp.lat)
        assert dist >= MIN_ARC_RADIUS * 0.95  # 5% tolerance for floating point


def test_arc_path_heading_towards_center():
    """measurement waypoints should point at the LHA center"""
    from app.models.inspection import InspectionConfiguration
    from app.services.trajectory_generator import calculate_arc_path

    config = InspectionConfiguration(measurement_density=5)
    center = (14.274, 50.098, 380.0)

    waypoints = calculate_arc_path(center, 243.0, config, None, 5.0)

    for wp in waypoints:
        expected = bearing(wp.lon, wp.lat, center[0], center[1])
        diff = abs(wp.heading - expected)
        if diff > 180:
            diff = 360 - diff

        assert diff < 1.0


# vertical path tests


def test_vertical_path_generates_correct_count():
    """vertical path should generate measurement_density waypoints"""
    from app.models.inspection import InspectionConfiguration
    from app.services.trajectory_generator import calculate_vertical_path

    config = InspectionConfiguration(measurement_density=8)
    center = (14.274, 50.098, 380.0)

    waypoints = calculate_vertical_path(center, 243.0, config, None, 3.0)

    assert len(waypoints) == 8


def test_vertical_path_altitude_increases():
    """vertical profile waypoints should increase in altitude"""
    from app.models.inspection import InspectionConfiguration
    from app.services.trajectory_generator import calculate_vertical_path

    config = InspectionConfiguration(measurement_density=6)
    center = (14.274, 50.098, 380.0)

    waypoints = calculate_vertical_path(center, 243.0, config, None, 3.0)
    alts = [wp.alt for wp in waypoints]

    for i in range(1, len(alts)):
        assert alts[i] > alts[i - 1]


def test_vertical_path_same_horizontal_position():
    """all vertical profile waypoints should be at the same lon/lat"""
    from app.models.inspection import InspectionConfiguration
    from app.services.trajectory_generator import calculate_vertical_path

    config = InspectionConfiguration(measurement_density=5)
    center = (14.274, 50.098, 380.0)

    waypoints = calculate_vertical_path(center, 243.0, config, None, 3.0)

    for wp in waypoints:
        assert abs(wp.lon - waypoints[0].lon) < 0.0001
        assert abs(wp.lat - waypoints[0].lat) < 0.0001


# full pipeline test


def test_generate_trajectory_full_pipeline(client):
    """full trajectory generation pipeline"""
    # create airport
    airport = client.post(
        "/api/v1/airports",
        json={
            "icao_code": "LKNA",
            "name": "Test Trajectory Airport",
            "elevation": 300.0,
            "location": {"type": "Point", "coordinates": [14.26, 50.10, 300.0]},
        },
    ).json()
    airport_id = airport["id"]

    # create surface
    surface = client.post(
        f"/api/v1/airports/{airport_id}/surfaces",
        json={
            "identifier": "06/24",
            "surface_type": "RUNWAY",
            "geometry": {
                "type": "LineString",
                "coordinates": [[14.24, 50.10, 300], [14.28, 50.09, 300]],
            },
            "heading": 243.0,
            "length": 3500.0,
            "width": 45.0,
        },
    ).json()
    surface_id = surface["id"]

    # create AGL + LHAs
    agl = client.post(
        f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls",
        json={
            "agl_type": "PAPI",
            "name": "Test PAPI",
            "position": {"type": "Point", "coordinates": [14.274, 50.098, 300.0]},
            "side": "LEFT",
            "glide_slope_angle": 3.0,
        },
    ).json()
    agl_id = agl["id"]

    for i in range(1, 5):
        client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas",
            json={
                "unit_number": i,
                "setting_angle": 3.0 + (i - 1) * 0.5,
                "lamp_type": "HALOGEN",
                "position": {
                    "type": "Point",
                    "coordinates": [14.274 + i * 0.0003, 50.098, 300.0],
                },
            },
        )

    # create template with target AGL
    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": "Trajectory Test Template",
            "methods": ["ANGULAR_SWEEP"],
            "target_agl_ids": [agl_id],
            "default_config": {"measurement_density": 6, "speed_override": 5.0},
        },
    ).json()

    # create drone
    drone = client.post(
        "/api/v1/drone-profiles",
        json={
            "name": "Trajectory Test Drone",
            "max_speed": 23.0,
            "max_altitude": 500.0,
            "endurance_minutes": 55.0,
            "camera_frame_rate": 30,
        },
    ).json()

    # create mission
    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Trajectory Test Mission",
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

    # mission should now be PLANNED
    mission_after = client.get(f"/api/v1/missions/{mission_id}").json()
    assert mission_after["status"] == "PLANNED"

    # get flight plan
    fp_response = client.get(f"/api/v1/missions/{mission_id}/flight-plan")
    assert fp_response.status_code == 200
    assert len(fp_response.json()["waypoints"]) >= 6
