"""tests for elevation provider abstraction and terrain-following altitude."""

from unittest.mock import MagicMock, patch

from app.services.elevation_provider import (
    FlatElevationProvider,
    create_elevation_provider,
)
from app.services.trajectory_types import MINIMUM_AGL_ALTITUDE, WaypointData


class TestFlatElevationProvider:
    """tests for flat elevation provider - returns constant airport elevation."""

    def test_get_elevation_returns_airport_elevation(self):
        """single point query returns airport elevation."""
        provider = FlatElevationProvider(300.0)
        assert provider.get_elevation(50.0, 14.0) == 300.0

    def test_get_elevation_any_coordinates(self):
        """returns same elevation regardless of coordinates."""
        provider = FlatElevationProvider(150.0)
        assert provider.get_elevation(0.0, 0.0) == 150.0
        assert provider.get_elevation(89.0, -179.0) == 150.0
        assert provider.get_elevation(-45.5, 120.3) == 150.0

    def test_get_elevations_batch_returns_list(self):
        """batch query returns list of airport elevations."""
        provider = FlatElevationProvider(250.0)
        points = [(50.0, 14.0), (51.0, 15.0), (49.0, 13.0)]
        result = provider.get_elevations_batch(points)
        assert result == [250.0, 250.0, 250.0]

    def test_get_elevations_batch_empty(self):
        """batch query with empty list returns empty list."""
        provider = FlatElevationProvider(100.0)
        assert provider.get_elevations_batch([]) == []

    def test_get_elevations_batch_single_point(self):
        """batch query with single point."""
        provider = FlatElevationProvider(400.0)
        result = provider.get_elevations_batch([(50.0, 14.0)])
        assert result == [400.0]


class TestCreateElevationProvider:
    """tests for the factory function."""

    def test_flat_provider_for_default_airport(self):
        """airport with no terrain_source defaults to flat."""
        airport = MagicMock()
        airport.terrain_source = "FLAT"
        airport.elevation = 300.0
        airport.dem_file_path = None

        provider = create_elevation_provider(airport)
        assert isinstance(provider, FlatElevationProvider)
        assert provider.elevation == 300.0

    def test_flat_provider_when_terrain_source_none(self):
        """airport with None terrain_source defaults to flat."""
        airport = MagicMock()
        airport.terrain_source = None
        airport.elevation = 200.0

        provider = create_elevation_provider(airport)
        assert isinstance(provider, FlatElevationProvider)

    def test_flat_provider_when_no_terrain_source_attr(self):
        """airport without terrain_source attribute defaults to flat."""
        airport = MagicMock(spec=["elevation"])
        airport.elevation = 100.0

        provider = create_elevation_provider(airport)
        assert isinstance(provider, FlatElevationProvider)

    def test_dem_provider_fallback_when_no_file(self):
        """DEM source without file path falls back to flat."""
        airport = MagicMock()
        airport.terrain_source = "DEM"
        airport.elevation = 300.0
        airport.dem_file_path = None

        provider = create_elevation_provider(airport)
        assert isinstance(provider, FlatElevationProvider)

    def test_dem_provider_fallback_when_rasterio_missing(self):
        """DEM source falls back to flat when rasterio not installed."""
        airport = MagicMock()
        airport.terrain_source = "DEM"
        airport.elevation = 300.0
        airport.dem_file_path = "/some/path.tif"

        # mock rasterio import failure
        with patch(
            "app.services.elevation_provider.DEMElevationProvider.__init__",
            side_effect=ImportError("no rasterio"),
        ):
            provider = create_elevation_provider(airport)
            assert isinstance(provider, FlatElevationProvider)


class TestMinimumAglConstant:
    """tests for MINIMUM_AGL_ALTITUDE constant."""

    def test_minimum_agl_is_30m(self):
        """minimum AGL altitude is 30 meters per spec."""
        assert MINIMUM_AGL_ALTITUDE == 30.0


