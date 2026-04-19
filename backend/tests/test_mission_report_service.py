"""tests for mission report pdf generation service."""

import struct
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.core.exceptions import ConflictError, NotFoundError
from app.services import mission_report_service

_WKB_POINT_Z = 0x80000001
_WKB_POLYGON_Z = 0x80000003
_WKB_LINESTRING_Z = 0x80000002
_SRID = 4326


def _make_ewkb(lon: float, lat: float, alt: float) -> bytes:
    """build a minimal EWKB PointZ with SRID 4326."""
    return struct.pack("<BIIddd", 1, _WKB_POINT_Z | 0x20000000, _SRID, lon, lat, alt)


def _make_polygon_ewkb(coords: list[tuple[float, float, float]]) -> bytes:
    """build a minimal EWKB PolygonZ with SRID 4326."""
    buf = struct.pack("<BII", 1, _WKB_POLYGON_Z | 0x20000000, _SRID)
    buf += struct.pack("<I", 1)  # 1 ring
    buf += struct.pack("<I", len(coords))
    for lon, lat, alt in coords:
        buf += struct.pack("<ddd", lon, lat, alt)
    return buf


def _make_geom(data: bytes):
    """create a mock geometry object with data attribute."""
    g = MagicMock()
    g.data = data
    return g


def _make_waypoint(seq, lat=49.69, lon=18.11, alt=300.0, wp_type="TRANSIT", inspection_id=None):
    """create a mock waypoint."""
    wp = MagicMock()
    wp.sequence_order = seq
    wp.waypoint_type = wp_type
    wp.camera_action = "NONE"
    wp.speed = 5.0
    wp.heading = 90.0
    wp.hover_duration = None
    wp.inspection_id = inspection_id
    wp.gimbal_pitch = None
    wp.camera_target = None
    wp.position = _make_geom(_make_ewkb(lon, lat, alt))
    return wp


def _make_inspection(seq=0, method="FLY_OVER", template_name="Test Template"):
    """create a mock inspection."""
    insp = MagicMock()
    insp.id = uuid4()
    insp.sequence_order = seq
    insp.method = method
    insp.template = MagicMock()
    insp.template.name = template_name
    insp.template.default_config = None
    insp.config = MagicMock()
    insp.config.resolve_with_defaults.return_value = {
        "altitude_offset": 10.0,
        "measurement_speed_override": None,
        "measurement_density": 5,
        "capture_mode": "VIDEO_CAPTURE",
        "camera_gimbal_angle": -45.0,
        "sweep_angle": None,
        "vertical_profile_height": None,
        "horizontal_distance": 30.0,
        "buffer_distance": None,
        "recording_setup_duration": 3.0,
        "custom_tolerances": None,
        "hover_duration": 2.0,
        "height_above_lights": None,
        "lateral_offset": None,
        "distance_from_lha": None,
        "height_above_lha": None,
        "selected_lha_id": None,
        "hover_bearing": None,
        "hover_bearing_reference": None,
        "lha_ids": None,
    }
    return insp


def _make_constraint(ctype="ALTITUDE", name="Max Altitude", hard=True):
    """create a mock constraint."""
    c = MagicMock()
    c.id = uuid4()
    c.constraint_type = ctype
    c.name = name
    c.is_hard_constraint = hard
    c.max_altitude = 400.0
    c.min_altitude = None
    c.max_horizontal_speed = None
    c.max_vertical_speed = None
    c.max_flight_time = None
    c.reserve_margin = None
    c.lateral_buffer = None
    c.longitudinal_buffer = None
    c.boundary = None
    return c


def _make_violation(category="violation", message="test violation", constraint_id=None):
    """create a mock validation violation."""
    v = MagicMock()
    v.id = uuid4()
    v.category = category
    v.message = message
    v.constraint_id = constraint_id
    v.waypoint_ids = None
    return v


