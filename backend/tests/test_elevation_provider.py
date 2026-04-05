"""tests for elevation provider abstraction and terrain-following altitude."""

from unittest.mock import MagicMock, patch

from app.models.enums import WaypointType
from app.services.elevation_provider import (
    DEMElevationProvider,
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
            WaypointData(
                lon=14.0,
                lat=50.0,
                alt=310.0,
                waypoint_type=WaypointType.MEASUREMENT,
            ),
        ]

        violations = _batch_check_minimum_agl(waypoints, provider)
        assert len(violations) == 1
        assert violations[0].violation_kind == "altitude"
        assert "10.0m AGL" in violations[0].message
        assert violations[0].waypoint_index == 0
        assert violations[0].is_warning is True

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
        """waypoint below AGL produces soft warning with waypoint type in message."""
        from app.services.safety_validator import _batch_check_minimum_agl

        provider = MagicMock()
        provider.get_elevations_batch.return_value = [400.0]

        waypoints = [
            WaypointData(
                lon=14.0,
                lat=50.0,
                alt=410.0,
                waypoint_type=WaypointType.MEASUREMENT,
            ),
        ]
        violations = _batch_check_minimum_agl(waypoints, provider)

        assert len(violations) == 1
        assert violations[0].violation_kind == "altitude"
        assert violations[0].is_warning is True
        assert "MEASUREMENT" in violations[0].message


def _make_dem_provider(mock_dataset, fallback=0.0):
    """create a DEMElevationProvider with a pre-mocked dataset, bypassing __init__."""
    provider = object.__new__(DEMElevationProvider)
    provider.fallback_elevation = fallback
    provider.file_path = "/fake/path.tif"
    provider._dataset = mock_dataset
    return provider


