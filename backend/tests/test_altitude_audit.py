"""altitude computation audit tests - MSL/AGL consistency, terrain correction,
obstacle grounding, and center point altitude derivation."""

import math

from app.services.elevation_provider import FlatElevationProvider
from app.services.trajectory_computation import (
    _apply_terrain_delta,
    calculate_arc_path,
    calculate_vertical_path,
)
from app.services.trajectory_types import (
    MIN_ARC_RADIUS,
    Point3D,
    ResolvedConfig,
    WaypointData,
)

# center point altitude tests


def test_center_altitude_from_normalized_lhas():
    """center.alt equals mean of stored LHA Z values when already normalized."""
    ground = 300.0
    # LHA positions already normalized to ground elevation at write time
    lha_positions = [
        Point3D(lon=14.274, lat=50.098, alt=ground),
        Point3D(lon=14.275, lat=50.098, alt=ground),
        Point3D(lon=14.276, lat=50.098, alt=ground),
    ]
    center = Point3D.center(lha_positions)

    # center.alt is the mean of normalized LHA Z values - already correct
    assert abs(center.alt - ground) < 0.01


def test_arc_path_altitude_with_ground_truthed_center():
    """arc waypoints use ground-truthed center, not raw LHA mean."""
    ground_elevation = 300.0
    center = Point3D(lon=14.274, lat=50.098, alt=ground_elevation)
    config = ResolvedConfig(measurement_density=3, altitude_offset=0.0)
    glide_slope = 3.0
    radius = MIN_ARC_RADIUS

    expected_alt = ground_elevation + radius * math.tan(math.radians(glide_slope))

    wps = calculate_arc_path(center, 243.0, glide_slope, config, None, 5.0)

    for wp in wps:
        assert abs(wp.alt - expected_alt) < 0.1
        # altitude should be relative to ground, not to LHA fixture height
        assert wp.alt > ground_elevation


def test_arc_path_altitude_not_affected_by_lha_height():
    """different raw LHA fixture heights produce same arc altitude after normalization."""
    ground = 300.0
    glide_slope = 3.0

    # group A: fixtures at 305m raw, normalized to ground
    raw_a = [
        Point3D(lon=14.274, lat=50.098, alt=305.0),
        Point3D(lon=14.275, lat=50.098, alt=305.0),
    ]
    # group B: fixtures at 298m raw, normalized to ground
    raw_b = [
        Point3D(lon=14.274, lat=50.098, alt=298.0),
        Point3D(lon=14.275, lat=50.098, alt=298.0),
    ]

    # simulate write-time normalization
    normalized_a = [Point3D(lon=p.lon, lat=p.lat, alt=ground) for p in raw_a]
    normalized_b = [Point3D(lon=p.lon, lat=p.lat, alt=ground) for p in raw_b]

    center_a = Point3D.center(normalized_a)
    center_b = Point3D.center(normalized_b)

    assert abs(center_a.alt - ground) < 0.01
    assert abs(center_b.alt - ground) < 0.01

    config = ResolvedConfig(measurement_density=3)
    wps_a = calculate_arc_path(center_a, 243.0, glide_slope, config, None, 5.0)
    wps_b = calculate_arc_path(center_b, 243.0, glide_slope, config, None, 5.0)

    for a, b in zip(wps_a, wps_b):
        assert abs(a.alt - b.alt) < 0.01


def test_vertical_path_altitude_with_ground_truthed_center():
    """vertical profile altitudes based on ground elevation, not LHA Z."""
    ground_elevation = 300.0
    center = Point3D(lon=14.274, lat=50.098, alt=ground_elevation)
    config = ResolvedConfig(measurement_density=5)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])

    for wp in wps:
        # all measurement altitudes should be above ground
        assert wp.alt > ground_elevation


def test_vertical_path_consistent_altitudes():
    """vertical profile should have monotonically increasing altitudes."""
    center = Point3D(lon=14.274, lat=50.098, alt=300.0)
    config = ResolvedConfig(measurement_density=8)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])
    alts = [wp.alt for wp in wps]

    for i in range(1, len(alts)):
        assert alts[i] > alts[i - 1], f"altitude must increase: {alts[i]} <= {alts[i - 1]}"


# terrain delta tests