def _make_report_data(
    num_waypoints=5,
    num_inspections=1,
    with_validation=True,
    with_drone=True,
):
    """build a complete ReportData object for testing."""
    mission = MagicMock()
    mission.id = uuid4()
    mission.name = "Test Mission"
    mission.status = "VALIDATED"
    mission.default_speed = 5.0
    mission.default_altitude_offset = 10.0
    mission.default_capture_mode = "VIDEO_CAPTURE"
    mission.default_buffer_distance = 5.0
    mission.takeoff_coordinate = None
    mission.landing_coordinate = None

    airport = MagicMock()
    airport.id = uuid4()
    airport.name = "Test Airport"
    airport.icao_code = "LZTT"
    airport.elevation = 290.0
    airport.surfaces = []
    airport.safety_zones = []

    # add a runway surface
    runway = MagicMock()
    runway.surface_type = "RUNWAY"
    runway.identifier = "09L"
    runway.boundary = _make_geom(
        _make_polygon_ewkb(
            [
                (18.10, 49.68, 290),
                (18.12, 49.68, 290),
                (18.12, 49.70, 290),
                (18.10, 49.70, 290),
                (18.10, 49.68, 290),
            ]
        )
    )
    runway.threshold_position = _make_geom(_make_ewkb(18.10, 49.68, 290))
    airport.surfaces.append(runway)

    flight_plan = MagicMock()
    flight_plan.id = uuid4()
    flight_plan.mission_id = mission.id
    flight_plan.total_distance = 1500.0
    flight_plan.estimated_duration = 300.0
    flight_plan.generated_at = None

    inspections = []
    for i in range(num_inspections):
        insp = _make_inspection(seq=i, template_name=f"Inspection {i + 1}")
        inspections.append(insp)

    waypoints = []
    for i in range(num_waypoints):
        if i == 0:
            wp_type = "TAKEOFF"
        elif i == num_waypoints - 1:
            wp_type = "LANDING"
        elif inspections:
            wp_type = "MEASUREMENT"
        else:
            wp_type = "TRANSIT"

        insp_id = inspections[0].id if inspections and wp_type == "MEASUREMENT" else None
        wp = _make_waypoint(
            seq=i,
            lat=49.69 + i * 0.001,
            lon=18.11 + i * 0.001,
            alt=300.0 + i * 5,
            wp_type=wp_type,
            inspection_id=insp_id,
        )
        waypoints.append(wp)

    drone_profile = None
    if with_drone:
        drone_profile = MagicMock()
        drone_profile.name = "DJI M30T"
        drone_profile.manufacturer = "DJI"
        drone_profile.model = "Matrice 30T"
        drone_profile.endurance_minutes = 40.0
        drone_profile.sensor_fov = 84.0
        drone_profile.camera_resolution = "4K"
        drone_profile.camera_frame_rate = 30

    validation_result = None
    violations = []
    if with_validation:
        validation_result = MagicMock()
        validation_result.id = uuid4()
        validation_result.passed = True
        validation_result.violations = []
        violations = []

    constraints = [_make_constraint()]

    return mission_report_service.ReportData(
        mission=mission,
        flight_plan=flight_plan,
        airport=airport,
        drone_profile=drone_profile,
        waypoints=waypoints,
        inspections=inspections,
        validation_result=validation_result,
        violations=violations,
        constraints=constraints,
    )


