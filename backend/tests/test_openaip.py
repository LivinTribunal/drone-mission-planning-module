"""tests for openaip integration service and route."""

import math
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.core.config import settings
from app.core.exceptions import DomainError, NotFoundError
from app.services import openaip_service
from app.utils.geo import distance_between


# geometry helpers
def test_compute_runway_geometry_length_and_shape():
    """centerline length matches input length and boundary has 4 unique corners."""
    result = openaip_service._compute_runway_geometry(
        threshold_lat=50.0,
        threshold_lon=14.0,
        heading_deg=90.0,
        length_m=2000.0,
        width_m=45.0,
        elevation_m=100.0,
    )

    geom = result["geometry"]
    assert geom.type == "LineString"
    assert len(geom.coordinates) == 2

    start = geom.coordinates[0]
    end = geom.coordinates[1]
    measured = distance_between(start[0], start[1], end[0], end[1])
    assert math.isclose(measured, 2000.0, rel_tol=1e-3)

    assert geom.coordinates[0][2] == 100.0
    assert geom.coordinates[1][2] == 100.0

    boundary = result["boundary"]
    assert boundary.type == "Polygon"
    # 5 points (4 corners + closing)
    assert len(boundary.coordinates[0]) == 5
    assert boundary.coordinates[0][0] == boundary.coordinates[0][-1]

    end_position = result["end_position"]
    assert math.isclose(end_position.coordinates[0], end[0])
    assert math.isclose(end_position.coordinates[1], end[1])


def test_compute_runway_geometry_boundary_width():
    """boundary short side measures approximately runway width."""
    result = openaip_service._compute_runway_geometry(
        threshold_lat=50.0,
        threshold_lon=14.0,
        heading_deg=90.0,
        length_m=1000.0,
        width_m=60.0,
        elevation_m=0.0,
    )

    ring = result["boundary"].coordinates[0]
    # first two corners sit at the threshold end, offset left vs right
    left_threshold = ring[0]
    right_threshold = ring[3]
    width = distance_between(
        left_threshold[0], left_threshold[1], right_threshold[0], right_threshold[1]
    )
    assert math.isclose(width, 60.0, rel_tol=1e-3)


def test_generate_obstacle_boundary_is_closed_and_radius():
    """generated polygon is closed and vertices sit ~radius from center."""
    center_lon, center_lat = 14.0, 50.0
    polygon = openaip_service._generate_obstacle_boundary(
        center_lat, center_lon, elevation=120.0, radius_m=5.0, vertices=16
    )

    ring = polygon.coordinates[0]
    assert ring[0] == ring[-1]
    # 16 unique + closing
    assert len(ring) == 17

    for coord in ring[:-1]:
        d = distance_between(center_lon, center_lat, coord[0], coord[1])
        assert math.isclose(d, 5.0, rel_tol=1e-2)
        assert coord[2] == 120.0


# type mappers
def test_map_airspace_type_known_and_unknown():
    """known airspace codes map, unknown returns None."""
    assert openaip_service._map_airspace_type(4) == "CTR"
    assert openaip_service._map_airspace_type(1) == "RESTRICTED"
    assert openaip_service._map_airspace_type(2) == "PROHIBITED"
    assert openaip_service._map_airspace_type(999) is None
    assert openaip_service._map_airspace_type(None) is None


def test_map_obstacle_type_defaults_to_other():
    """unmapped obstacle types fall back to OTHER."""
    assert openaip_service._map_obstacle_type(14) == "TOWER"
    assert openaip_service._map_obstacle_type(2) == "BUILDING"
    assert openaip_service._map_obstacle_type(999) == "OTHER"
    assert openaip_service._map_obstacle_type(None) == "OTHER"


# unit conversion
def test_convert_length_units():
    """feet, km, nm, meters convert correctly."""
    # feet -> meters
    assert math.isclose(openaip_service._convert_length(100, 1), 30.48, rel_tol=1e-6)
    # meters pass-through
    assert openaip_service._convert_length(42.0, 0) == 42.0
    # None passes through
    assert openaip_service._convert_length(None, 0) is None
    # km
    assert math.isclose(openaip_service._convert_length(1, 6), 1000.0)
    # nm
    assert math.isclose(openaip_service._convert_length(1, 7), 1852.0)


def test_convert_altitude_limit_flight_level():
    """flight level converts to meters."""
    v = openaip_service._convert_altitude_limit({"value": 50, "unit": 2})
    # FL50 = 5000 ft -> ~1524 m
    assert v is not None
    assert math.isclose(v, 5000.0 * 0.3048, rel_tol=1e-6)


def test_convert_altitude_limit_feet_and_meters():
    """feet and meters altitude limits convert correctly."""
    assert math.isclose(
        openaip_service._convert_altitude_limit({"value": 1000, "unit": 1}),
        304.8,
        rel_tol=1e-6,
    )
    assert openaip_service._convert_altitude_limit({"value": 100, "unit": 0}) == 100.0
    assert openaip_service._convert_altitude_limit(None) is None
    assert openaip_service._convert_altitude_limit({}) is None