class _SlopedProvider:
    """synthetic provider that returns different elevations for different positions."""

    def __init__(self, center_elev: float, waypoint_elev: float):
        """initialize with distinct center and waypoint elevations."""
        self.center_elev = center_elev
        self.waypoint_elev = waypoint_elev
        self._center_lat = None
        self._center_lon = None

    def get_elevation(self, lat: float, lon: float) -> float:
        """return elevation based on position."""
        if self._center_lat is not None:
            if abs(lat - self._center_lat) < 1e-6 and abs(lon - self._center_lon) < 1e-6:
                return self.center_elev
        return self.waypoint_elev

    def get_elevations_batch(self, points: list[tuple[float, float]]) -> list[float]:
        """batch elevation query - last point is center per _apply_terrain_delta convention."""
        results = [self.waypoint_elev] * (len(points) - 1)
        results.append(self.center_elev)
        return results


def test_terrain_delta_flat_provider_no_change():
    """flat elevation provider produces zero terrain delta - no altitude shift."""
    center = Point3D(lon=14.274, lat=50.098, alt=300.0)
    provider = FlatElevationProvider(300.0)

    wps = [
        WaypointData(lon=14.273, lat=50.097, alt=320.0, camera_target=center),
        WaypointData(lon=14.274, lat=50.098, alt=325.0, camera_target=center),
        WaypointData(lon=14.275, lat=50.099, alt=330.0, camera_target=center),
    ]
    original_alts = [wp.alt for wp in wps]

    _apply_terrain_delta(wps, center, provider)

    for wp, orig in zip(wps, original_alts):
        assert abs(wp.alt - orig) < 0.01


def test_terrain_delta_nonflat_shifts_waypoint_altitude():
    """non-uniform terrain shifts waypoint altitudes by terrain delta from center."""
    center = Point3D(lon=14.274, lat=50.098, alt=300.0)
    provider = _SlopedProvider(center_elev=300.0, waypoint_elev=350.0)

    wps = [
        WaypointData(lon=14.280, lat=50.100, alt=320.0, camera_target=center),
    ]

    _apply_terrain_delta(wps, center, provider)

    # terrain delta = 350 - 300 = 50, so waypoint should shift up by 50
    assert abs(wps[0].alt - 370.0) < 0.01


def test_terrain_delta_preserves_relative_geometry():
    """terrain delta shifts all waypoints by same amount when terrain is uniform."""
    center = Point3D(lon=14.274, lat=50.098, alt=300.0)
    provider = FlatElevationProvider(300.0)

    wps = [
        WaypointData(lon=14.273, lat=50.097, alt=310.0, camera_target=center),
        WaypointData(lon=14.274, lat=50.098, alt=320.0, camera_target=center),
    ]

    _apply_terrain_delta(wps, center, provider)

    # relative difference preserved
    assert abs((wps[1].alt - wps[0].alt) - 10.0) < 0.01


def test_terrain_delta_none_provider_noop():
    """no elevation provider means no terrain adjustment."""
    center = Point3D(lon=14.274, lat=50.098, alt=300.0)
    wps = [WaypointData(lon=14.273, lat=50.097, alt=320.0)]
    original_alt = wps[0].alt

    _apply_terrain_delta(wps, center, None)

    assert wps[0].alt == original_alt


def test_terrain_delta_recalculates_gimbal():
    """gimbal pitch is recalculated after terrain shift."""
    center = Point3D(lon=14.274, lat=50.098, alt=300.0)
    provider = FlatElevationProvider(300.0)

    wps = [
        WaypointData(
            lon=14.273,
            lat=50.097,
            alt=320.0,
            camera_target=center,
            gimbal_pitch=-5.0,
        ),
    ]

    _apply_terrain_delta(wps, center, provider)

    # gimbal pitch should be recalculated (not the original -5.0 stub)
    assert wps[0].gimbal_pitch is not None
    assert wps[0].gimbal_pitch != -5.0


# AGL export consistency


def test_waypoint_agl_above_ground():
    """measurement waypoints should always produce positive AGL when exported."""
    ground = 300.0
    center = Point3D(lon=14.274, lat=50.098, alt=ground)
    config = ResolvedConfig(measurement_density=5)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    for wp in wps:
        agl = wp.alt - ground
        assert agl > 0, f"AGL must be positive, got {agl}"


def test_vertical_path_agl_above_ground():
    """vertical profile waypoints should always produce positive AGL."""
    ground = 300.0
    center = Point3D(lon=14.274, lat=50.098, alt=ground)
    config = ResolvedConfig(measurement_density=5)

    wps = calculate_vertical_path(center, 243.0, config, None, 3.0, [])

    for wp in wps:
        agl = wp.alt - ground
        assert agl > 0, f"AGL must be positive, got {agl}"


# camera target altitude consistency


