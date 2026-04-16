"""tests for export service file generators"""

import json
import math
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


def _read_wpmz(result: bytes) -> tuple[str, str]:
    """unzip a generated kmz and return (template.kml, waylines.wpml) as text."""
    with zipfile.ZipFile(BytesIO(result)) as zf:
        template = zf.read("wpmz/template.kml").decode("utf-8")
        waylines = zf.read("wpmz/waylines.wpml").decode("utf-8")
    return template, waylines


class TestGenerateKmz:
    """tests for dji wpmz 1.0.6 (kmz) export generation."""

    def test_produces_dji_wpmz_archive_layout(self):
        """kmz is a valid zip with wpmz/template.kml + wpmz/waylines.wpml."""
        fp = _make_flight_plan(3)

        result = export_service.generate_kmz(fp, "Test", 0)
        buf = BytesIO(result)

        assert zipfile.is_zipfile(buf)
        with zipfile.ZipFile(buf) as zf:
            assert set(zf.namelist()) == {"wpmz/template.kml", "wpmz/waylines.wpml"}

    def test_declares_wpmz_1_0_6_namespace(self):
        """both files declare kml 2.2 and dji wpmz 1.0.6."""
        fp = _make_flight_plan(2)

        template, waylines = _read_wpmz(export_service.generate_kmz(fp, "Test", 0))

        for content in (template, waylines):
            assert "http://www.opengis.net/kml/2.2" in content
            assert "http://www.dji.com/wpmz/1.0.6" in content
            assert "1.0.2" not in content

    def test_waylines_folder_uses_relative_to_start_point(self):
        """waylines folder declares executeHeightMode=relativeToStartPoint.

        fh2 then anchors waypoints against the takeoff's screen position and
        offsets each by its AGL value - this avoids dependence on fh2's dem,
        which is unreliable for non-commercial airports. absolute-altitude
        modes (WGS84, EGM96) render routes under ground or floating above it
        depending on the dem quality at that coordinate.
        """
        fp = _make_flight_plan(2)

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "Test", 0))

        assert "<wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>" in waylines
        assert "<wpml:realTimeFollowSurfaceByFov>0</wpml:realTimeFollowSurfaceByFov>" in waylines

    def test_template_folder_uses_egm96_height_mode(self):
        """template folder declares heightMode=EGM96 so msl-like values are honored."""
        fp = _make_flight_plan(1)

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "Test", 0))

        assert "<wpml:heightMode>EGM96</wpml:heightMode>" in template
        assert "<wpml:coordinateMode>WGS84</wpml:coordinateMode>" in template
        # positioningType was non-standard and must not be emitted
        assert "positioningType" not in template

    def test_waylines_has_one_placemark_per_waypoint(self):
        """every waypoint produces a placemark in waylines.wpml."""
        fp = _make_flight_plan(4)

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "Test", 0))

        assert waylines.count("<Placemark") == 4

    def test_execute_height_is_agl(self):
        """waylines executeHeight is AGL (msl minus airport_elevation).

        paired with executeHeightMode=relativeToStartPoint so fh2 offsets
        each waypoint by this AGL from the takeoff anchor.
        """
        fp = _make_flight_plan(1)

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "Test", 290.0))

        # msl 300 - airport_elevation 290 = 10m AGL
        assert "<wpml:executeHeight>10.000000</wpml:executeHeight>" in waylines

    def test_template_placemark_height_slots_match_msl(self):
        """template ellipsoidHeight + height both carry the same msl value.

        per the dji schema ellipsoidHeight is nominally HAE, but fh2 anchors
        its ground reference to takeOffRefPoint (which we also write in msl),
        so writing msl consistently positions waypoints against the same datum
        and avoids the +44 m geoid drift we saw when ellipsoidHeight was HAE.
        """
        fp = _make_flight_plan(1)

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "Test", 290.0))

        assert "<wpml:ellipsoidHeight>300.000000</wpml:ellipsoidHeight>" in template
        assert "<wpml:height>300.000000</wpml:height>" in template

    def test_placemark_has_use_global_flags(self):
        """template placemarks carry useGlobal* flags; waylines do not (matches dji sample)."""
        fp = _make_flight_plan(1)

        template, waylines = _read_wpmz(export_service.generate_kmz(fp, "Test", 0))

        assert "<wpml:useGlobalSpeed>1</wpml:useGlobalSpeed>" in template
        assert "<wpml:useGlobalHeadingParam>1</wpml:useGlobalHeadingParam>" in template
        assert "<wpml:useGlobalTurnParam>1</wpml:useGlobalTurnParam>" in template
        assert "<wpml:useStraightLine>1</wpml:useStraightLine>" in template
        assert "<wpml:useStraightLine>1</wpml:useStraightLine>" in waylines
        assert "useGlobalHeadingParam" not in waylines

    def test_placemark_includes_isRisky_and_turn_damping(self):
        """placemarks carry isRisky=0 and turnDampingDist=0.2."""
        fp = _make_flight_plan(1)

        template, waylines = _read_wpmz(export_service.generate_kmz(fp, "Test", 0))

        for content in (template, waylines):
            assert "<wpml:isRisky>0</wpml:isRisky>" in content
            assert "<wpml:waypointTurnDampingDist>0.2</wpml:waypointTurnDampingDist>" in content

    def test_waylines_placemark_has_gimbal_and_work_type(self):
        """waylines placemark has waypointGimbalHeadingParam and waypointWorkType."""
        fp = _make_flight_plan(1)

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "Test", 0))

        assert "<wpml:waypointGimbalHeadingParam>" in waylines
        assert "<wpml:waypointGimbalPitchAngle>" in waylines
        assert "<wpml:waypointWorkType>0</wpml:waypointWorkType>" in waylines

    def test_mission_config_has_rc_lost_and_rth(self):
        """missionConfig carries goContinue/goBack and globalRTHHeight=100."""
        fp = _make_flight_plan(1)

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "Test", 0))

        assert "<wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>" in template
        assert "<wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>" in template
        assert "<wpml:globalRTHHeight>100</wpml:globalRTHHeight>" in template
        assert "<wpml:waylineAvoidLimitAreaMode>0</wpml:waylineAvoidLimitAreaMode>" in template

    def test_take_off_ref_point_from_mission(self):
        """takeOffRefPoint is derived from mission.takeoff_coordinate (msl value)."""
        fp = _make_flight_plan(1)
        mission = MagicMock()
        mission.takeoff_coordinate = MagicMock()
        mission.takeoff_coordinate.data = _make_ewkb(17.123456, 48.987654, 175.5)

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "Test", 0, mission=mission))

        expected = "<wpml:takeOffRefPoint>48.987654,17.123456,175.500000</wpml:takeOffRefPoint>"
        assert expected in template
        assert "<wpml:takeOffRefPointAGLHeight>0</wpml:takeOffRefPointAGLHeight>" in template

    def test_take_off_ref_point_falls_back_to_first_waypoint(self):
        """takeOffRefPoint falls back to the first waypoint's msl altitude."""
        fp = _make_flight_plan(2)

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        # first waypoint default msl 300
        expected = "<wpml:takeOffRefPoint>49.690000,18.110000,300.000000</wpml:takeOffRefPoint>"
        assert expected in template

    def test_camera_action_maps_to_dji_actuator_func(self):
        """photo_capture waypoint produces a takePhoto action inside an actionGroup."""
        fp = _make_flight_plan(3)
        fp.waypoints[1].camera_action = "PHOTO_CAPTURE"

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "wpml:actionGroup" in waylines
        assert "takePhoto" in waylines
        assert "wpml:actionTriggerType>reachPoint" in waylines

    def test_hover_duration_produces_hover_action(self):
        """waypoint with hover_duration > 0 emits a hover action with hoverTime."""
        fp = _make_flight_plan(2)
        fp.waypoints[0].hover_duration = 4.5

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "<wpml:actionActuatorFunc>hover</wpml:actionActuatorFunc>" in waylines
        assert "<wpml:hoverTime>4.5</wpml:hoverTime>" in waylines

    def test_heading_emits_rotate_yaw_action(self):
        """waypoint with heading emits rotateYaw so the aircraft aims correctly."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].heading = 137.5

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "<wpml:actionActuatorFunc>rotateYaw</wpml:actionActuatorFunc>" in waylines
        assert "<wpml:aircraftHeading>137.5</wpml:aircraftHeading>" in waylines

    def test_gimbal_pitch_emits_gimbal_rotate_action(self):
        """waypoint with gimbal_pitch emits gimbalRotate so the camera aims correctly."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].gimbal_pitch = -45.0

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "<wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>" in waylines
        assert "<wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>" in waylines
        assert "<wpml:gimbalPitchRotateAngle>-45</wpml:gimbalPitchRotateAngle>" in waylines

    def test_payload_param_block_present(self):
        """template folder has the trailing payloadParam block required by fh2."""
        fp = _make_flight_plan(1)

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "<wpml:payloadParam>" in template
        assert "<wpml:focusMode>firstPoint</wpml:focusMode>" in template
        assert "<wpml:imageFormat>visable</wpml:imageFormat>" in template
        assert "<wpml:photoSize>default_l</wpml:photoSize>" in template

    def test_drone_profile_overrides_default_enums(self):
        """drone profile lookup overrides the m30t fallback enums."""
        fp = _make_flight_plan(1)
        profile = MagicMock()
        profile.model_identifier = None
        profile.manufacturer = "DJI"
        profile.model = "M350 RTK"

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0, drone_profile=profile))

        assert "<wpml:droneEnumValue>89</wpml:droneEnumValue>" in template
        assert "<wpml:payloadEnumValue>42</wpml:payloadEnumValue>" in template

    def test_matrice_4t_enum_mapping(self):
        """dji matrice 4t maps to drone enum 100/1 and payload 90/0."""
        fp = _make_flight_plan(1)
        profile = MagicMock()
        profile.model_identifier = None
        profile.manufacturer = "DJI"
        profile.model = "Matrice 4T"

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0, drone_profile=profile))

        assert "<wpml:droneEnumValue>100</wpml:droneEnumValue>" in template
        assert "<wpml:droneSubEnumValue>1</wpml:droneSubEnumValue>" in template
        assert "<wpml:payloadEnumValue>90</wpml:payloadEnumValue>" in template

    def test_default_enums_match_m30t_sample(self):
        """without a drone profile, enums fall back to m30t/h30t (matches reference sample)."""
        fp = _make_flight_plan(1)

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "<wpml:droneEnumValue>99</wpml:droneEnumValue>" in template
        assert "<wpml:droneSubEnumValue>1</wpml:droneSubEnumValue>" in template
        assert "<wpml:payloadEnumValue>89</wpml:payloadEnumValue>" in template

    def test_mission_config_drone_info_present(self):
        """missionConfig includes droneInfo and payloadInfo blocks."""
        fp = _make_flight_plan(1)

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "wpml:droneInfo" in template
        assert "wpml:droneEnumValue" in template
        assert "wpml:payloadInfo" in template
        assert "wpml:payloadEnumValue" in template

    def test_template_kml_has_template_folder(self):
        """template.kml folder declares templateType=waypoint and coordinate system."""
        fp = _make_flight_plan(1)

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "<wpml:templateType>waypoint</wpml:templateType>" in template
        assert "<wpml:coordinateMode>WGS84</wpml:coordinateMode>" in template
        assert "<wpml:globalUseStraightLine>1</wpml:globalUseStraightLine>" in template

    def test_empty_waypoints_produces_valid_archive(self):
        """missions with zero waypoints still emit a structurally valid wpmz archive."""
        fp = _make_flight_plan(0)

        result = export_service.generate_kmz(fp, "", 0)
        template, waylines = _read_wpmz(result)

        assert "<Placemark" not in template
        assert "<Placemark" not in waylines
        # payloadParam must still be emitted so the schema stays valid
        assert "<wpml:payloadParam>" in template