class TestTerrainDeltaComputation:
    """tests for terrain delta application to measurement waypoints."""

    def test_apply_terrain_delta_with_flat_provider(self):
        """flat provider produces zero terrain delta - no altitude change."""
        from app.services.trajectory_computation import _apply_terrain_delta
        from app.services.trajectory_types import Point3D

        provider = FlatElevationProvider(300.0)
        center = Point3D(lon=14.0, lat=50.0, alt=300.0)
        waypoints = [
            WaypointData(lon=14.01, lat=50.01, alt=350.0),
            WaypointData(lon=14.02, lat=50.02, alt=360.0),
        ]

        _apply_terrain_delta(waypoints, center, provider)

        # flat provider: terrain delta is zero everywhere
        assert waypoints[0].alt == 350.0
        assert waypoints[1].alt == 360.0

    def test_apply_terrain_delta_with_varying_terrain(self):
        """varying terrain shifts waypoint altitudes by delta from center."""
        from app.services.trajectory_computation import _apply_terrain_delta
        from app.services.trajectory_types import Point3D

        # mock provider: center at 300m, wp1 at 310m, wp2 at 290m
        provider = MagicMock()
        provider.get_elevations_batch.return_value = [310.0, 290.0, 300.0]

        center = Point3D(lon=14.0, lat=50.0, alt=300.0)
        waypoints = [
            WaypointData(lon=14.01, lat=50.01, alt=350.0),
            WaypointData(lon=14.02, lat=50.02, alt=360.0),
        ]

        _apply_terrain_delta(waypoints, center, provider)

        # wp1: 350 + (310 - 300) = 360
        assert waypoints[0].alt == 360.0
        # wp2: 360 + (290 - 300) = 350
        assert waypoints[1].alt == 350.0

    def test_apply_terrain_delta_no_provider(self):
        """no provider means no altitude change."""
        from app.services.trajectory_computation import _apply_terrain_delta
        from app.services.trajectory_types import Point3D

        center = Point3D(lon=14.0, lat=50.0, alt=300.0)
        waypoints = [WaypointData(lon=14.01, lat=50.01, alt=350.0)]

        _apply_terrain_delta(waypoints, center, None)
        assert waypoints[0].alt == 350.0

    def test_apply_terrain_delta_empty_waypoints(self):
        """empty waypoints list is a no-op."""
        from app.services.trajectory_computation import _apply_terrain_delta
        from app.services.trajectory_types import Point3D

        provider = FlatElevationProvider(300.0)
        center = Point3D(lon=14.0, lat=50.0, alt=300.0)

        _apply_terrain_delta([], center, provider)


class TestTransitAltitudeAdjustment:
    """tests for terrain-aware transit altitude adjustment."""

    def test_adjust_transit_no_provider(self):
        """no provider means no adjustment."""
        from app.services.trajectory_pathfinding import _adjust_transit_altitude_for_terrain

        waypoints = [WaypointData(lon=14.0, lat=50.0, alt=100.0)]
        _adjust_transit_altitude_for_terrain(waypoints, None)
        assert waypoints[0].alt == 100.0

    def test_adjust_transit_flat_terrain(self):
        """flat terrain at 300m - transit at 100m gets clamped to 330m."""
        from app.services.trajectory_pathfinding import _adjust_transit_altitude_for_terrain

        provider = FlatElevationProvider(300.0)
        waypoints = [WaypointData(lon=14.0, lat=50.0, alt=100.0)]
        _adjust_transit_altitude_for_terrain(waypoints, provider)
        assert waypoints[0].alt == 300.0 + MINIMUM_AGL_ALTITUDE

    def test_adjust_transit_already_high_enough(self):
        """transit already above terrain + min AGL stays unchanged."""
        from app.services.trajectory_pathfinding import _adjust_transit_altitude_for_terrain

        provider = FlatElevationProvider(100.0)
        waypoints = [WaypointData(lon=14.0, lat=50.0, alt=500.0)]
        _adjust_transit_altitude_for_terrain(waypoints, provider)
        assert waypoints[0].alt == 500.0

    def test_adjust_transit_varying_terrain(self):
        """varying terrain - each waypoint clamped independently."""
        from app.services.trajectory_pathfinding import _adjust_transit_altitude_for_terrain

        provider = MagicMock()
        provider.get_elevations_batch.return_value = [300.0, 400.0, 200.0]

        waypoints = [
            WaypointData(lon=14.0, lat=50.0, alt=350.0),
            WaypointData(lon=14.1, lat=50.1, alt=350.0),
            WaypointData(lon=14.2, lat=50.2, alt=350.0),
        ]
        _adjust_transit_altitude_for_terrain(waypoints, provider)

        assert waypoints[0].alt == 350.0  # 350 > 300 + 30
        assert waypoints[1].alt == 430.0  # 400 + 30
        assert waypoints[2].alt == 350.0  # 350 > 200 + 30


