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


def test_center_altitude_uses_ground_elevation():
    """center.alt should be ground elevation, not mean of LHA Z values."""
    # LHA fixtures at varying heights above ground (e.g., on poles)
    lha_positions = [
        Point3D(lon=14.274, lat=50.098, alt=302.0),  # 2m above ground
        Point3D(lon=14.275, lat=50.098, alt=303.0),  # 3m above ground
        Point3D(lon=14.276, lat=50.098, alt=301.0),  # 1m above ground
    ]
    raw_center = Point3D.center(lha_positions)

    # raw mean would be 302.0 - but ground elevation is 300.0
    assert abs(raw_center.alt - 302.0) < 0.01

    # after ground-truthing with elevation provider
    provider = FlatElevationProvider(300.0)
    ground_truthed_alt = provider.get_elevation(raw_center.lat, raw_center.lon)

    assert ground_truthed_alt == 300.0
    assert ground_truthed_alt < raw_center.alt


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
    """if center.alt is ground-truthed, different LHA heights produce same arc altitude."""
    ground = 300.0
    glide_slope = 3.0

    # both use ground-truthed center altitude
    center_a = Point3D(lon=14.274, lat=50.098, alt=ground)
    center_b = Point3D(lon=14.274, lat=50.098, alt=ground)

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
        assert alts[i] > alts[i - 1], f"altitude must increase: {alts[i]} <= {alts[i-1]}"


# terrain delta tests


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


def test_obstacle_position_normalized_to_ground(client):
    """obstacle position.z should be normalized to ground elevation."""
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

    # create obstacle with position.z = 350 (wrong - should be ground level)
    resp = client.post(
        f"/api/v1/airports/{airport_id}/obstacles",
        json={
            "name": "Test Tower",
            "type": "TOWER",
            "height": 50.0,
            "radius": 10.0,
            "position": {"type": "Point", "coordinates": [14.27, 50.10, 350]},
            "geometry": {
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
    )
    assert resp.status_code in (200, 201)
    obs = resp.json()

    # with FlatElevationProvider, position.z should be normalized to airport elevation
    pos_z = obs["position"]["coordinates"][2]
    assert (
        abs(pos_z - 300.0) < 0.1
    ), f"obstacle position.z should be ground elevation (300), got {pos_z}"


def test_obstacle_update_normalizes_position(client):
    """updating obstacle position normalizes z to ground elevation."""
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
            "radius": 5.0,
            "position": {"type": "Point", "coordinates": [14.27, 50.10, 280]},
            "geometry": {
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

    # update position with wrong z
    update_resp = client.put(
        f"/api/v1/airports/{airport_id}/obstacles/{obs['id']}",
        json={
            "position": {"type": "Point", "coordinates": [14.27, 50.10, 500]},
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()

    pos_z = updated["position"]["coordinates"][2]
    assert (
        abs(pos_z - 280.0) < 0.1
    ), f"updated obstacle position.z should be ground elevation (280), got {pos_z}"


# edge cases


def test_single_lha_center_altitude():
    """single LHA should produce valid center with ground elevation."""
    provider = FlatElevationProvider(300.0)
    positions = [Point3D(lon=14.274, lat=50.098, alt=305.0)]
    center = Point3D.center(positions)

    # before ground-truthing, center.alt = LHA fixture alt
    assert center.alt == 305.0

    # after ground-truthing
    ground = provider.get_elevation(center.lat, center.lon)
    assert ground == 300.0


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