class TestDEMElevationProvider:
    """tests for DEM elevation provider with mocked rasterio."""

    def test_get_elevation_samples_raster(self):
        """single point query samples raster dataset."""
        mock_dataset = MagicMock()
        mock_dataset.sample.return_value = iter([[250.0]])
        mock_dataset.nodata = -9999

        provider = _make_dem_provider(mock_dataset, fallback=100.0)
        result = provider.get_elevation(50.0, 14.0)

        assert result == 250.0
        mock_dataset.sample.assert_called_once_with([(14.0, 50.0)])

    def test_get_elevation_nodata_returns_fallback(self):
        """nodata value in raster returns fallback elevation."""
        mock_dataset = MagicMock()
        mock_dataset.sample.return_value = iter([[-9999.0]])
        mock_dataset.nodata = -9999.0

        provider = _make_dem_provider(mock_dataset, fallback=300.0)
        result = provider.get_elevation(50.0, 14.0)

        assert result == 300.0

    def test_get_elevation_exception_returns_fallback(self):
        """exception during sampling returns fallback."""
        mock_dataset = MagicMock()
        mock_dataset.sample.side_effect = RuntimeError("read error")

        provider = _make_dem_provider(mock_dataset, fallback=200.0)
        result = provider.get_elevation(50.0, 14.0)

        assert result == 200.0

    def test_get_elevations_batch_samples_all(self):
        """batch query returns elevations for all points."""
        mock_dataset = MagicMock()
        mock_dataset.sample.return_value = iter([[100.0], [200.0], [300.0]])
        mock_dataset.nodata = None

        provider = _make_dem_provider(mock_dataset)
        result = provider.get_elevations_batch([(50.0, 14.0), (51.0, 15.0), (52.0, 16.0)])

        assert result == [100.0, 200.0, 300.0]

    def test_get_elevations_batch_empty(self):
        """batch query with empty list returns empty list."""
        provider = _make_dem_provider(MagicMock())
        assert provider.get_elevations_batch([]) == []

    def test_get_elevations_batch_partial_failure(self):
        """partial batch failure keeps successful reads, falls back for rest."""
        mock_dataset = MagicMock()
        mock_dataset.nodata = None

        def partial_sample(coords):
            """yield some values then fail."""
            yield [100.0]
            yield [200.0]
            raise RuntimeError("disk error mid-read")

        mock_dataset.sample.side_effect = partial_sample

        provider = _make_dem_provider(mock_dataset, fallback=999.0)
        result = provider.get_elevations_batch(
            [
                (50.0, 14.0),
                (51.0, 15.0),
                (52.0, 16.0),
                (53.0, 17.0),
            ]
        )

        # first two succeeded, last two get fallback
        assert result == [100.0, 200.0, 999.0, 999.0]

    def test_get_elevations_batch_total_failure(self):
        """complete batch failure returns all fallbacks."""
        mock_dataset = MagicMock()
        mock_dataset.nodata = None
        mock_dataset.sample.side_effect = RuntimeError("total failure")

        provider = _make_dem_provider(mock_dataset, fallback=500.0)
        result = provider.get_elevations_batch([(50.0, 14.0), (51.0, 15.0)])

        assert result == [500.0, 500.0]

    def test_context_manager_closes_dataset(self):
        """context manager closes the raster dataset."""
        mock_dataset = MagicMock()
        provider = _make_dem_provider(mock_dataset)

        with provider:
            pass

        mock_dataset.close.assert_called()

    def test_close_called_explicitly(self):
        """explicit close() closes the raster dataset."""
        mock_dataset = MagicMock()
        provider = _make_dem_provider(mock_dataset)
        provider.close()

        mock_dataset.close.assert_called_once()

    def test_get_elevations_batch_with_nodata_mixed(self):
        """batch with mix of valid and nodata values."""
        mock_dataset = MagicMock()
        mock_dataset.nodata = -9999.0
        mock_dataset.sample.return_value = iter([[100.0], [-9999.0], [300.0]])

        provider = _make_dem_provider(mock_dataset, fallback=250.0)
        result = provider.get_elevations_batch([(50.0, 14.0), (51.0, 15.0), (52.0, 16.0)])

        assert result == [100.0, 250.0, 300.0]

    def test_get_elevation_nan_returns_fallback(self):
        """NaN value in raster returns fallback - e.g. nodata=None in file metadata."""
        mock_dataset = MagicMock()
        mock_dataset.sample.return_value = iter([[float("nan")]])
        mock_dataset.nodata = None

        provider = _make_dem_provider(mock_dataset, fallback=300.0)
        result = provider.get_elevation(50.0, 14.0)

        assert result == 300.0

    def test_get_elevation_nan_with_nodata_set(self):
        """NaN value caught even when nodata is set to a different value."""
        mock_dataset = MagicMock()
        mock_dataset.sample.return_value = iter([[float("nan")]])
        mock_dataset.nodata = -9999.0

        provider = _make_dem_provider(mock_dataset, fallback=200.0)
        result = provider.get_elevation(50.0, 14.0)

        assert result == 200.0

    def test_get_elevations_batch_nan_mixed(self):
        """batch with NaN values returns fallback for those points."""
        mock_dataset = MagicMock()
        mock_dataset.nodata = None
        mock_dataset.sample.return_value = iter([[100.0], [float("nan")], [300.0], [float("nan")]])

        provider = _make_dem_provider(mock_dataset, fallback=500.0)
        result = provider.get_elevations_batch(
            [(50.0, 14.0), (51.0, 15.0), (52.0, 16.0), (53.0, 17.0)]
        )

        assert result == [100.0, 500.0, 300.0, 500.0]


class TestAglViolationSeverity:
    """tests for AGL violation message includes waypoint type."""

    def test_measurement_waypoint_below_agl_includes_type(self):
        """measurement waypoint below min AGL includes type in message."""
        from app.services.safety_validator import _batch_check_minimum_agl

        provider = FlatElevationProvider(300.0)
        waypoints = [
            WaypointData(
                lon=14.0,
                lat=50.0,
                alt=310.0,
                waypoint_type=WaypointType.MEASUREMENT,
            ),
        ]

        violations = _batch_check_minimum_agl(waypoints, provider)
        assert len(violations) == 1
        assert violations[0].is_warning is True
        assert "MEASUREMENT" in violations[0].message

    def test_transit_waypoint_below_agl_includes_type(self):
        """transit waypoint below min AGL includes type in message."""
        from app.services.safety_validator import _batch_check_minimum_agl

        provider = FlatElevationProvider(300.0)
        waypoints = [
            WaypointData(
                lon=14.0,
                lat=50.0,
                alt=310.0,
                waypoint_type=WaypointType.TRANSIT,
            ),
        ]

        violations = _batch_check_minimum_agl(waypoints, provider)
        assert len(violations) == 1
        assert violations[0].is_warning is True
        assert "TRANSIT" in violations[0].message

    def test_mixed_waypoint_types_all_soft_warnings(self):
        """all waypoint types produce soft warnings with type in message."""
        from app.services.safety_validator import _batch_check_minimum_agl

        provider = FlatElevationProvider(300.0)
        waypoints = [
            WaypointData(lon=14.0, lat=50.0, alt=310.0, waypoint_type=WaypointType.TRANSIT),
            WaypointData(lon=14.1, lat=50.1, alt=310.0, waypoint_type=WaypointType.MEASUREMENT),
            WaypointData(lon=14.2, lat=50.2, alt=310.0, waypoint_type=WaypointType.HOVER),
            WaypointData(lon=14.3, lat=50.3, alt=340.0, waypoint_type=WaypointType.MEASUREMENT),
        ]

        violations = _batch_check_minimum_agl(waypoints, provider)
        assert len(violations) == 3
        # all are soft warnings
        assert all(v.is_warning is True for v in violations)
        assert violations[0].waypoint_index == 0
        assert violations[1].waypoint_index == 1
        assert violations[2].waypoint_index == 2
        # each includes its waypoint type
        assert "TRANSIT" in violations[0].message
        assert "MEASUREMENT" in violations[1].message
        assert "HOVER" in violations[2].message


