"""tests for export service file generators"""

import json
import struct
import zipfile
from io import BytesIO
from unittest.mock import MagicMock
from uuid import uuid4

from app.services import export_service

# WKB constants for building mock geometry
_WKB_POINT_Z = 0x80000001
_SRID = 4326


def _make_ewkb(lon: float, lat: float, alt: float) -> bytes:
    """build a minimal EWKB PointZ with SRID 4326."""
    return struct.pack("<BIIddd", 1, _WKB_POINT_Z | 0x20000000, _SRID, lon, lat, alt)


def _make_waypoint(seq, lat=49.69, lon=18.11, alt=300.0, wp_type="TRANSIT"):
    """create a mock waypoint with ewkb geometry."""
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

    wp.position = MagicMock()
    wp.position.data = _make_ewkb(lon, lat, alt)

    return wp


def _make_flight_plan(num_waypoints=3):
    """create a mock flight plan with waypoints."""
    fp = MagicMock()
    fp.mission_id = uuid4()
    fp.airport_id = uuid4()
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

        wp = _make_waypoint(
            seq=i,
            lat=49.69 + i * 0.001,
            lon=18.11 + i * 0.001,
            alt=300.0 + i * 10,
            wp_type=wp_type,
        )
        waypoints.append(wp)

    fp.waypoints = waypoints
    return fp


class TestGenerateKml:
    """tests for kml export generation."""

    def test_generates_valid_kml(self):
        """kml output contains xml declaration and kml elements."""
        fp = _make_flight_plan(3)

        result = export_service.generate_kml(fp, "Test Mission", 290.0)
        text = result.decode("utf-8")

        assert "<?xml" in text
        assert "<kml" in text
        assert "WP0" in text
        assert "WP1" in text
        assert "WP2" in text
        assert "<LineString" in text

    def test_mission_name_in_document(self):
        """kml document name includes mission name."""
        fp = _make_flight_plan(1)

        result = export_service.generate_kml(fp, "My Mission", 0)
        text = result.decode("utf-8")

        assert "Flight Plan - My Mission" in text

    def test_altitude_is_agl(self):
        """exported altitude is relative to ground, not absolute MSL."""
        fp = _make_flight_plan(1)

        result = export_service.generate_kml(fp, "Test", 290.0)
        text = result.decode("utf-8")

        # alt=300 - elevation=290 = 10m AGL
        assert "10.0" in text
        assert "relativeToGround" in text

    def test_single_waypoint_no_linestring(self):
        """single waypoint should not produce a linestring."""
        fp = _make_flight_plan(1)

        result = export_service.generate_kml(fp, "", 0)
        text = result.decode("utf-8")

        assert "WP0" in text
        assert "<LineString" not in text


class TestGenerateKmz:
    """tests for kmz export generation."""

    def test_produces_valid_zip(self):
        """kmz is a valid zip file containing doc.kml."""
        fp = _make_flight_plan(3)

        result = export_service.generate_kmz(fp, "Test", 0)
        buf = BytesIO(result)

        assert zipfile.is_zipfile(buf)
        with zipfile.ZipFile(buf) as zf:
            assert "doc.kml" in zf.namelist()
            kml_content = zf.read("doc.kml").decode("utf-8")
            assert "<kml" in kml_content


class TestGenerateJson:
    """tests for json export generation."""

    def test_valid_json_structure(self):
        """json output has correct top-level keys and waypoint structure."""
        fp = _make_flight_plan(3)

        result = export_service.generate_json(fp, "Test Mission", 290.0)
        data = json.loads(result)

        assert data["version"] == "1.0.0+0"
        assert data["mission_name"] == "Test Mission"
        assert "mission_id" in data
        assert "waypoints" in data
        assert "total_distance" in data
        assert "estimated_duration" in data
        assert data["airport_elevation"] == 290.0
        assert len(data["waypoints"]) == 3

    def test_version_field_is_first_key(self):
        """version field appears first in json output - ugcs reads it before parsing."""
        fp = _make_flight_plan(2)

        result = export_service.generate_json(fp, "Test", 0)
        data = json.loads(result)

        assert list(data.keys())[0] == "version"

    def test_version_field_with_empty_waypoints(self):
        """version field present even with zero waypoints."""
        fp = _make_flight_plan(0)

        result = export_service.generate_json(fp, "", 0)
        data = json.loads(result)

        assert data["version"] == "1.0.0+0"
        assert data["waypoints"] == []

    def test_waypoint_fields(self):
        """each waypoint has all required fields."""
        fp = _make_flight_plan(2)

        result = export_service.generate_json(fp, "", 0)
        data = json.loads(result)
        wp = data["waypoints"][0]

        assert "sequence_order" in wp
        assert "latitude" in wp
        assert "longitude" in wp
        assert "altitude_msl" in wp
        assert "altitude_agl" in wp
        assert "speed" in wp
        assert "heading" in wp

    def test_agl_altitude_correct(self):
        """agl altitude is msl minus airport elevation."""
        fp = _make_flight_plan(1)

        result = export_service.generate_json(fp, "", 290.0)
        data = json.loads(result)
        wp = data["waypoints"][0]

        assert wp["altitude_msl"] == 300.0
        assert wp["altitude_agl"] == 10.0