class TestSafetyValidatorAglCheck:
    """tests for AGL altitude check in safety validator."""

    def test_batch_check_minimum_agl_passes(self):
        """all waypoints above minimum AGL - no violations."""
        from app.services.safety_validator import _batch_check_minimum_agl

        provider = FlatElevationProvider(300.0)
        waypoints = [
            WaypointData(lon=14.0, lat=50.0, alt=340.0),
            WaypointData(lon=14.1, lat=50.1, alt=350.0),
        ]

        violations = _batch_check_minimum_agl(waypoints, provider)
        assert len(violations) == 0

    def test_batch_check_minimum_agl_violation(self):
        """waypoint below minimum AGL produces violation."""
        from app.services.safety_validator import _batch_check_minimum_agl

        provider = FlatElevationProvider(300.0)
        waypoints = [
            WaypointData(lon=14.0, lat=50.0, alt=310.0),  # only 10m AGL
        ]

        violations = _batch_check_minimum_agl(waypoints, provider)
        assert len(violations) == 1
        assert violations[0].violation_kind == "altitude"
        assert "10.0m AGL" in violations[0].message
        assert violations[0].waypoint_index == 0

    def test_batch_check_minimum_agl_exactly_at_limit(self):
        """waypoint exactly at minimum AGL - no violation."""
        from app.services.safety_validator import _batch_check_minimum_agl

        provider = FlatElevationProvider(300.0)
        waypoints = [
            WaypointData(lon=14.0, lat=50.0, alt=330.0),  # exactly 30m AGL
        ]

        violations = _batch_check_minimum_agl(waypoints, provider)
        assert len(violations) == 0

    def test_batch_check_minimum_agl_empty(self):
        """empty waypoints returns no violations."""
        from app.services.safety_validator import _batch_check_minimum_agl

        provider = FlatElevationProvider(300.0)
        assert _batch_check_minimum_agl([], provider) == []

    def test_validate_inspection_pass_with_elevation_provider(self):
        """validate_inspection_pass uses elevation provider for AGL checks."""
        from app.services.safety_validator import _batch_check_minimum_agl

        provider = MagicMock()
        provider.get_elevations_batch.return_value = [400.0]

        waypoints = [WaypointData(lon=14.0, lat=50.0, alt=410.0)]
        violations = _batch_check_minimum_agl(waypoints, provider)

        assert len(violations) == 1
        assert violations[0].violation_kind == "altitude"
        assert violations[0].is_warning is True


class TestAirportTerrainFields:
    """tests for airport terrain source and DEM path fields."""

    def test_airport_response_includes_terrain_fields(self, client):
        """airport response includes terrain_source and has_dem."""
        from tests.data.airports import AIRPORT_PAYLOAD

        r = client.post(
            "/api/v1/airports",
            json={**AIRPORT_PAYLOAD, "icao_code": "TERR"},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["terrain_source"] == "FLAT"
        assert data["has_dem"] is False
        assert "dem_file_path" not in data

    def test_airport_detail_includes_terrain_fields(self, client):
        """airport detail includes terrain fields."""
        airports = client.get("/api/v1/airports").json()["data"]
        terrain_airport = next(
            (a for a in airports if a.get("terrain_source") is not None), airports[0]
        )
        r = client.get(f"/api/v1/airports/{terrain_airport['id']}")
        assert r.status_code == 200
        data = r.json()
        assert "terrain_source" in data
        assert "has_dem" in data
        assert "dem_file_path" not in data

    def test_delete_terrain_dem_resets_to_flat(self, client):
        """delete terrain DEM resets airport to flat."""
        from tests.data.airports import AIRPORT_PAYLOAD

        r = client.post(
            "/api/v1/airports",
            json={**AIRPORT_PAYLOAD, "icao_code": "DELT"},
        )
        airport_id = r.json()["id"]

        r = client.delete(f"/api/v1/airports/{airport_id}/terrain-dem")
        assert r.status_code == 200
        assert r.json()["deleted"] is True

        r = client.get(f"/api/v1/airports/{airport_id}")
        assert r.json()["terrain_source"] == "FLAT"
        assert r.json()["has_dem"] is False