class TestTerrainDirConfig:
    """tests for consolidated TERRAIN_DIR constant."""

    def test_terrain_dir_is_absolute(self):
        """TERRAIN_DIR is an absolute path."""
        from app.core.config import TERRAIN_DIR

        assert TERRAIN_DIR.is_absolute()

    def test_terrain_dir_ends_with_data_terrain(self):
        """TERRAIN_DIR points to data/terrain under project root."""
        from app.core.config import TERRAIN_DIR

        assert TERRAIN_DIR.parts[-2:] == ("data", "terrain")


class TestCreateElevationProviderDEM:
    """tests for DEM provider creation via factory with mocked rasterio."""

    def test_dem_provider_created_with_valid_path(self):
        """DEM_UPLOAD source with valid path creates DEMElevationProvider."""
        airport = MagicMock()
        airport.terrain_source = "DEM_UPLOAD"
        airport.elevation = 300.0
        airport.dem_file_path = "/some/valid/path.tif"

        with patch("app.services.elevation_provider.DEMElevationProvider") as mock_cls:
            mock_instance = MagicMock(spec=DEMElevationProvider)
            mock_cls.return_value = mock_instance

            provider = create_elevation_provider(airport)
            assert provider is mock_instance
            mock_cls.assert_called_once_with("/some/valid/path.tif", 300.0)

    def test_dem_provider_fallback_on_open_error(self):
        """DEM_API source falls back to flat when rasterio.open fails."""
        airport = MagicMock()
        airport.terrain_source = "DEM_API"
        airport.elevation = 300.0
        airport.dem_file_path = "/nonexistent/path.tif"

        with patch(
            "app.services.elevation_provider.DEMElevationProvider",
            side_effect=FileNotFoundError("no such file"),
        ):
            provider = create_elevation_provider(airport)
            assert isinstance(provider, FlatElevationProvider)
            assert provider.elevation == 300.0


class TestDEMCloseIdempotency:
    """tests for close() being safe to call multiple times."""

    def test_double_close_no_error(self):
        """calling close() twice does not raise."""
        mock_dataset = MagicMock()
        provider = _make_dem_provider(mock_dataset)

        provider.close()
        provider.close()

        # dataset.close() called only once - second call sees _dataset=None
        mock_dataset.close.assert_called_once()

    def test_close_sets_dataset_none(self):
        """close() sets _dataset to None."""
        mock_dataset = MagicMock()
        provider = _make_dem_provider(mock_dataset)

        provider.close()
        assert provider._dataset is None

    def test_context_manager_then_explicit_close(self):
        """context manager close followed by explicit close is safe."""
        mock_dataset = MagicMock()
        provider = _make_dem_provider(mock_dataset)

        with provider:
            pass

        # explicit close after context manager should not raise
        provider.close()
        mock_dataset.close.assert_called_once()

    def test_close_without_dataset_attr(self):
        """close() handles missing _dataset attribute gracefully."""
        provider = object.__new__(DEMElevationProvider)
        provider.fallback_elevation = 0.0
        provider.file_path = "/fake/path.tif"
        # _dataset never set - simulates __init__ failure

        # should not raise
        provider.close()