def test_camera_target_at_ground_level():
    """camera target (center) should be at ground level, not fixture height."""
    ground = 300.0
    center = Point3D(lon=14.274, lat=50.098, alt=ground)
    config = ResolvedConfig(measurement_density=3)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    for wp in wps:
        assert wp.camera_target is not None
        assert wp.camera_target.alt == ground


def test_camera_target_below_waypoint():
    """camera target should always be below the drone waypoint."""
    center = Point3D(lon=14.274, lat=50.098, alt=300.0)
    config = ResolvedConfig(measurement_density=5)

    wps = calculate_arc_path(center, 243.0, 3.0, config, None, 5.0)

    for wp in wps:
        assert wp.alt > wp.camera_target.alt


# obstacle altitude normalization


def test_obstacle_boundary_normalized_to_ground(client):
    """obstacle boundary z-coordinates should be normalized to ground elevation."""
    airport = client.post(
        "/api/v1/airports",
        json={
            "icao_code": "OALT",
            "name": "Obstacle Alt Test",
            "elevation": 300.0,
            "location": {"type": "Point", "coordinates": [14.26, 50.10, 300]},
        },
    ).json()
    airport_id = airport["id"]

    # create obstacle with boundary z = 350 (wrong - should be ground level)
    resp = client.post(
        f"/api/v1/airports/{airport_id}/obstacles",
        json={
            "name": "Test Tower",
            "type": "TOWER",
            "height": 50.0,
            "buffer_distance": 10.0,
            "boundary": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [14.2695, 50.0995, 350],
                        [14.2705, 50.0995, 350],
                        [14.2705, 50.1005, 350],
                        [14.2695, 50.1005, 350],
                        [14.2695, 50.0995, 350],
                    ]
                ],
            },
        },
    )
    assert resp.status_code in (200, 201)
    obs = resp.json()

    # with FlatElevationProvider, boundary z should be normalized to airport elevation
    ring = obs["boundary"]["coordinates"][0]
    for coord in ring:
        assert (
            abs(coord[2] - 300.0) < 0.1
        ), f"obstacle boundary z should be ground elevation (300), got {coord[2]}"


def test_obstacle_update_normalizes_boundary(client):
    """updating obstacle boundary normalizes z to ground elevation."""
    airport = client.post(
        "/api/v1/airports",
        json={
            "icao_code": "OUPO",
            "name": "Obstacle Update Test",
            "elevation": 280.0,
            "location": {"type": "Point", "coordinates": [14.26, 50.10, 280]},
        },
    ).json()
    airport_id = airport["id"]

    obs = client.post(
        f"/api/v1/airports/{airport_id}/obstacles",
        json={
            "name": "Update Tower",
            "type": "TOWER",
            "height": 30.0,
            "buffer_distance": 5.0,
            "boundary": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [14.2695, 50.0995, 280],
                        [14.2705, 50.0995, 280],
                        [14.2705, 50.1005, 280],
                        [14.2695, 50.1005, 280],
                        [14.2695, 50.0995, 280],
                    ]
                ],
            },
        },
    ).json()

    # update boundary with wrong z
    update_resp = client.put(
        f"/api/v1/airports/{airport_id}/obstacles/{obs['id']}",
        json={
            "boundary": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [14.2695, 50.0995, 500],
                        [14.2705, 50.0995, 500],
                        [14.2705, 50.1005, 500],
                        [14.2695, 50.1005, 500],
                        [14.2695, 50.0995, 500],
                    ]
                ],
            },
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()

    ring = updated["boundary"]["coordinates"][0]
    for coord in ring:
        assert (
            abs(coord[2] - 280.0) < 0.1
        ), f"updated obstacle boundary z should be ground elevation (280), got {coord[2]}"


# LHA altitude normalization


def _create_airport_surface_agl(client, icao, elevation=300.0):
    """helper - create airport, surface, and AGL for LHA/AGL normalization tests."""
    airport = client.post(
        "/api/v1/airports",
        json={
            "icao_code": icao,
            "name": f"{icao} Test",
            "elevation": elevation,
            "location": {"type": "Point", "coordinates": [14.26, 50.10, elevation]},
        },
    ).json()
    aid = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{aid}/surfaces",
        json={
            "identifier": "09L",
            "surface_type": "RUNWAY",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [14.26, 50.10, elevation],
                    [14.28, 50.10, elevation],
                ],
            },
        },
    ).json()
    sid = surface["id"]

    agl = client.post(
        f"/api/v1/airports/{aid}/surfaces/{sid}/agls",
        json={
            "agl_type": "PAPI",
            "name": "PAPI 09L",
            "position": {"type": "Point", "coordinates": [14.27, 50.10, elevation]},
        },
    ).json()

    return aid, sid, agl