class TestGenerateJson:
    """tests for json export generation."""

    def test_valid_json_structure(self):
        """json output has correct top-level keys and waypoint structure."""
        fp = _make_flight_plan(3)

        result = export_service.generate_json(fp, "Test Mission", 290.0)
        data = json.loads(result)

        assert data["mission_name"] == "Test Mission"
        assert "mission_id" in data
        assert "waypoints" in data
        assert "total_distance" in data
        assert "estimated_duration" in data
        assert data["airport_elevation"] == 290.0
        assert len(data["waypoints"]) == 3

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

    def test_camera_target_when_set(self):
        """waypoint with a camera_target geometry serializes it into the json."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].camera_target = MagicMock()
        fp.waypoints[0].camera_target.data = _make_ewkb(17.5, 48.5, 250.0)

        result = export_service.generate_json(fp, "", 100.0)
        data = json.loads(result)

        ct = data["waypoints"][0]["camera_target"]
        assert ct is not None
        assert abs(ct["latitude"] - 48.5) < 1e-6
        assert abs(ct["longitude"] - 17.5) < 1e-6
        assert ct["altitude_msl"] == 250.0
        assert ct["altitude_agl"] == 150.0


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
    """tests for filename sanitization (fh2 + http safe)."""

    def test_strips_path_separators(self):
        """path separators are replaced so traversal is impossible."""
        # ../../evil -> "    evil" -> "evil" after collapse+trim
        assert export_service._sanitize_filename("../../evil") == "evil"

    def test_strips_backslashes(self):
        """backslashes are stripped."""
        assert export_service._sanitize_filename("..\\..\\evil") == "evil"

    def test_strips_quotes_and_newlines(self):
        """quotes are stripped and control chars (incl. \\r\\n) removed."""
        # " becomes space, \r\n are control chars (removed entirely) -> "my mission"
        assert export_service._sanitize_filename('my"mission\r\n') == "my mission"

    def test_normal_name_unchanged(self):
        """normal mission names pass through unchanged."""
        assert export_service._sanitize_filename("Test Mission 1") == "Test Mission 1"

    def test_strips_null_bytes(self):
        """null bytes and control characters are removed."""
        assert export_service._sanitize_filename("mis\x00sion\x01test\x7f") == "missiontest"

    def test_strips_dotdot_slash_variant(self):
        """combined dotdot and slash variants are stripped."""
        assert export_service._sanitize_filename("....//evil") == "evil"

    def test_strips_fh2_banned_chars(self):
        """all fh2-banned chars (< > : \" / | ? * . _) get replaced with spaces."""
        result = export_service._sanitize_filename('my<file>:"name|with?*.chars_here')
        for ch in '<>:"/|?*._':
            assert ch not in result
        assert result == "my file name with chars here"

    def test_underscore_replaced(self):
        """underscores - fh2-banned - are stripped even when the rest is fine."""
        assert export_service._sanitize_filename("Test_2") == "Test 2"

    def test_dot_replaced(self):
        """dots are stripped from the base name (extension is added later)."""
        assert export_service._sanitize_filename("v1.0.mission") == "v1 0 mission"

    def test_fallback_when_empty_after_sanitize(self):
        """when every char is stripped, fall back to 'mission' (no underscore)."""
        assert export_service._sanitize_filename("___...") == "mission"
        assert export_service._sanitize_filename("") == "mission"


def _build_export_db_mock(mission, fp, airport, drone_profile=None):
    """build a MagicMock Session that routes query(Model) to the right fixture.

    mission/airport/drone_profile are looked up via query.filter.first,
    flight_plan via query.options.filter.first.
    """
    db = MagicMock()

    def query_side_effect(model):
        mock_chain = MagicMock()
        if model.__name__ == "Mission":
            mock_chain.filter.return_value.first.return_value = mission
        elif model.__name__ == "FlightPlan":
            mock_chain.options.return_value.filter.return_value.first.return_value = fp
        elif model.__name__ == "Airport":
            mock_chain.filter.return_value.first.return_value = airport
        elif model.__name__ == "DroneProfile":
            mock_chain.filter.return_value.first.return_value = drone_profile
        return mock_chain

    db.query.side_effect = query_side_effect
    return db


class TestExportMissionFormats:
    """tests for export_mission format validation."""

    def test_invalid_format_raises_domain_error(self):
        """unknown format string raises DomainError 422 before any db mutation."""
        from app.core.exceptions import DomainError

        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "test"
        mission.drone_profile_id = None

        fp = _make_flight_plan(1)
        fp.airport_id = uuid4()

        airport = MagicMock()
        airport.elevation = 100.0

        db = _build_export_db_mock(mission, fp, airport)

        import pytest

        with pytest.raises(DomainError) as exc_info:
            export_service.export_mission(db, uuid4(), ["INVALID"])
        assert exc_info.value.status_code == 422
        db.commit.assert_not_called()

    def test_valid_format_exports_and_commits(self):
        """successful export transitions status, commits, and returns files."""
        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "Test Mission"
        mission.drone_profile_id = None

        fp = _make_flight_plan(2)
        fp.airport_id = uuid4()

        airport = MagicMock()
        airport.elevation = 100.0

        db = _build_export_db_mock(mission, fp, airport)

        files, safe_name = export_service.export_mission(db, uuid4(), ["JSON"])

        assert safe_name == "Test Mission"
        assert len(files) == 1
        filename = list(files.keys())[0]
        # no "mission_" prefix - fh2 rejects underscores in flight route names
        assert filename == "Test Mission.json"
        content, content_type = files[filename]
        assert content_type == "application/json"
        assert len(content) > 0
        mission.transition_to.assert_called_once_with("EXPORTED")
        db.commit.assert_called_once()

    def test_ugcs_format_exports_and_commits(self):
        """ugcs format export transitions status, commits, and returns files."""
        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "Test Mission"
        mission.drone_profile_id = None

        fp = _make_flight_plan(2)
        fp.airport_id = uuid4()

        airport = MagicMock()
        airport.elevation = 100.0

        db = _build_export_db_mock(mission, fp, airport)

        files, safe_name = export_service.export_mission(db, uuid4(), ["UGCS"])

        assert safe_name == "Test Mission"
        assert len(files) == 1
        filename = list(files.keys())[0]
        assert filename == "Test Mission.ugcs.json"
        content, content_type = files[filename]
        assert content_type == "application/json"

        data = json.loads(content)
        assert "version" in data
        assert "route" in data
        assert isinstance(data["version"]["build"], int)

        mission.transition_to.assert_called_once_with("EXPORTED")
        db.commit.assert_called_once()

    def test_exported_mission_reexport_skips_transition(self):
        """re-exporting an EXPORTED mission must not call transition_to or commit."""
        mission = MagicMock()
        mission.status = "EXPORTED"
        mission.name = "Already Done"
        mission.drone_profile_id = None

        fp = _make_flight_plan(1)
        fp.airport_id = uuid4()

        airport = MagicMock()
        airport.elevation = 100.0

        db = _build_export_db_mock(mission, fp, airport)

        files, _ = export_service.export_mission(db, uuid4(), ["JSON"])

        assert len(files) == 1
        mission.transition_to.assert_not_called()
        db.commit.assert_not_called()

    def test_draft_status_rejected(self):
        """missions in DRAFT status cannot be exported - DomainError 409."""
        from app.core.exceptions import DomainError

        mission = MagicMock()
        mission.status = "DRAFT"
        mission.name = "x"
        mission.drone_profile_id = None

        fp = _make_flight_plan(1)
        airport = MagicMock()
        airport.elevation = 100.0

        db = _build_export_db_mock(mission, fp, airport)

        import pytest

        with pytest.raises(DomainError) as exc_info:
            export_service.export_mission(db, uuid4(), ["JSON"])
        assert exc_info.value.status_code == 409
        db.commit.assert_not_called()

    def test_missing_mission_raises_not_found(self):
        """mission lookup returning None raises NotFoundError."""
        from app.core.exceptions import NotFoundError

        db = _build_export_db_mock(None, None, None)

        import pytest

        with pytest.raises(NotFoundError):
            export_service.export_mission(db, uuid4(), ["JSON"])

    def test_missing_flight_plan_raises_not_found(self):
        """no flight plan for a validated mission raises NotFoundError."""
        from app.core.exceptions import NotFoundError

        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "x"
        mission.drone_profile_id = None

        db = _build_export_db_mock(mission, None, None)

        import pytest

        with pytest.raises(NotFoundError):
            export_service.export_mission(db, uuid4(), ["JSON"])

    def test_missing_airport_elevation_raises_domain_error(self):
        """airport without elevation raises DomainError 422 - agl cannot be computed."""
        from app.core.exceptions import DomainError

        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "x"
        mission.drone_profile_id = None

        fp = _make_flight_plan(1)
        fp.airport_id = uuid4()

        airport = MagicMock()
        airport.elevation = None

        db = _build_export_db_mock(mission, fp, airport)

        import pytest

        with pytest.raises(DomainError) as exc_info:
            export_service.export_mission(db, uuid4(), ["JSON"])
        assert exc_info.value.status_code == 422

    def test_transition_value_error_becomes_domain_error(self):
        """ValueError from mission.transition_to is re-raised as DomainError 409."""
        from app.core.exceptions import DomainError

        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "x"
        mission.drone_profile_id = None
        mission.transition_to.side_effect = ValueError("bad transition")

        fp = _make_flight_plan(1)
        fp.airport_id = uuid4()

        airport = MagicMock()
        airport.elevation = 100.0

        db = _build_export_db_mock(mission, fp, airport)

        import pytest

        with pytest.raises(DomainError) as exc_info:
            export_service.export_mission(db, uuid4(), ["JSON"])
        assert exc_info.value.status_code == 409

    def test_kmz_export_loads_drone_profile(self):
        """kmz export with a drone_profile_id loads the profile and applies its enums."""
        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "Airport Inspection"
        mission.drone_profile_id = uuid4()
        mission.takeoff_coordinate = None

        fp = _make_flight_plan(1)
        fp.airport_id = uuid4()

        airport = MagicMock()
        airport.elevation = 100.0

        drone_profile = MagicMock()
        drone_profile.model_identifier = None
        drone_profile.manufacturer = "DJI"
        drone_profile.model = "M30T"

        db = _build_export_db_mock(mission, fp, airport, drone_profile)

        files, safe_name = export_service.export_mission(db, uuid4(), ["KMZ"])

        assert safe_name == "Airport Inspection"
        filename = list(files.keys())[0]
        assert filename == "Airport Inspection.kmz"
        content, _ = files[filename]

        with zipfile.ZipFile(BytesIO(content)) as zf:
            template = zf.read("wpmz/template.kml").decode("utf-8")

        assert "<wpml:droneEnumValue>99</wpml:droneEnumValue>" in template
        assert "<wpml:droneSubEnumValue>1</wpml:droneSubEnumValue>" in template

    def test_banned_chars_in_mission_name_produce_safe_filename(self):
        """mission names with fh2-banned chars round-trip to a clean filename."""
        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "Test_2.Mission: runway / 22"
        mission.drone_profile_id = None

        fp = _make_flight_plan(1)
        fp.airport_id = uuid4()

        airport = MagicMock()
        airport.elevation = 100.0

        db = _build_export_db_mock(mission, fp, airport)

        files, safe_name = export_service.export_mission(db, uuid4(), ["JSON"])
        filename = list(files.keys())[0]

        for banned in '<>:"/|?*_':
            assert banned not in safe_name
        # exactly one dot - the one separating extension from base
        assert filename.count(".") == 1
        assert filename.endswith(".json")


class TestGenerateUgcs:
    """tests for ugcs json route export generation."""

    def test_top_level_structure(self):
        """ugcs output has version object and route object at top level."""
        fp = _make_flight_plan(3)

        result = export_service.generate_ugcs(fp, "Test Route", 290.0)
        data = json.loads(result)

        assert "version" in data
        assert "route" in data
        assert isinstance(data["version"], dict)
        assert isinstance(data["route"], dict)

    def test_top_level_arrays_present(self):
        """ugcs output includes empty payload and vehicle profile arrays."""
        fp = _make_flight_plan(1)

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        assert data["payloadProfiles"] == []
        assert data["vehicleProfiles"] == []
        assert "vehicles" not in data

    def test_version_is_structured_object(self):
        """version field matches ugcs expected schema version."""
        fp = _make_flight_plan(1)

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        v = data["version"]
        assert v["major"] == 5
        assert v["minor"] == 16
        assert "patch" not in v
        assert v["build"] == 9205
        assert isinstance(v["build"], int)
        assert v["component"] == "DATABASE"

    def test_coordinates_in_radians(self):
        """waypoint coordinates are converted from degrees to radians."""
        fp = _make_flight_plan(1)

        result = export_service.generate_ugcs(fp, "", 290.0)
        data = json.loads(result)

        point = data["route"]["segments"][0]["point"]
        expected_lat = math.radians(49.69)
        expected_lon = math.radians(18.11)

        assert abs(point["latitude"] - expected_lat) < 1e-10
        assert abs(point["longitude"] - expected_lon) < 1e-10

    def test_altitude_is_agl(self):
        """segment altitude is relative to ground level."""
        fp = _make_flight_plan(1)

        result = export_service.generate_ugcs(fp, "", 290.0)
        data = json.loads(result)

        point = data["route"]["segments"][0]["point"]
        assert point["altitude"] == 10.0
        assert point["altitudeType"] == "AGL"

    def test_segment_count_matches_waypoints(self):
        """each waypoint produces one segment."""
        fp = _make_flight_plan(5)

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        assert len(data["route"]["segments"]) == 5

    def test_all_segments_are_waypoint_type(self):
        """all segments use Waypoint type - ugcs only accepts this for import."""
        fp = _make_flight_plan(3)

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        for seg in data["route"]["segments"]:
            assert seg["type"] == "Waypoint"

    def test_route_name(self):
        """route name matches mission name."""
        fp = _make_flight_plan(1)

        result = export_service.generate_ugcs(fp, "Airport Inspection", 0)
        data = json.loads(result)

        assert data["route"]["name"] == "Airport Inspection"

    def test_failsafes_present(self):
        """route includes default failsafe configuration."""
        fp = _make_flight_plan(1)

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        fs = data["route"]["failsafes"]
        assert fs["rcLost"] == "GO_HOME"
        assert fs["gpsLost"] is None
        assert fs["lowBattery"] is None
        assert fs["datalinkLost"] is None

    def test_camera_actions_excluded(self):
        """camera actions are excluded - ugcs requires vehicle-specific config."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].camera_action = "PHOTO_CAPTURE"

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        actions = data["route"]["segments"][0]["actions"]
        camera_actions = [a for a in actions if a["type"] == "CameraTrigger"]
        assert len(camera_actions) == 0

    def test_hover_generates_wait_action(self):
        """waypoint with hover_duration generates Wait action."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].hover_duration = 3.5

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        actions = data["route"]["segments"][0]["actions"]
        wait_actions = [a for a in actions if a["type"] == "Wait"]
        assert len(wait_actions) == 1
        assert wait_actions[0]["interval"] == 3.5

    def test_empty_waypoints(self):
        """ugcs format works with zero waypoints."""
        fp = _make_flight_plan(0)

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        assert data["route"]["segments"] == []
        assert "version" in data

    def test_route_nullable_fields(self):
        """route includes nullable fields that ugcs expects."""
        fp = _make_flight_plan(1)

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        route = data["route"]
        assert route["scheduledTime"] is None
        assert route["startDelay"] is None
        assert route["vehicleProfile"] is None
        assert route["takeoffHeight"] is None
        assert route["trajectoryType"] is None
        assert route["maxSpeed"] is None

    def test_route_defaults(self):
        """route has correct default values for ugcs."""
        fp = _make_flight_plan(1)

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        route = data["route"]
        assert route["maxAltitude"] == 1500.0
        assert route["cornerRadius"] == 20.0
        assert route["safeAltitude"] == 50.0
        assert "altitudeType" not in route

    def test_segment_corner_radius(self):
        """each segment includes cornerRadius parameter."""
        fp = _make_flight_plan(2)

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        for seg in data["route"]["segments"]:
            assert "cornerRadius" in seg["parameters"]
            assert seg["parameters"]["cornerRadius"] is None


class TestGenerateCsv:
    """tests for csv export generation."""

    def test_generates_valid_csv(self):
        """csv output contains header and correct row count."""
        fp = _make_flight_plan(3)

        result = export_service.generate_csv_export(fp, "Test", 290.0)
        text = result.decode("utf-8")
        lines = text.strip().split("\n")

        assert lines[0].startswith("sequence")
        assert len(lines) == 4  # header + 3 waypoints

    def test_agl_altitude(self):
        """altitude_agl equals altitude_msl minus airport_elevation."""
        fp = _make_flight_plan(1)
        elev = 290.0

        result = export_service.generate_csv_export(fp, "", elev)
        text = result.decode("utf-8")
        lines = text.strip().split("\n")
        row = lines[1].split(",")

        alt_msl = float(row[3])
        alt_agl = float(row[4])
        assert abs(alt_agl - (alt_msl - elev)) < 0.01

    def test_camera_action_in_output(self):
        """camera action column is present."""
        fp = _make_flight_plan(3)
        fp.waypoints[1].camera_action = "PHOTO_CAPTURE"

        result = export_service.generate_csv_export(fp, "", 0)
        text = result.decode("utf-8")

        assert "PHOTO_CAPTURE" in text


class TestGenerateGpx:
    """tests for gpx export generation."""

    def test_generates_valid_gpx(self):
        """gpx output contains xml declaration and gpx elements."""
        fp = _make_flight_plan(3)

        result = export_service.generate_gpx(fp, "Test", 290.0)
        text = result.decode("utf-8")

        assert "<?xml" in text
        assert "<gpx" in text
        assert "<wpt" in text
        assert "<trk" in text

    def test_waypoint_count(self):
        """gpx has correct number of wpt elements."""
        fp = _make_flight_plan(5)

        result = export_service.generate_gpx(fp, "", 0)
        text = result.decode("utf-8")

        assert text.count("<wpt") == 5

    def test_elevation_values(self):
        """gpx wpt elements have elevation."""
        fp = _make_flight_plan(1)

        result = export_service.generate_gpx(fp, "", 0)
        text = result.decode("utf-8")

        assert "<ele>" in text

    def test_xml_encoding_declaration_utf8(self):
        """gpx xml declaration specifies utf-8 encoding."""
        fp = _make_flight_plan(1)

        result = export_service.generate_gpx(fp, "Letisko Žilina", 0)
        text = result.decode("utf-8")

        assert "encoding='utf-8'" in text.lower() or 'encoding="utf-8"' in text.lower()
        assert "Letisko Žilina" in text


class TestGenerateWpml:
    """tests for standalone dji waylines.wpml export generation."""

    def test_generates_valid_wpml(self):
        """wpml output is a kml 2.2 document carrying dji wpmz 1.0.6 extensions."""
        fp = _make_flight_plan(3)

        result = export_service.generate_wpml(fp, "Test", 290.0)
        text = result.decode("utf-8")

        assert "<?xml" in text
        assert "http://www.opengis.net/kml/2.2" in text
        assert "http://www.dji.com/wpmz/1.0.6" in text
        assert "wpml:missionConfig" in text
        assert "<wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>" in text

    def test_waypoint_count(self):
        """wpml has one placemark per waypoint."""
        fp = _make_flight_plan(4)

        result = export_service.generate_wpml(fp, "", 0)
        text = result.decode("utf-8")

        assert text.count("<Placemark") == 4

    def test_camera_action_mapping(self):
        """dji camera action is mapped to wpml:actionActuatorFunc."""
        fp = _make_flight_plan(3)
        fp.waypoints[1].camera_action = "PHOTO_CAPTURE"

        result = export_service.generate_wpml(fp, "", 0)
        text = result.decode("utf-8")

        assert "takePhoto" in text
        assert "wpml:actionGroup" in text

    def test_execute_height_is_agl_relative_to_takeoff(self):
        """executeHeight carries AGL; paired with relativeToStartPoint mode."""
        fp = _make_flight_plan(1)

        result = export_service.generate_wpml(fp, "", 290.0)
        text = result.decode("utf-8")

        # msl 300 - airport_elevation 290 = 10m above takeoff
        assert "<wpml:executeHeight>10.000000</wpml:executeHeight>" in text
        assert "<wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>" in text

    def test_xml_encoding_declaration_utf8(self):
        """wpml xml declaration specifies utf-8 encoding."""
        fp = _make_flight_plan(1)

        result = export_service.generate_wpml(fp, "", 0)
        text = result.decode("utf-8")

        assert "encoding='utf-8'" in text.lower() or 'encoding="utf-8"' in text.lower()


class TestGenerateLitchiCsv:
    """tests for litchi csv export generation."""

    def test_generates_valid_litchi_csv(self):
        """litchi csv output contains correct header columns."""
        fp = _make_flight_plan(3)

        result = export_service.generate_litchi_csv(fp, "Test", 290.0)
        text = result.decode("utf-8")
        header = text.strip().split("\n")[0]

        assert "latitude" in header
        assert "curvesize(m)" in header
        assert "altitudemode" in header

    def test_row_count(self):
        """litchi csv has correct number of data rows."""
        fp = _make_flight_plan(5)

        result = export_service.generate_litchi_csv(fp, "", 0)
        text = result.decode("utf-8")
        lines = text.strip().split("\n")

        assert len(lines) == 6  # header + 5 waypoints

    def test_action_type_mapping(self):
        """camera actions map to correct litchi action codes."""
        fp = _make_flight_plan(3)
        fp.waypoints[1].camera_action = "PHOTO_CAPTURE"

        result = export_service.generate_litchi_csv(fp, "", 0)
        text = result.decode("utf-8")
        lines = text.strip().split("\n")
        # measurement waypoint row (index 1 -> line 2)
        row = lines[2].split(",")
        action_idx = 8  # actiontype1
        assert row[action_idx] == "1"  # 1 = takePhoto

    def test_hover_curvesize_zero(self):
        """hover waypoints have curvesize 0."""
        fp = _make_flight_plan(3)
        fp.waypoints[1].waypoint_type = "HOVER"

        result = export_service.generate_litchi_csv(fp, "", 0)
        text = result.decode("utf-8")
        lines = text.strip().split("\n")
        row = lines[2].split(",")
        curvesize_idx = 4  # curvesize(m)
        assert row[curvesize_idx] == "0"

    def test_gimbal_mode_when_pitch_set(self):
        """gimbal_pitch produces gimbalmode=2 (focus-point mode) in column 6."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].gimbal_pitch = -45.0

        result = export_service.generate_litchi_csv(fp, "", 0)
        text = result.decode("utf-8")
        row = text.strip().split("\n")[1].split(",")
        gimbal_mode_idx = 6  # gimbalmode column
        gimbal_pitch_idx = 7  # gimbalpitchangle column
        assert row[gimbal_mode_idx] == "2"
        assert row[gimbal_pitch_idx] == "-45.0"

    def test_gimbal_mode_zero_when_pitch_missing(self):
        """gimbal_pitch=None produces gimbalmode=0 (disabled)."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].gimbal_pitch = None

        result = export_service.generate_litchi_csv(fp, "", 0)
        text = result.decode("utf-8")
        row = text.strip().split("\n")[1].split(",")
        assert row[6] == "0"


class TestGenerateDronedeploy:
    """tests for dronedeploy json export generation."""

    def test_generates_valid_json(self):
        """dronedeploy output is valid json with required fields."""
        fp = _make_flight_plan(3)

        result = export_service.generate_dronedeploy(fp, "Test", 290.0)
        data = json.loads(result)

        assert data["version"] == 1
        assert data["name"] == "Test"
        assert len(data["waypoints"]) == 3

    def test_waypoint_fields(self):
        """dronedeploy waypoints have required fields."""
        fp = _make_flight_plan(2)

        result = export_service.generate_dronedeploy(fp, "", 0)
        data = json.loads(result)

        wp = data["waypoints"][0]
        assert "lat" in wp
        assert "lng" in wp
        assert "alt" in wp
        assert "speed" in wp
        assert "heading" in wp
        assert "actions" in wp

    def test_camera_action_mapping(self):
        """camera actions map to correct dronedeploy action objects."""
        fp = _make_flight_plan(3)
        fp.waypoints[1].camera_action = "PHOTO_CAPTURE"

        result = export_service.generate_dronedeploy(fp, "", 0)
        data = json.loads(result)

        assert data["waypoints"][1]["actions"] == [{"type": "photo"}]

    def test_agl_altitude(self):
        """altitude is agl (msl minus elevation)."""
        fp = _make_flight_plan(1)
        elev = 290.0

        result = export_service.generate_dronedeploy(fp, "", elev)
        data = json.loads(result)

        wp = data["waypoints"][0]
        # alt = 300 - 290 = 10
        assert abs(wp["alt"] - 10.0) < 0.01