class TestGetAirportLonlat:
    """tests for airport location extraction helper."""

    def test_extracts_from_dict_location(self):
        """extracts lon, lat from dict-style location."""
        from app.services.airport_service import get_airport_lonlat

        airport = MagicMock()
        airport.location = {"type": "Point", "coordinates": [14.26, 50.1, 300.0]}

        lon, lat = get_airport_lonlat(airport)
        assert lon == 14.26
        assert lat == 50.1

    def test_raises_on_empty_coordinates(self):
        """raises DomainError when coordinates list is empty."""
        import pytest

        from app.core.exceptions import DomainError
        from app.services.airport_service import get_airport_lonlat

        airport = MagicMock()
        airport.location = {"type": "Point", "coordinates": []}

        with pytest.raises(DomainError, match="missing coordinates"):
            get_airport_lonlat(airport)

    def test_raises_on_single_coordinate(self):
        """raises DomainError when only one coordinate is present."""
        import pytest

        from app.core.exceptions import DomainError
        from app.services.airport_service import get_airport_lonlat

        airport = MagicMock()
        airport.location = {"type": "Point", "coordinates": [14.26]}

        with pytest.raises(DomainError, match="missing coordinates"):
            get_airport_lonlat(airport)


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


def _mock_numpy():
    """create a mock numpy module with full/flipud/float32 support."""
    mock_np = MagicMock()

    def _full(shape, fill_value, dtype=None):
        """mimic np.full - returns a list-of-lists 2D array."""
        rows, cols = shape
        return [[fill_value] * cols for _ in range(rows)]

    def _flipud(data):
        """mimic np.flipud - reverse row order."""
        return list(reversed(data))

    mock_np.full = _full
    mock_np.flipud = _flipud
    mock_np.float32 = "float32"
    return mock_np


def _mock_rasterio():
    """create a mock rasterio module with open/transform support."""
    mock_rio = MagicMock()

    # mock rasterio.open as context manager that records write calls
    mock_dst = MagicMock()
    mock_dst.__enter__ = MagicMock(return_value=mock_dst)
    mock_dst.__exit__ = MagicMock(return_value=False)
    mock_rio.open.return_value = mock_dst
    mock_rio.transform = MagicMock()
    mock_rio.transform.from_bounds = MagicMock(return_value="mock_transform")
    return mock_rio


def _make_download_settings(**overrides):
    """create mock settings for download tests."""
    s = MagicMock()
    s.terrain_grid_delta_deg = overrides.get("delta", 0.001)
    s.terrain_grid_step_deg = overrides.get("step", 0.001)
    s.terrain_download_timeout = overrides.get("timeout", 60.0)
    s.terrain_api_batch_size = overrides.get("batch_size", 2000)
    s.open_elevation_url = "http://test/lookup"
    return s


def _make_mock_http(response_data=None, side_effect=None):
    """create a mock httpx.Client context manager."""
    mock_http = MagicMock()
    mock_http.__enter__ = MagicMock(return_value=mock_http)
    mock_http.__exit__ = MagicMock(return_value=False)
    if side_effect:
        mock_http.post.side_effect = side_effect
    else:
        mock_response = MagicMock()
        mock_response.json.return_value = response_data or {"results": []}
        mock_response.raise_for_status = MagicMock()
        mock_http.post.return_value = mock_response
    return mock_http