def test_lha_position_normalized_on_create(client):
    """LHA position.z should be normalized to ground elevation on create."""
    aid, sid, agl = _create_airport_surface_agl(client, "LHAC", elevation=300.0)

    resp = client.post(
        f"/api/v1/airports/{aid}/surfaces/{sid}/agls/{agl['id']}/lhas",
        json={
            "unit_number": 1,
            "setting_angle": 3.0,
            "lamp_type": "LED",
            "position": {"type": "Point", "coordinates": [14.271, 50.10, 350.0]},
        },
    )
    assert resp.status_code in (200, 201)
    lha = resp.json()

    pos_z = lha["position"]["coordinates"][2]
    assert abs(pos_z - 300.0) < 0.1, f"LHA position.z should be ground elevation (300), got {pos_z}"


def test_lha_position_normalized_on_update(client):
    """LHA position.z should be normalized to ground elevation on update."""
    aid, sid, agl = _create_airport_surface_agl(client, "LHAU", elevation=300.0)

    lha = client.post(
        f"/api/v1/airports/{aid}/surfaces/{sid}/agls/{agl['id']}/lhas",
        json={
            "unit_number": 1,
            "setting_angle": 3.0,
            "lamp_type": "LED",
            "position": {"type": "Point", "coordinates": [14.271, 50.10, 300.0]},
        },
    ).json()

    update_resp = client.put(
        f"/api/v1/airports/{aid}/surfaces/{sid}/agls/{agl['id']}/lhas/{lha['id']}",
        json={
            "position": {"type": "Point", "coordinates": [14.271, 50.10, 999.0]},
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()

    pos_z = updated["position"]["coordinates"][2]
    assert (
        abs(pos_z - 300.0) < 0.1
    ), f"updated LHA position.z should be ground elevation (300), got {pos_z}"


# AGL altitude normalization


def test_agl_position_normalized_on_create(client):
    """AGL position.z should be normalized to ground elevation on create."""
    airport = client.post(
        "/api/v1/airports",
        json={
            "icao_code": "AGLC",
            "name": "AGL Create Test",
            "elevation": 280.0,
            "location": {"type": "Point", "coordinates": [14.26, 50.10, 280]},
        },
    ).json()
    aid = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{aid}/surfaces",
        json={
            "identifier": "27R",
            "surface_type": "RUNWAY",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [14.26, 50.10, 280],
                    [14.28, 50.10, 280],
                ],
            },
        },
    ).json()

    resp = client.post(
        f"/api/v1/airports/{aid}/surfaces/{surface['id']}/agls",
        json={
            "agl_type": "PAPI",
            "name": "PAPI 27R",
            "position": {"type": "Point", "coordinates": [14.27, 50.10, 400.0]},
        },
    )
    assert resp.status_code in (200, 201)
    agl = resp.json()

    pos_z = agl["position"]["coordinates"][2]
    assert abs(pos_z - 280.0) < 0.1, f"AGL position.z should be ground elevation (280), got {pos_z}"


