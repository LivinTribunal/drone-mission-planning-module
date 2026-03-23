"""tests for export service file generators"""

import json
import zipfile
from io import BytesIO
from unittest.mock import MagicMock
from uuid import uuid4

from shapely.geometry import Point

from app.services import export_service


def _make_waypoint(seq, lat=49.69, lon=18.11, alt=300.0, wp_type="TRANSIT"):
    """create a mock waypoint with postgis-like geometry."""
    wp = MagicMock()
    wp.sequence_order = seq
    wp.waypoint_type = wp_type
    wp.camera_action = "NONE"
    wp.speed = 5.0
    wp.heading = 90.0
    wp.hover_duration = None
    wp.inspection_id = None
    wp.camera_target = None
    wp.gimbal_pitch = None

    # mock postgis geometry - to_shape returns a shapely Point
    point = Point(lon, lat, alt)
    wp.position = MagicMock()
    wp.position.desc = point

    return wp, point


def _make_flight_plan(num_waypoints=3):
    """create a mock flight plan with waypoints."""
    fp = MagicMock()
    fp.mission_id = uuid4()
    fp.total_distance = 150.5
    fp.estimated_duration = 120.0
    fp.generated_at = None

    waypoints = []
    for i in range(num_waypoints):
        if i == 0:
            wp_type = "TAKEOFF"
        elif i == num_waypoints - 1:
            wp_type = "LANDING"
        else:
            wp_type = "MEASUREMENT"

        wp, _ = _make_waypoint(
            seq=i,
            lat=49.69 + i * 0.001,
            lon=18.11 + i * 0.001,
            alt=300.0 + i * 10,
            wp_type=wp_type,
        )
        waypoints.append(wp)

    fp.waypoints = waypoints
    return fp


def _patch_to_shape(monkeypatch):
    """patch to_shape to work with our mock geometry objects."""

    def mock_to_shape(geom):
        """return the shapely point stored on the mock."""
        return geom.desc

    monkeypatch.setattr("app.services.export_service.to_shape", mock_to_shape)


class TestGenerateKml:
    """tests for kml export generation."""

    def test_generates_valid_kml(self, monkeypatch):
        """kml output contains xml declaration and kml elements."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(3)

        result = export_service.generate_kml(fp)
        text = result.decode("utf-8")

        assert "<?xml" in text
        assert "<kml" in text
        assert "WP0" in text
        assert "WP1" in text
        assert "WP2" in text
        assert "<LineString" in text

    def test_single_waypoint_no_linestring(self, monkeypatch):
        """single waypoint should not produce a linestring."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(1)

        result = export_service.generate_kml(fp)
        text = result.decode("utf-8")

        assert "WP0" in text
        assert "<LineString" not in text

    def test_waypoint_descriptions(self, monkeypatch):
        """waypoint descriptions include type and camera action."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(2)

        result = export_service.generate_kml(fp)
        text = result.decode("utf-8")

        assert "TAKEOFF" in text
        assert "LANDING" in text


class TestGenerateKmz:
    """tests for kmz export generation."""

    def test_produces_valid_zip(self, monkeypatch):
        """kmz is a valid zip file containing doc.kml."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(3)

        result = export_service.generate_kmz(fp)
        buf = BytesIO(result)

        assert zipfile.is_zipfile(buf)
        with zipfile.ZipFile(buf) as zf:
            assert "doc.kml" in zf.namelist()
            kml_content = zf.read("doc.kml").decode("utf-8")
            assert "<kml" in kml_content


class TestGenerateJson:
    """tests for json export generation."""

    def test_valid_json_structure(self, monkeypatch):
        """json output has correct top-level keys and waypoint structure."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(3)

        result = export_service.generate_json(fp)
        data = json.loads(result)

        assert "mission_id" in data
        assert "waypoints" in data
        assert "total_distance" in data
        assert "estimated_duration" in data
        assert len(data["waypoints"]) == 3

    def test_waypoint_fields(self, monkeypatch):
        """each waypoint has all required fields."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(2)

        result = export_service.generate_json(fp)
        data = json.loads(result)
        wp = data["waypoints"][0]

        assert "sequence_order" in wp
        assert "latitude" in wp
        assert "longitude" in wp
        assert "altitude" in wp
        assert "speed" in wp
        assert "heading" in wp
        assert "camera_action" in wp
        assert "waypoint_type" in wp
        assert "camera_target" in wp
        assert "inspection_id" in wp

    def test_coordinates_correct(self, monkeypatch):
        """coordinates are extracted correctly from geometry."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(1)

        result = export_service.generate_json(fp)
        data = json.loads(result)
        wp = data["waypoints"][0]

        assert wp["latitude"] == 49.69
        assert wp["longitude"] == 18.11
        assert wp["altitude"] == 300.0

    def test_camera_target_included(self, monkeypatch):
        """camera target coordinates serialized when present."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(1)

        target_point = Point(18.12, 49.70, 280.0)
        target_mock = MagicMock()
        target_mock.desc = target_point
        fp.waypoints[0].camera_target = target_mock

        result = export_service.generate_json(fp)
        data = json.loads(result)
        ct = data["waypoints"][0]["camera_target"]

        assert ct is not None
        assert ct["latitude"] == 49.70
        assert ct["longitude"] == 18.12
        assert ct["altitude"] == 280.0


class TestGenerateMavlink:
    """tests for mavlink wpl 110 export generation."""

    def test_header_line(self, monkeypatch):
        """output starts with qgc wpl 110 header."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(3)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        assert lines[0] == "QGC WPL 110"

    def test_waypoint_count(self, monkeypatch):
        """correct number of waypoint lines generated."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(3)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        # header + 3 waypoints
        assert len(lines) == 4

    def test_first_waypoint_current(self, monkeypatch):
        """first waypoint has current=1, others current=0."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(3)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        fields_0 = lines[1].split("\t")
        fields_1 = lines[2].split("\t")

        assert fields_0[1] == "1"
        assert fields_1[1] == "0"

    def test_takeoff_command(self, monkeypatch):
        """takeoff waypoint uses nav_takeoff command (22)."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(3)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        fields = lines[1].split("\t")
        assert fields[3] == "22"

    def test_landing_command(self, monkeypatch):
        """landing waypoint uses nav_land command (21)."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(3)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        fields = lines[3].split("\t")
        assert fields[3] == "21"

    def test_measurement_command(self, monkeypatch):
        """measurement waypoint uses nav_waypoint command (16)."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(3)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        fields = lines[2].split("\t")
        assert fields[3] == "16"

    def test_coordinates_in_output(self, monkeypatch):
        """lat/lon/alt appear in correct positions."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(1)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        fields = lines[1].split("\t")
        assert float(fields[8]) == 49.69
        assert float(fields[9]) == 18.11
        assert float(fields[10]) == 300.0

    def test_autocontinue_set(self, monkeypatch):
        """autocontinue flag is 1 for all waypoints."""
        _patch_to_shape(monkeypatch)
        fp = _make_flight_plan(3)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        for line in lines[1:]:
            fields = line.split("\t")
            assert fields[11] == "1"