class TestGenerateMissionReport:
    """tests for the mission report pdf generation."""

    @patch.object(mission_report_service, "_load_report_data")
    def test_generates_valid_pdf(self, mock_load):
        """generated output is a valid pdf."""
        data = _make_report_data()
        mock_load.return_value = data

        pdf_bytes, filename = mission_report_service.generate_mission_report(MagicMock(), uuid4())

        assert pdf_bytes[:5] == b"%PDF-"
        assert len(pdf_bytes) > 1000

    @patch.object(mission_report_service, "_load_report_data")
    def test_filename_format(self, mock_load):
        """filename follows the required pattern."""
        data = _make_report_data()
        mock_load.return_value = data

        _, filename = mission_report_service.generate_mission_report(MagicMock(), uuid4())

        assert filename.startswith("MissionReport_LZTT_Test_Mission_")
        assert filename.endswith(".pdf")

    @patch.object(mission_report_service, "_load_report_data")
    def test_multiple_inspections(self, mock_load):
        """pdf generates successfully with multiple inspections."""
        data = _make_report_data(num_inspections=3, num_waypoints=10)
        mock_load.return_value = data

        pdf_bytes, _ = mission_report_service.generate_mission_report(MagicMock(), uuid4())

        assert pdf_bytes[:5] == b"%PDF-"

    @patch.object(mission_report_service, "_load_report_data")
    def test_no_inspections(self, mock_load):
        """pdf generates with zero inspections."""
        data = _make_report_data(num_inspections=0, num_waypoints=3)
        mock_load.return_value = data

        pdf_bytes, _ = mission_report_service.generate_mission_report(MagicMock(), uuid4())

        assert pdf_bytes[:5] == b"%PDF-"

    @patch.object(mission_report_service, "_load_report_data")
    def test_no_drone_profile(self, mock_load):
        """pdf generates without drone profile."""
        data = _make_report_data(with_drone=False)
        mock_load.return_value = data

        pdf_bytes, _ = mission_report_service.generate_mission_report(MagicMock(), uuid4())

        assert pdf_bytes[:5] == b"%PDF-"

    @patch.object(mission_report_service, "_load_report_data")
    def test_with_violations(self, mock_load):
        """pdf generates with validation violations."""
        data = _make_report_data()
        data.validation_result.passed = False
        v1 = _make_violation("violation", "altitude exceeded")
        v2 = _make_violation("warning", "speed close to limit")
        data.violations = [v1, v2]
        data.validation_result.violations = [v1, v2]
        mock_load.return_value = data

        pdf_bytes, _ = mission_report_service.generate_mission_report(MagicMock(), uuid4())

        assert pdf_bytes[:5] == b"%PDF-"

    @patch.object(mission_report_service, "_load_report_data")
    def test_no_validation(self, mock_load):
        """pdf generates without validation results."""
        data = _make_report_data(with_validation=False)
        mock_load.return_value = data

        pdf_bytes, _ = mission_report_service.generate_mission_report(MagicMock(), uuid4())

        assert pdf_bytes[:5] == b"%PDF-"


class TestLoadReportData:
    """tests for data loading and error handling."""

    def test_mission_not_found_raises_404(self):
        """raises NotFoundError when mission does not exist."""
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.first.return_value = None

        with pytest.raises(NotFoundError, match="mission not found"):
            mission_report_service._load_report_data(db, uuid4())

    def test_no_flight_plan_raises_409(self):
        """raises ConflictError when no flight plan exists."""
        db = MagicMock()
        mission = MagicMock()
        mission.airport_id = uuid4()
        mission.drone_profile_id = None
        mission.inspections = []

        query_mock = MagicMock()
        results = [mission, None]

        def side_effect(*args, **kwargs):
            """return mock for sequential query calls."""
            return query_mock

        db.query.side_effect = side_effect
        query_mock.options.return_value.filter.return_value.first.side_effect = results

        with pytest.raises(ConflictError, match="no flight plan"):
            mission_report_service._load_report_data(db, uuid4())


class TestHelpers:
    """tests for helper functions."""

    def test_sanitize_filename(self):
        """special characters are removed, spaces become underscores."""
        assert mission_report_service._sanitize_filename("Test Mission!@#") == "Test_Mission"
        assert mission_report_service._sanitize_filename("hello world") == "hello_world"
        assert mission_report_service._sanitize_filename("a/b/c") == "abc"

    def test_format_duration(self):
        """durations are formatted correctly."""
        assert mission_report_service._format_duration(None) == "N/A"
        assert mission_report_service._format_duration(0) == "N/A"
        assert mission_report_service._format_duration(30) == "30s"
        assert mission_report_service._format_duration(90) == "1m 30s"
        assert mission_report_service._format_duration(3600) == "60m 0s"

    def test_format_distance(self):
        """distances are formatted correctly."""
        assert mission_report_service._format_distance(None) == "N/A"
        assert mission_report_service._format_distance(0) == "N/A"
        assert mission_report_service._format_distance(500) == "500.0 m"
        assert mission_report_service._format_distance(1500) == "1.50 km"

    def test_haversine(self):
        """distance_between (replaced _haversine) returns reasonable distances."""
        from app.utils.geo import distance_between

        dist = distance_between(18.11, 49.69, 18.12, 49.69)
        assert 500 < dist < 1000

    def test_point_in_polygon(self):
        """point-in-polygon test works correctly."""
        poly = [(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)]
        assert mission_report_service._point_in_polygon(5, 5, poly) is True
        assert mission_report_service._point_in_polygon(15, 5, poly) is False

    def test_extract_coords(self):
        """coordinate extraction from ewkb works."""
        geom = _make_geom(_make_ewkb(18.11, 49.69, 300.0))
        lon, lat, alt = mission_report_service._extract_coords(geom)
        assert abs(lon - 18.11) < 0.001
        assert abs(lat - 49.69) < 0.001
        assert abs(alt - 300.0) < 0.1

    def test_extract_coords_none(self):
        """none geometry returns zeros."""
        lon, lat, alt = mission_report_service._extract_coords(None)
        assert lon == 0.0
        assert lat == 0.0
        assert alt == 0.0

    def test_point_near_polygon_near_midpoint(self):
        """point close to edge midpoint is detected."""
        poly = [(0, 0), (0.01, 0), (0.01, 0.01), (0, 0.01), (0, 0)]
        assert mission_report_service._point_near_polygon(0.005, 0.0001, poly, 50) is True

    def test_point_near_polygon_near_endpoint(self):
        """point near edge endpoint - not just midpoint - is detected."""
        poly = [(0, 0), (0.1, 0), (0.1, 0.1), (0, 0.1), (0, 0)]
        assert mission_report_service._point_near_polygon(0.0001, 0.0001, poly, 50) is True

    def test_point_near_polygon_far_away(self):
        """point far from all edges returns false."""
        poly = [(0, 0), (0.001, 0), (0.001, 0.001), (0, 0.001), (0, 0)]
        assert mission_report_service._point_near_polygon(1.0, 1.0, poly, 50) is False