class TestGenerateMavlink:
    """tests for mavlink wpl 110 export generation."""

    def test_header_line(self):
        """output starts with qgc wpl 110 header."""
        fp = _make_flight_plan(3)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        assert lines[0] == "QGC WPL 110"

    def test_waypoint_count(self):
        """correct number of waypoint lines generated."""
        fp = _make_flight_plan(3)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        assert len(lines) == 4

    def test_first_waypoint_current(self):
        """first waypoint has current=1, others current=0."""
        fp = _make_flight_plan(3)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        fields_0 = lines[1].split("\t")
        fields_1 = lines[2].split("\t")

        assert fields_0[1] == "1"
        assert fields_1[1] == "0"

    def test_takeoff_command(self):
        """takeoff waypoint uses nav_takeoff command (22)."""
        fp = _make_flight_plan(3)

        result = export_service.generate_mavlink(fp)
        lines = result.decode("utf-8").split("\n")

        fields = lines[1].split("\t")
        assert fields[3] == "22"

    def test_mavlink_uses_agl_altitude(self):
        """mavlink altitude is relative to ground."""
        fp = _make_flight_plan(1)

        result = export_service.generate_mavlink(fp, "", 290.0)
        lines = result.decode("utf-8").split("\n")

        fields = lines[1].split("\t")
        assert float(fields[10]) == 10.0


class TestSanitizeFilename:
    """tests for filename sanitization."""

    def test_strips_path_separators(self):
        """path separators are removed to prevent zip slip."""
        assert export_service._sanitize_filename("../../evil") == "evil"

    def test_strips_backslashes(self):
        """backslashes are removed."""
        assert export_service._sanitize_filename("..\\..\\evil") == "evil"

    def test_strips_quotes_and_newlines(self):
        """quotes and newlines are removed."""
        assert export_service._sanitize_filename('my"mission\r\n') == "mymission"

    def test_normal_name_unchanged(self):
        """normal mission names pass through unchanged."""
        assert export_service._sanitize_filename("Test Mission 1") == "Test Mission 1"

    def test_strips_null_bytes(self):
        """null bytes and control characters are removed."""
        assert export_service._sanitize_filename("mis\x00sion\x01test\x7f") == "missiontest"

    def test_strips_dotdot_slash_variant(self):
        """combined dotdot and slash variants are stripped."""
        assert export_service._sanitize_filename("....//evil") == "evil"


class TestExportMissionFormats:
    """tests for export_mission format validation."""

    def test_invalid_format_raises_domain_error(self):
        """unknown format string raises DomainError 422 before any db mutation."""
        from app.core.exceptions import DomainError

        db = MagicMock()
        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "test"
        db.query.return_value.filter.return_value.first.return_value = mission

        fp = _make_flight_plan(1)
        fp.airport_id = uuid4()

        airport = MagicMock()
        airport.elevation = 100.0

        # first query().filter().first() -> mission
        # second query().options().filter().first() -> flight_plan
        # third query().filter().first() -> airport
        def query_side_effect(model):
            """route db.query to the right mock based on model."""
            mock_chain = MagicMock()
            if model.__name__ == "Mission":
                mock_chain.filter.return_value.first.return_value = mission
            elif model.__name__ == "FlightPlan":
                mock_chain.options.return_value.filter.return_value.first.return_value = fp
            elif model.__name__ == "Airport":
                mock_chain.filter.return_value.first.return_value = airport
            return mock_chain

        db.query.side_effect = query_side_effect

        import pytest

        with pytest.raises(DomainError) as exc_info:
            export_service.export_mission(db, uuid4(), ["INVALID"])
        assert exc_info.value.status_code == 422
        db.commit.assert_not_called()

    def test_valid_format_exports_and_commits(self):
        """successful export transitions status, commits, and returns files."""
        db = MagicMock()
        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "Test Mission"

        fp = _make_flight_plan(2)
        fp.airport_id = uuid4()

        airport = MagicMock()
        airport.elevation = 100.0

        def query_side_effect(model):
            """route db.query to the right mock based on model."""
            mock_chain = MagicMock()
            if model.__name__ == "Mission":
                mock_chain.filter.return_value.first.return_value = mission
            elif model.__name__ == "FlightPlan":
                mock_chain.options.return_value.filter.return_value.first.return_value = fp
            elif model.__name__ == "Airport":
                mock_chain.filter.return_value.first.return_value = airport
            return mock_chain

        db.query.side_effect = query_side_effect

        files, safe_name = export_service.export_mission(db, uuid4(), ["JSON"])

        assert safe_name == "Test Mission"
        assert len(files) == 1
        filename = list(files.keys())[0]
        assert filename == "mission_Test Mission.json"
        content, content_type = files[filename]
        assert content_type == "application/json"
        assert len(content) > 0
        mission.transition_to.assert_called_once_with("EXPORTED")
        db.commit.assert_called_once()