# parse helpers
def test_parse_runway_skips_incomplete():
    """missing dimension or threshold returns None."""
    rw = {"designator": "09", "dimension": {}, "trueHeading": 90.0}
    assert openaip_service._parse_runway(rw, 0.0) is None


def test_parse_runway_builds_geometry():
    """a complete runway payload produces a full suggestion."""
    rw = {
        "designator": "09",
        "trueHeading": 90.0,
        "dimension": {
            "length": {"value": 2000, "unit": 0},
            "width": {"value": 45, "unit": 0},
        },
        "thresholdLocation": {"type": "Point", "coordinates": [14.0, 50.0]},
    }

    suggestion = openaip_service._parse_runway(rw, 100.0)
    assert suggestion is not None
    assert suggestion.identifier == "09"
    assert suggestion.length == 2000.0
    assert suggestion.width == 45.0
    assert suggestion.threshold_position.coordinates[2] == 100.0
    assert len(suggestion.boundary.coordinates[0]) == 5


def test_parse_airspace_maps_and_polygon():
    """mapped airspace type produces a safety zone suggestion."""
    item = {
        "name": "LZIB CTR",
        "type": 4,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[14.0, 50.0], [14.1, 50.0], [14.1, 50.1], [14.0, 50.1], [14.0, 50.0]]],
        },
        "lowerLimit": {"value": 0, "unit": 0},
        "upperLimit": {"value": 25, "unit": 2},
    }

    parsed = openaip_service._parse_airspace(item)
    assert parsed is not None
    assert parsed.type == "CTR"
    assert parsed.name == "LZIB CTR"
    # 5 coords in ring (closed); each gets a Z coordinate
    assert len(parsed.geometry.coordinates[0]) == 5
    assert all(len(c) == 3 for c in parsed.geometry.coordinates[0])


def test_parse_airspace_returns_none_for_unmapped_type():
    """unmapped airspace type returns None."""
    item = {
        "name": "Unknown",
        "type": 999,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
    }
    assert openaip_service._parse_airspace(item) is None


def test_parse_obstacle_generates_boundary():
    """obstacle point produces circular boundary polygon."""
    item = {
        "name": "Tower",
        "type": 14,
        "geometry": {"type": "Point", "coordinates": [14.0, 50.0]},
        "height": {"value": 45, "unit": 0},
        "elevation": {"value": 120, "unit": 0},
    }

    parsed = openaip_service._parse_obstacle(item, 100.0)
    assert parsed is not None
    assert parsed.type == "TOWER"
    assert parsed.height == 45.0
    ring = parsed.boundary.coordinates[0]
    assert ring[0] == ring[-1]


# http layer
def test_client_raises_when_api_key_missing(monkeypatch):
    """missing api key raises DomainError(503)."""
    monkeypatch.setattr(settings, "openaip_api_key", "")
    with pytest.raises(DomainError) as exc:
        openaip_service._client()
    assert exc.value.status_code == 503


def test_get_maps_404_to_not_found(monkeypatch):
    """404 response becomes NotFoundError."""
    monkeypatch.setattr(settings, "openaip_api_key", "testkey")

    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = 404

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.get.return_value = mock_resp

    with pytest.raises(NotFoundError):
        openaip_service._get(mock_client, "/airports", {})


def test_get_maps_500_to_domain_error(monkeypatch):
    """5xx response becomes DomainError(502)."""
    monkeypatch.setattr(settings, "openaip_api_key", "testkey")

    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = 500

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.get.return_value = mock_resp

    with pytest.raises(DomainError) as exc:
        openaip_service._get(mock_client, "/airports", {})
    assert exc.value.status_code == 502


def test_get_maps_auth_error_to_503(monkeypatch):
    """401/403 becomes DomainError(503)."""
    monkeypatch.setattr(settings, "openaip_api_key", "testkey")

    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = 401

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.get.return_value = mock_resp

    with pytest.raises(DomainError) as exc:
        openaip_service._get(mock_client, "/airports", {})
    assert exc.value.status_code == 503


def test_get_timeout_becomes_502(monkeypatch):
    """httpx timeout becomes DomainError(502)."""
    monkeypatch.setattr(settings, "openaip_api_key", "testkey")

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.get.side_effect = httpx.TimeoutException("timed out")

    with pytest.raises(DomainError) as exc:
        openaip_service._get(mock_client, "/airports", {})
    assert exc.value.status_code == 502