class TestBuildActivities:
    """tests for the timeline activity builder."""

    def test_basic_activity_sequence(self):
        """activities are built with correct names and colors."""
        data = _make_report_data(num_waypoints=5, num_inspections=1)
        activities = mission_report_service._build_activities(data)

        names = [a["name"] for a in activities]
        assert "Takeoff" in names
        assert "Landing" in names

    def test_activity_colors_match_type(self):
        """each activity gets the correct color for its type."""
        data = _make_report_data(num_waypoints=5, num_inspections=1)
        activities = mission_report_service._build_activities(data)

        for act in activities:
            if act["name"] == "Takeoff":
                assert act["color"] == "#3bbb3b"
            elif act["name"] == "Landing":
                assert act["color"] == "#e54545"
            elif act["name"] == "Transit":
                assert act["color"] == "#888888"

    def test_no_zero_duration_activities(self):
        """all returned activities have positive duration."""
        data = _make_report_data(num_waypoints=10, num_inspections=2)
        activities = mission_report_service._build_activities(data)

        for act in activities:
            assert act["duration"] > 0

    def test_empty_waypoints(self):
        """empty waypoint list produces no activities."""
        data = _make_report_data(num_waypoints=0, num_inspections=0)
        data.waypoints = []
        activities = mission_report_service._build_activities(data)

        assert activities == []


class TestRouteEndpoint:
    """tests for the mission report route."""

    @patch("app.api.routes.missions.mission_service.get_mission")
    @patch.object(mission_report_service, "generate_mission_report")
    def test_get_mission_report_returns_pdf(self, mock_gen, mock_get_mission):
        """endpoint returns pdf with correct content type."""
        from types import SimpleNamespace

        from fastapi.testclient import TestClient

        from app.api.dependencies import get_current_user
        from app.main import app

        stub_user = SimpleNamespace(
            id="00000000-0000-0000-0000-000000000099",
            email="test@tarmacview.com",
            name="Test User",
            role="SUPER_ADMIN",
            is_active=True,
            airports=[],
        )
        stub_user.has_airport_access = lambda airport_id: True

        fake_id = str(uuid4())
        stub_mission = SimpleNamespace(airport_id=uuid4())
        mock_get_mission.return_value = stub_mission
        mock_gen.return_value = (b"%PDF-1.4 fake", "MissionReport_LZTT_Test_2026-04-17.pdf")

        saved = app.dependency_overrides.get(get_current_user)
        app.dependency_overrides[get_current_user] = lambda: stub_user
        try:
            client = TestClient(app)
            resp = client.get(f"/api/v1/missions/{fake_id}/mission-report")
        finally:
            if saved is not None:
                app.dependency_overrides[get_current_user] = saved
            else:
                app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert "MissionReport_LZTT_Test" in resp.headers["content-disposition"]
        assert resp.content == b"%PDF-1.4 fake"