class TestDownloadTerrainForLocation:
    """tests for download_terrain_for_location with mocked HTTP and rasterio."""

    def _run_download(self, mock_settings, mock_http, tmp_path=None, fallback_elevation=300.0):
        """run download_terrain_for_location with all necessary mocks."""
        import sys

        mock_np = _mock_numpy()
        mock_rio = _mock_rasterio()

        mock_terrain_dir = MagicMock()
        if tmp_path:
            mock_terrain_dir.__truediv__ = lambda self, name: tmp_path / name
        mock_terrain_dir.mkdir = MagicMock()

        patches = [
            patch("app.services.airport_service.TERRAIN_DIR", mock_terrain_dir),
            patch.dict(
                sys.modules,
                {"numpy": mock_np, "rasterio": mock_rio, "rasterio.transform": mock_rio.transform},
            ),
            patch("app.core.config.settings", mock_settings),
            patch("httpx.Client", return_value=mock_http),
        ]

        from contextlib import ExitStack

        with ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)

            from app.services.airport_service import download_terrain_for_location

            return download_terrain_for_location(
                airport_id="test-airport-id",
                apt_lon=14.26,
                apt_lat=50.1,
                fallback_elevation=fallback_elevation,
            )

    def test_successful_download(self, tmp_path):
        """successful API download creates GeoTIFF and returns file metadata."""
        mock_settings = _make_download_settings()
        mock_http = _make_mock_http({"results": [{"elevation": 310.0} for _ in range(9)]})

        result = self._run_download(mock_settings, mock_http, tmp_path)

        assert result["terrain_source"] == "DEM_API"
        assert result["points_downloaded"] > 0
        assert len(result["bounds"]) == 4
        assert "file_path" in result

    def test_timeout_raises_domain_error(self, tmp_path):
        """download that exceeds timeout raises DomainError with 504."""
        import sys

        import pytest

        from app.core.exceptions import DomainError

        mock_settings = _make_download_settings(timeout=0.0)
        mock_http = _make_mock_http()

        mock_np = _mock_numpy()
        mock_rio = _mock_rasterio()
        mock_terrain_dir = MagicMock()
        mock_terrain_dir.mkdir = MagicMock()

        from contextlib import ExitStack

        with ExitStack() as stack:
            stack.enter_context(patch("app.services.airport_service.TERRAIN_DIR", mock_terrain_dir))
            stack.enter_context(
                patch.dict(
                    sys.modules,
                    {
                        "numpy": mock_np,
                        "rasterio": mock_rio,
                        "rasterio.transform": mock_rio.transform,
                    },
                )
            )
            stack.enter_context(patch("app.core.config.settings", mock_settings))
            stack.enter_context(patch("httpx.Client", return_value=mock_http))
            stack.enter_context(patch("time.monotonic", side_effect=[0.0, 1.0]))

            from app.services.airport_service import download_terrain_for_location

            with pytest.raises(DomainError, match="timed out"):
                download_terrain_for_location(
                    airport_id="test-airport-id",
                    apt_lon=14.26,
                    apt_lat=50.1,
                    fallback_elevation=300.0,
                )

    def test_http_error_raises_domain_error(self, tmp_path):
        """HTTP error from API raises DomainError with 502."""
        import sys

        import httpx
        import pytest

        from app.core.exceptions import DomainError

        mock_settings = _make_download_settings()
        mock_http = _make_mock_http(side_effect=httpx.ConnectError("connection refused"))

        mock_np = _mock_numpy()
        mock_rio = _mock_rasterio()
        mock_terrain_dir = MagicMock()
        mock_terrain_dir.mkdir = MagicMock()

        from contextlib import ExitStack

        with ExitStack() as stack:
            stack.enter_context(patch("app.services.airport_service.TERRAIN_DIR", mock_terrain_dir))
            stack.enter_context(
                patch.dict(
                    sys.modules,
                    {
                        "numpy": mock_np,
                        "rasterio": mock_rio,
                        "rasterio.transform": mock_rio.transform,
                    },
                )
            )
            stack.enter_context(patch("app.core.config.settings", mock_settings))
            stack.enter_context(patch("httpx.Client", return_value=mock_http))

            from app.services.airport_service import download_terrain_for_location

            with pytest.raises(DomainError, match="API request failed"):
                download_terrain_for_location(
                    airport_id="test-airport-id",
                    apt_lon=14.26,
                    apt_lat=50.1,
                    fallback_elevation=300.0,
                )

    def test_short_batch_response_still_succeeds(self, tmp_path):
        """short batch response logs warning but doesn't fail."""
        mock_settings = _make_download_settings()
        mock_http = _make_mock_http({"results": [{"elevation": 300.0}]})

        result = self._run_download(mock_settings, mock_http, tmp_path)

        assert result["terrain_source"] == "DEM_API"
        assert result["points_downloaded"] == 1

    def test_non_numeric_elevation_uses_fallback(self, tmp_path):
        """non-numeric elevation value from API falls back to fallback elevation."""
        mock_settings = _make_download_settings()
        mock_http = _make_mock_http(
            {
                "results": [
                    {"elevation": 310.0},
                    {"elevation": None},
                    {"elevation": "invalid"},
                    {"elevation": {"nested": True}},
                ]
            }
        )

        result = self._run_download(mock_settings, mock_http, tmp_path)

        # 4 results: 1 valid + 3 fallbacks
        assert result["points_downloaded"] == 4