def test_agl_position_normalized_on_update(client):
    """AGL position.z should be normalized to ground elevation on update."""
    airport = client.post(
        "/api/v1/airports",
        json={
            "icao_code": "AGLU",
            "name": "AGL Update Test",
            "elevation": 280.0,
            "location": {"type": "Point", "coordinates": [14.26, 50.10, 280]},
        },
    ).json()
    aid = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{aid}/surfaces",
        json={
            "identifier": "27R",
            "surface_type": "RUNWAY",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [14.26, 50.10, 280],
                    [14.28, 50.10, 280],
                ],
            },
        },
    ).json()

    agl = client.post(
        f"/api/v1/airports/{aid}/surfaces/{surface['id']}/agls",
        json={
            "agl_type": "PAPI",
            "name": "PAPI 27R",
            "position": {"type": "Point", "coordinates": [14.27, 50.10, 280.0]},
        },
    ).json()

    update_resp = client.put(
        f"/api/v1/airports/{aid}/surfaces/{surface['id']}/agls/{agl['id']}",
        json={
            "position": {"type": "Point", "coordinates": [14.27, 50.10, 999.0]},
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()

    pos_z = updated["position"]["coordinates"][2]
    assert (
        abs(pos_z - 280.0) < 0.1
    ), f"updated AGL position.z should be ground elevation (280), got {pos_z}"


# bulk re-normalization


def test_renormalize_airport_altitudes(client):
    """updating airport elevation triggers re-normalization of all positions."""
    airport = client.post(
        "/api/v1/airports",
        json={
            "icao_code": "RNRM",
            "name": "Renorm Test",
            "elevation": 300.0,
            "location": {"type": "Point", "coordinates": [14.26, 50.10, 300]},
        },
    ).json()
    aid = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{aid}/surfaces",
        json={
            "identifier": "09L",
            "surface_type": "RUNWAY",
            "geometry": {
                "type": "LineString",
                "coordinates": [[14.26, 50.10, 300], [14.28, 50.10, 300]],
            },
        },
    ).json()
    sid = surface["id"]

    # create obstacle, AGL, and LHA - all normalized to 300.0
    client.post(
        f"/api/v1/airports/{aid}/obstacles",
        json={
            "name": "Tower",
            "type": "TOWER",
            "height": 50.0,
            "buffer_distance": 10.0,
            "boundary": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [14.2695, 50.0995, 300],
                        [14.2705, 50.0995, 300],
                        [14.2705, 50.1005, 300],
                        [14.2695, 50.1005, 300],
                        [14.2695, 50.0995, 300],
                    ]
                ],
            },
        },
    ).json()

    agl = client.post(
        f"/api/v1/airports/{aid}/surfaces/{sid}/agls",
        json={
            "agl_type": "PAPI",
            "name": "PAPI 09L",
            "position": {"type": "Point", "coordinates": [14.27, 50.10, 300]},
        },
    ).json()

    client.post(
        f"/api/v1/airports/{aid}/surfaces/{sid}/agls/{agl['id']}/lhas",
        json={
            "unit_number": 1,
            "setting_angle": 3.0,
            "lamp_type": "LED",
            "position": {"type": "Point", "coordinates": [14.271, 50.10, 300]},
        },
    ).json()

    # update airport elevation - should trigger re-normalization
    client.put(
        f"/api/v1/airports/{aid}",
        json={"elevation": 350.0},
    )

    # re-read all entities - z should now be 350.0
    obs_resp = client.get(f"/api/v1/airports/{aid}/obstacles").json()
    obs_ring = obs_resp["data"][0]["boundary"]["coordinates"][0]
    for coord in obs_ring:
        assert (
            abs(coord[2] - 350.0) < 0.1
        ), f"obstacle boundary z should be re-normalized to 350, got {coord[2]}"

    agls_resp = client.get(f"/api/v1/airports/{aid}/surfaces/{sid}/agls").json()
    agl_z = agls_resp["data"][0]["position"]["coordinates"][2]
    assert abs(agl_z - 350.0) < 0.1, f"AGL should be re-normalized to 350, got {agl_z}"

    lha_data = agls_resp["data"][0]["lhas"][0]
    lha_z = lha_data["position"]["coordinates"][2]
    assert abs(lha_z - 350.0) < 0.1, f"LHA should be re-normalized to 350, got {lha_z}"


# edge cases


def test_single_lha_center_altitude():
    """single normalized LHA produces valid center at ground elevation."""
    ground = 300.0
    positions = [Point3D(lon=14.274, lat=50.098, alt=ground)]
    center = Point3D.center(positions)

    # LHA already normalized, center.alt == ground
    assert abs(center.alt - ground) < 0.01


def test_arc_path_altitude_offset():
    """altitude_offset should shift all arc waypoints uniformly."""
    center = Point3D(lon=14.274, lat=50.098, alt=300.0)
    config_no_offset = ResolvedConfig(measurement_density=3, altitude_offset=0.0)
    config_with_offset = ResolvedConfig(measurement_density=3, altitude_offset=10.0)

    wps_no = calculate_arc_path(center, 243.0, 3.0, config_no_offset, None, 5.0)
    wps_with = calculate_arc_path(center, 243.0, 3.0, config_with_offset, None, 5.0)

    for no, with_ in zip(wps_no, wps_with):
        assert abs((with_.alt - no.alt) - 10.0) < 0.01


def test_high_elevation_airport():
    """altitude computations work correctly for high-elevation airports."""
    high_ground = 2500.0
    center = Point3D(lon=14.274, lat=50.098, alt=high_ground)
    config = ResolvedConfig(measurement_density=3)
    glide_slope = 3.0
    radius = MIN_ARC_RADIUS

    expected_alt = high_ground + radius * math.tan(math.radians(glide_slope))
    wps = calculate_arc_path(center, 243.0, glide_slope, config, None, 5.0)

    for wp in wps:
        assert abs(wp.alt - expected_alt) < 0.1
        agl = wp.alt - high_ground
        assert agl > 0