# end-to-end service call with mocked http
def test_lookup_airport_by_icao_happy_path(monkeypatch):
    """full happy-path run assembles airport + runway + airspace + obstacle."""
    monkeypatch.setattr(settings, "openaip_api_key", "testkey")

    def fake_get(client, path, params=None):
        """fake _get returning synthetic payloads for each endpoint."""
        if path == "/airports":
            return {
                "items": [
                    {
                        "icaoCode": "LZIB",
                        "name": "Bratislava",
                        "city": "Bratislava",
                        "country": "SK",
                        "elevation": {"value": 133, "unit": 0},
                        "geometry": {"type": "Point", "coordinates": [17.21, 48.17]},
                        "runways": [
                            {
                                "designator": "04",
                                "trueHeading": 40.0,
                                "dimension": {
                                    "length": {"value": 2900, "unit": 0},
                                    "width": {"value": 45, "unit": 0},
                                },
                                "thresholdLocation": {
                                    "type": "Point",
                                    "coordinates": [17.21, 48.17],
                                },
                            }
                        ],
                    }
                ]
            }
        if path == "/airspaces":
            return {
                "items": [
                    {
                        "name": "LZIB CTR",
                        "type": 4,
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [17.2, 48.1],
                                    [17.3, 48.1],
                                    [17.3, 48.2],
                                    [17.2, 48.2],
                                    [17.2, 48.1],
                                ]
                            ],
                        },
                    }
                ]
            }
        if path == "/obstacles":
            return {
                "items": [
                    {
                        "name": "TV Mast",
                        "type": 14,
                        "geometry": {"type": "Point", "coordinates": [17.22, 48.18]},
                        "height": {"value": 120, "unit": 0},
                    }
                ]
            }
        return {"items": []}

    with patch.object(openaip_service, "_get", side_effect=fake_get):
        result = openaip_service.lookup_airport_by_icao("LZIB")

    assert result.icao_code == "LZIB"
    assert result.name == "Bratislava"
    assert result.elevation == 133.0
    assert len(result.runways) == 1
    assert result.runways[0].identifier == "04"
    assert len(result.safety_zones) == 1
    assert result.safety_zones[0].type == "CTR"
    assert len(result.obstacles) == 1
    assert result.obstacles[0].type == "TOWER"


def test_lookup_airport_not_found_when_search_empty(monkeypatch):
    """empty search response raises NotFoundError."""
    monkeypatch.setattr(settings, "openaip_api_key", "testkey")

    with patch.object(openaip_service, "_get", return_value={"items": []}):
        with pytest.raises(NotFoundError):
            openaip_service.lookup_airport_by_icao("XXXX")


def test_lookup_route_missing_key_returns_503(client, monkeypatch):
    """route returns 503 when api key is not configured."""
    monkeypatch.setattr(settings, "openaip_api_key", "")
    r = client.get("/api/v1/airports/lookup/LZIB")
    assert r.status_code == 503


def test_lookup_route_not_found(client, monkeypatch):
    """route returns 404 when openaip has no matching airport."""
    monkeypatch.setattr(settings, "openaip_api_key", "testkey")

    with patch.object(openaip_service, "_get", return_value={"items": []}):
        r = client.get("/api/v1/airports/lookup/XXXX")

    assert r.status_code == 404


def test_lookup_route_invalid_icao_returns_400(client, monkeypatch):
    """route surfaces DomainError(400) when icao format is invalid."""
    monkeypatch.setattr(settings, "openaip_api_key", "testkey")
    r = client.get("/api/v1/airports/lookup/XX")
    assert r.status_code == 400


def test_pick_matching_airport_logs_when_no_exact_match(caplog):
    """fallback path emits a warning so bad lookups can be diagnosed."""
    items = [{"icaoCode": "ZZZZ", "name": "wrong"}]

    with caplog.at_level("WARNING", logger="app.services.openaip_service"):
        result = openaip_service._pick_matching_airport(items, "LZIB")

    assert result is items[0]
    assert any("no exact icao match" in rec.message for rec in caplog.records)


def test_convert_altitude_limit_unknown_unit_returns_none(caplog):
    """unrecognized altitude unit yields None (safer than mis-scaling)."""
    with caplog.at_level("WARNING", logger="app.services.openaip_service"):
        v = openaip_service._convert_altitude_limit({"value": 1000, "unit": 99})

    assert v is None
    assert any("unrecognized altitude unit" in rec.message for rec in caplog.records)


def test_convert_length_unknown_unit_logs_warning(caplog):
    """unrecognized length unit falls back to meters but logs a warning."""
    with caplog.at_level("WARNING", logger="app.services.openaip_service"):
        v = openaip_service._convert_length(42, 99)

    assert v == 42.0
    assert any("unrecognized length unit" in rec.message for rec in caplog.records)


def test_parse_polygon_geometry_rejects_degenerate_three_point_ring():
    """a pre-closed 3-point ring has only 2 unique vertices and must be rejected."""
    geom = {
        "type": "Polygon",
        "coordinates": [[[0.0, 0.0], [1.0, 1.0], [0.0, 0.0]]],
    }
    assert openaip_service._parse_polygon_geometry(geom) is None


def test_parse_polygon_geometry_accepts_four_point_closed_ring():
    """a valid 4-point closed ring (triangle) parses correctly."""
    geom = {
        "type": "Polygon",
        "coordinates": [[[0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [0.0, 0.0]]],
    }
    parsed = openaip_service._parse_polygon_geometry(geom)
    assert parsed is not None
    ring = parsed.coordinates[0]
    assert len(ring) == 4
    assert ring[0] == ring[-1]
