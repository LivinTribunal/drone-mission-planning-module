"""tests for export service file generators"""

import json
import math
import struct
import zipfile
from io import BytesIO
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

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
        """template placemarks inherit speed, heading, and turn from globals.

        matches fh2's own export: per-waypoint aim is driven by the rotateYaw
        action at each reachPoint, not by the placemark heading block. the
        placemark followWayline + useGlobal=1 keeps fh2 happy while the
        gimbal tracks the aircraft body via the drone's default Follow mode.
        """
        fp = _make_flight_plan(1)

        template, waylines = _read_wpmz(export_service.generate_kmz(fp, "Test", 0))

        assert "<wpml:useGlobalSpeed>1</wpml:useGlobalSpeed>" in template
        assert "<wpml:useGlobalHeadingParam>1</wpml:useGlobalHeadingParam>" in template
        assert "<wpml:useGlobalTurnParam>1</wpml:useGlobalTurnParam>" in template
        assert "<wpml:useStraightLine>1</wpml:useStraightLine>" in template
        assert "<wpml:useStraightLine>1</wpml:useStraightLine>" in waylines
        assert "useGlobalHeadingParam" not in waylines

    def test_placemark_heading_mode_is_follow_wayline(self):
        """placemark heading mode is followWayline with angle 0.

        aim at the target happens via the actionGroup rotateYaw action at
        reachPoint. regression guard: smoothTransition + explicit per-waypoint
        angles broke fh2's gimbal follow simulation and locked the camera
        to absolute north.
        """
        fp = _make_flight_plan(3)
        wp = fp.waypoints[1]
        wp.waypoint_type = "MEASUREMENT"
        wp.heading = 172.1
        wp.camera_target = MagicMock()
        wp.camera_target.data = _make_ewkb(18.12, 49.69, 290.0)

        template, waylines = _read_wpmz(export_service.generate_kmz(fp, "Test", 0))

        for content in (template, waylines):
            assert "<wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>" in content
            assert "smoothTransition" not in content
        # the target bearing appears only inside the rotateYaw action, not in
        # the placemark waypointHeadingAngle
        assert "<wpml:aircraftHeading>172.1</wpml:aircraftHeading>" in waylines

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

    def test_heading_emits_rotate_yaw_action_for_measurement(self):
        """measurement waypoint with heading emits rotateYaw to aim at target."""
        fp = _make_flight_plan(3)
        wp = fp.waypoints[1]
        wp.waypoint_type = "MEASUREMENT"
        wp.heading = 137.5
        wp.camera_target = MagicMock()
        wp.camera_target.data = _make_ewkb(18.12, 49.69, 290.0)

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "<wpml:actionActuatorFunc>rotateYaw</wpml:actionActuatorFunc>" in waylines
        assert "<wpml:aircraftHeading>137.5</wpml:aircraftHeading>" in waylines
        # positive heading → clockwise is the short rotation path
        assert "<wpml:aircraftPathMode>clockwise</wpml:aircraftPathMode>" in waylines

    def test_rotate_yaw_path_mode_follows_sign(self):
        """aircraftPathMode matches the sign of the target heading (short-path rotation).

        regression guard for the 'camera stuck on north' bug: a positive target
        heading (172°) paired with counterClockwise forces a 188° wraparound
        rotation that fh2 refuses to execute, leaving both aircraft + gimbal
        at their startup yaw.
        """
        fp = _make_flight_plan(3)
        neg_wp = fp.waypoints[1]
        neg_wp.waypoint_type = "MEASUREMENT"
        neg_wp.heading = -45.0
        neg_wp.camera_target = MagicMock()
        neg_wp.camera_target.data = _make_ewkb(18.12, 49.69, 290.0)

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        # -45° → counterClockwise takes the short way
        assert "<wpml:aircraftHeading>-45</wpml:aircraftHeading>" in waylines
        path_block = (
            "<wpml:aircraftHeading>-45</wpml:aircraftHeading>"
            "<wpml:aircraftPathMode>counterClockwise</wpml:aircraftPathMode>"
        )
        assert path_block in waylines

    def test_gimbal_pitch_emits_gimbal_rotate_action_for_measurement(self):
        """measurement waypoint with gimbal_pitch emits gimbalRotate that
        commands pitch only. yaw is disabled so the gimbal follows the aircraft
        body (which the preceding rotateYaw action has just aimed at the target).

        regression guard: enabling explicit yaw breaks fh2's gimbal-follow
        simulation and locks the preview camera to the commanded absolute yaw.
        """
        fp = _make_flight_plan(3)
        wp = fp.waypoints[1]
        wp.waypoint_type = "MEASUREMENT"
        wp.heading = 172.1
        wp.gimbal_pitch = -45.0
        wp.camera_target = MagicMock()
        wp.camera_target.data = _make_ewkb(18.12, 49.69, 290.0)

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "<wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>" in waylines
        assert "<wpml:gimbalHeadingYawBase>north</wpml:gimbalHeadingYawBase>" in waylines
        assert "<wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>" in waylines
        assert "<wpml:gimbalPitchRotateAngle>-45</wpml:gimbalPitchRotateAngle>" in waylines
        assert "<wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>" in waylines
        assert "<wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>" in waylines

    def test_template_uses_manual_gimbal_pitch_mode(self):
        """template folder declares gimbalPitchMode=manual (matches fh2 export).

        'manual' lets the actionGroup gimbalRotate drive pitch while yaw is
        taken care of by the drone's default Follow gimbal mode (after rotateYaw
        puts the nose on target). usePointSetting would pull in the per-waypoint
        waypointGimbalHeadingParam and re-lock yaw to the values in that block.
        """
        fp = _make_flight_plan(1)

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "<wpml:gimbalPitchMode>manual</wpml:gimbalPitchMode>" in template

    def test_transit_waypoint_does_not_rotate_yaw(self):
        """transit/takeoff/landing waypoints keep nose along flight direction.

        regression guard: transit waypoints carry a heading value for internal
        routing but must NOT emit rotateYaw, otherwise the aircraft pivots
        mid-flight to a direction unrelated to any camera target.
        """
        fp = _make_flight_plan(3)
        # default _make_flight_plan: wp0=TAKEOFF, wp1=MEASUREMENT, wp2=LANDING.
        # override middle to TRANSIT + heading, no camera target.
        fp.waypoints[1].waypoint_type = "TRANSIT"
        fp.waypoints[1].heading = 222.0
        fp.waypoints[1].camera_target = None

        _, waylines = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "rotateYaw" not in waylines
        assert "gimbalRotate" not in waylines

    def test_payload_param_block_present(self):
        """template folder has the trailing payloadParam block required by fh2."""
        fp = _make_flight_plan(1)

        template, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0))

        assert "<wpml:payloadParam>" in template
        assert "<wpml:focusMode>firstPoint</wpml:focusMode>" in template
        assert "<wpml:imageFormat>visable</wpml:imageFormat>" in template
        assert "<wpml:photoSize>default_l</wpml:photoSize>" in template

    def test_drone_enums_are_always_m30t(self):
        """every export emits droneEnum=99/1 + payloadEnum=89/0 regardless of profile.

        fh2's preview only renders the gimbal-follow behavior for the m30t
        enum set; exporting with m4t (100/1/90/0) or other newer drones leaves
        the preview camera locked at absolute north. matches both sample
        exports from the user's fh2 (APCH + PAPI 22, both written as m30t
        even when a newer drone was selected).
        """
        fp = _make_flight_plan(1)

        # default (no profile)
        default_tpl, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0))
        # with m4t profile - should still emit m30t enums
        m4t_profile = MagicMock()
        m4t_profile.model_identifier = None
        m4t_profile.manufacturer = "DJI"
        m4t_profile.model = "Matrice 4T"
        m4t_tpl, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0, drone_profile=m4t_profile))
        # with m350 profile - should still emit m30t enums
        m350_profile = MagicMock()
        m350_profile.model_identifier = None
        m350_profile.manufacturer = "DJI"
        m350_profile.model = "M350 RTK"
        m350_tpl, _ = _read_wpmz(export_service.generate_kmz(fp, "", 0, drone_profile=m350_profile))

        for template in (default_tpl, m4t_tpl, m350_tpl):
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

    def test_camera_settings_from_mission_inspections(self):
        """json output includes per-inspection camera settings when mission is provided."""
        fp = _make_flight_plan(2)

        config = MagicMock()
        config.resolve_with_defaults.return_value = {
            "white_balance": "TUNGSTEN",
            "iso": 800,
            "shutter_speed": "1/30",
            "focus_mode": "INFINITY",
            "optical_zoom": 2.0,
        }

        template_cfg = MagicMock()
        template = MagicMock()
        template.default_config = template_cfg

        insp = MagicMock()
        insp.id = uuid4()
        insp.method = "HORIZONTAL_RANGE"
        insp.sequence_order = 1
        insp.config = config
        insp.template = template

        mission = MagicMock()
        mission.inspections = [insp]

        result = export_service.generate_json(fp, "Night PAPI", 290.0, mission=mission)
        data = json.loads(result)

        assert "inspections" in data
        assert len(data["inspections"]) == 1
        cam = data["inspections"][0]["camera_settings"]
        assert cam["white_balance"] == "TUNGSTEN"
        assert cam["iso"] == 800
        assert cam["shutter_speed"] == "1/30"
        assert cam["focus_mode"] == "INFINITY"
        assert cam["optical_zoom"] == 2.0
        config.resolve_with_defaults.assert_called_once_with(template_cfg)

    def test_camera_settings_omitted_when_all_none(self):
        """inspection with no camera settings is excluded from the output."""
        fp = _make_flight_plan(1)

        config = MagicMock()
        config.resolve_with_defaults.return_value = {
            "white_balance": None,
            "iso": None,
            "shutter_speed": None,
            "focus_mode": None,
            "optical_zoom": None,
        }

        insp = MagicMock()
        insp.id = uuid4()
        insp.method = "VERTICAL_PROFILE"
        insp.sequence_order = 1
        insp.config = config
        insp.template = None

        mission = MagicMock()
        mission.inspections = [insp]

        result = export_service.generate_json(fp, "", 0, mission=mission)
        data = json.loads(result)

        assert "inspections" not in data


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
            # eager-load path: query(Mission).filter().options().first()
            mock_chain.filter.return_value.options.return_value.first.return_value = mission
            # options-first path: query(Mission).options().filter().first()
            mock_chain.options.return_value.filter.return_value.first.return_value = mission
        elif model.__name__ == "FlightPlan":
            mock_chain.options.return_value.filter.return_value.first.return_value = fp
        elif model.__name__ == "Airport":
            mock_chain.filter.return_value.first.return_value = airport
            # eager-loaded path: query(Airport).filter().options(...).first()
            mock_chain.filter.return_value.options.return_value.first.return_value = airport
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
        assert isinstance(data["version"]["build"], str)

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
        assert v["patch"] == 1
        assert v["build"] == "9205"
        assert isinstance(v["build"], str)
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

    def test_camera_trigger_photo(self):
        """photo capture generates CameraTrigger with SINGLE_SHOT state."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].camera_action = "PHOTO_CAPTURE"

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        actions = data["route"]["segments"][0]["actions"]
        camera_actions = [a for a in actions if a["type"] == "CameraTrigger"]
        assert len(camera_actions) == 1
        assert camera_actions[0]["state"] == "SINGLE_SHOT"

    def test_camera_trigger_recording(self):
        """recording start generates CameraTrigger with START_RECORDING state."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].camera_action = "RECORDING_START"

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        actions = data["route"]["segments"][0]["actions"]
        camera_actions = [a for a in actions if a["type"] == "CameraTrigger"]
        assert len(camera_actions) == 1
        assert camera_actions[0]["state"] == "START_RECORDING"

    def test_heading_generates_heading_action(self):
        """waypoint heading generates Heading action in radians."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].heading = 90.0

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        actions = data["route"]["segments"][0]["actions"]
        heading_actions = [a for a in actions if a["type"] == "Heading"]
        assert len(heading_actions) == 1
        assert heading_actions[0]["relativeToNorth"] is True

    def test_gimbal_generates_camera_control(self):
        """waypoint gimbal pitch generates CameraControl action."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].gimbal_pitch = -45.0

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        actions = data["route"]["segments"][0]["actions"]
        cam_actions = [a for a in actions if a["type"] == "CameraControl"]
        assert len(cam_actions) == 1
        assert cam_actions[0]["roll"] == 0.0

    def test_hover_generates_wait_action(self):
        """waypoint with hover_duration generates Wait action with extra fields."""
        fp = _make_flight_plan(1)
        fp.waypoints[0].hover_duration = 3.5

        result = export_service.generate_ugcs(fp, "", 0)
        data = json.loads(result)

        actions = data["route"]["segments"][0]["actions"]
        wait_actions = [a for a in actions if a["type"] == "Wait"]
        assert len(wait_actions) == 1
        assert wait_actions[0]["interval"] == 3.5
        assert wait_actions[0]["waitForOperator"] is False

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


# WKB polygon builder for geozone tests
_WKB_POLYGON_Z = 0x80000003


def _make_polygon_ewkb(coords: list[list[float]]) -> bytes:
    """build a minimal EWKB PolygonZ (single outer ring) with SRID 4326."""
    import struct as _struct

    n_rings = 1
    n_points = len(coords)
    buf = _struct.pack(
        "<BII",
        1,
        _WKB_POLYGON_Z | 0x20000000,
        _SRID,
    )
    buf += _struct.pack("<II", n_rings, n_points)
    for pt in coords:
        z = pt[2] if len(pt) > 2 else 0.0
        buf += _struct.pack("<ddd", pt[0], pt[1], z)
    return buf


def _make_safety_zone(name="SZ", zone_type="RESTRICTED", is_active=True):
    """build a mock safety zone with a triangular polygon."""
    sz = MagicMock()
    sz.id = uuid4()
    sz.name = name
    sz.type = zone_type
    sz.is_active = is_active
    sz.altitude_floor = 0.0
    sz.altitude_ceiling = 500.0
    sz.geometry = MagicMock()
    sz.geometry.data = _make_polygon_ewkb(
        [[18.10, 49.69, 0.0], [18.11, 49.69, 0.0], [18.11, 49.70, 0.0], [18.10, 49.69, 0.0]]
    )
    return sz


def _make_obstacle(name="Tower", obs_type="TOWER", height=50.0):
    """build a mock obstacle with polygon boundary."""
    ob = MagicMock()
    ob.id = uuid4()
    ob.name = name
    ob.type = obs_type
    ob.height = height
    ob.buffer_distance = 5.0
    ob.boundary = MagicMock()
    ob.boundary.data = _make_polygon_ewkb(
        [[18.12, 49.68, 0.0], [18.13, 49.68, 0.0], [18.13, 49.69, 0.0], [18.12, 49.68, 0.0]]
    )
    return ob


def _make_surface(identifier="RW22", surface_type="RUNWAY", buffer_distance=15.0):
    """build a mock airfield surface with polygon boundary."""
    surf = MagicMock()
    surf.id = uuid4()
    surf.identifier = identifier
    surf.surface_type = surface_type
    surf.buffer_distance = buffer_distance
    surf.boundary = MagicMock()
    surf.boundary.data = _make_polygon_ewkb(
        [[18.14, 49.70, 0.0], [18.15, 49.70, 0.0], [18.15, 49.71, 0.0], [18.14, 49.70, 0.0]]
    )
    return surf


def _make_airport_with_geozones(active_zone=True, airport_boundary=False, extra_obstacle=False):
    """build a mock airport aggregate with safety zones + obstacles + surfaces."""
    airport = MagicMock()
    airport.elevation = 100.0
    zones = [_make_safety_zone(is_active=active_zone)]
    if airport_boundary:
        zones.append(_make_safety_zone(name="Boundary", zone_type="AIRPORT_BOUNDARY"))
    airport.safety_zones = zones
    obstacles = [_make_obstacle()]
    if extra_obstacle:
        obstacles.append(_make_obstacle(name="Antenna", obs_type="ANTENNA", height=30.0))
    airport.obstacles = obstacles
    airport.surfaces = [_make_surface()]
    return airport


class TestBuildGeozonePayload:
    """tests for the airport -> geozone payload builder."""

    def test_active_zones_included(self):
        """active blocking safety zones are present; airport boundary excluded."""
        airport = _make_airport_with_geozones(airport_boundary=True)

        payload = export_service.build_geozone_payload(airport)

        assert len(payload["safety_zones"]) == 1
        assert payload["safety_zones"][0]["type"] == "RESTRICTED"
        # no AIRPORT_BOUNDARY - shipping it as an exclusion would bar takeoff
        assert not any(z["type"] == "AIRPORT_BOUNDARY" for z in payload["safety_zones"])

    def test_inactive_zones_excluded(self):
        """is_active=False safety zones are filtered out."""
        airport = _make_airport_with_geozones(active_zone=False)

        payload = export_service.build_geozone_payload(airport)

        assert payload["safety_zones"] == []

    def test_obstacles_included(self):
        """every obstacle with a polygon boundary is included."""
        airport = _make_airport_with_geozones(extra_obstacle=True)

        payload = export_service.build_geozone_payload(airport)

        assert len(payload["obstacles"]) == 2
        names = [o["name"] for o in payload["obstacles"]]
        assert "Tower" in names
        assert "Antenna" in names

    def test_runway_buffers_gated_by_flag(self):
        """runway_buffers list stays empty unless include_runway_buffers=True."""
        airport = _make_airport_with_geozones()

        default_payload = export_service.build_geozone_payload(airport)
        assert default_payload["runway_buffers"] == []

        with_buffers = export_service.build_geozone_payload(airport, include_runway_buffers=True)
        assert len(with_buffers["runway_buffers"]) == 1
        assert with_buffers["runway_buffers"][0]["identifier"] == "RW22"


class TestGenerateJsonWithGeozones:
    """tests for generate_json with geozone_payload."""

    def test_no_geozones_key_when_payload_absent(self):
        """without the flag, legacy json output is unchanged."""
        fp = _make_flight_plan(1)

        data = json.loads(export_service.generate_json(fp, "", 0))

        assert "geozones" not in data

    def test_geozones_populated_when_payload_present(self):
        """payload produces a top-level geozones object with all three arrays."""
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        payload = export_service.build_geozone_payload(airport, include_runway_buffers=True)

        data = json.loads(export_service.generate_json(fp, "", 0, geozone_payload=payload))

        assert "geozones" in data
        assert len(data["geozones"]["safety_zones"]) == 1
        assert data["geozones"]["safety_zones"][0]["type"] == "RESTRICTED"
        assert data["geozones"]["safety_zones"][0]["geometry"]["type"] == "Polygon"
        assert len(data["geozones"]["obstacles"]) == 1
        assert len(data["geozones"]["runway_buffers"]) == 1


class TestGenerateMavlinkWithGeozones:
    """tests for mavlink .plan output with embedded fences."""

    def test_plan_json_replaces_wpl_when_payload_present(self):
        """with payload, mavlink emits qgc .plan json with geoFence polygons."""
        fp = _make_flight_plan(2)
        airport = _make_airport_with_geozones()
        payload = export_service.build_geozone_payload(airport)

        result = export_service.generate_mavlink(fp, "", 0, geozone_payload=payload)
        data = json.loads(result)

        assert data["fileType"] == "Plan"
        assert "geoFence" in data
        assert len(data["geoFence"]["polygons"]) >= 2
        # every keep-out polygon is emitted with inclusion=false
        assert all(p["inclusion"] is False for p in data["geoFence"]["polygons"])

    def test_runway_buffers_emit_inclusion_true(self):
        """runway buffers produce inclusion=True polygons while zones stay false."""
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        payload = export_service.build_geozone_payload(airport, include_runway_buffers=True)

        result = export_service.generate_mavlink(fp, "", 0, geozone_payload=payload)
        data = json.loads(result)

        inclusions = [p["inclusion"] for p in data["geoFence"]["polygons"]]
        assert True in inclusions
        assert False in inclusions

    def test_legacy_wpl_output_preserved_without_payload(self):
        """no payload -> classic wpl 110 text format, no regression."""
        fp = _make_flight_plan(2)

        result = export_service.generate_mavlink(fp, "", 0)

        assert result.decode("utf-8").startswith("QGC WPL 110")


class TestGenerateUgcsWithGeozones:
    """tests for ugcs route json with noFlyZones."""

    def test_no_fly_zones_added_when_payload_present(self):
        """payload populates route.noFlyZones and enables checkCustomNfz."""
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        payload = export_service.build_geozone_payload(airport)

        data = json.loads(export_service.generate_ugcs(fp, "", 0, geozone_payload=payload))

        assert "noFlyZones" in data["route"]
        assert len(data["route"]["noFlyZones"]) == 2  # 1 safety zone + 1 obstacle
        assert data["route"]["checkCustomNfz"] is True

    def test_no_payload_preserves_legacy_shape(self):
        """without payload, ugcs output has no noFlyZones key (no regression)."""
        fp = _make_flight_plan(1)

        data = json.loads(export_service.generate_ugcs(fp, "", 0))

        assert "noFlyZones" not in data["route"]
        assert data["route"]["checkCustomNfz"] is False


class TestGenerateKmlWithGeozones:
    """tests for kml keep-out folder."""

    def test_keepout_folder_added_when_payload_present(self):
        """payload adds a Keep-out zones folder with advisory description."""
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        payload = export_service.build_geozone_payload(airport)

        result = export_service.generate_kml(fp, "", 0, geozone_payload=payload)
        text = result.decode("utf-8")

        assert "Keep-out zones" in text
        assert "ADVISORY ONLY" in text
        assert "<Polygon" in text

    def test_no_folder_when_payload_absent(self):
        """no payload -> no keep-out folder."""
        fp = _make_flight_plan(1)

        text = export_service.generate_kml(fp, "", 0).decode("utf-8")

        assert "Keep-out zones" not in text


class TestGenerateKmzWithGeozones:
    """tests for kmz sidecar geozones.kml."""

    def test_sidecar_kml_included_when_payload_present(self):
        """payload adds wpmz/geozones.kml alongside template.kml + waylines.wpml."""
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        payload = export_service.build_geozone_payload(airport)

        result = export_service.generate_kmz(fp, "", 0, geozone_payload=payload)

        with zipfile.ZipFile(BytesIO(result)) as zf:
            names = set(zf.namelist())
            assert "wpmz/geozones.kml" in names
            sidecar = zf.read("wpmz/geozones.kml").decode("utf-8")
        assert "Keep-out zones" in sidecar
        assert "ADVISORY ONLY" in sidecar

    def test_no_sidecar_when_payload_absent(self):
        """legacy kmz archive has no extra files."""
        fp = _make_flight_plan(1)

        result = export_service.generate_kmz(fp, "", 0)

        with zipfile.ZipFile(BytesIO(result)) as zf:
            names = set(zf.namelist())
        assert names == {"wpmz/template.kml", "wpmz/waylines.wpml"}


class TestExportMissionGeozoneGate:
    """tests for export_mission gate logic when include_geozones is set."""

    def _mission(self):
        """capability-enabled mission fixture."""
        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "Geo Mission"
        mission.drone_profile_id = uuid4()
        mission.inspections = []
        mission.takeoff_coordinate = None
        return mission

    @pytest.mark.parametrize("incapable_format", ["WPML", "GPX", "LITCHI", "CSV", "DRONEDEPLOY"])
    def test_unsupported_format_with_flag_raises_400(self, incapable_format):
        """flag + every incapable format => DomainError 400 (guards GEOZONE_CAPABLE_FORMATS)."""
        from app.core.exceptions import DomainError

        mission = self._mission()
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        drone = MagicMock()
        drone.supports_geozone_upload = True
        db = _build_export_db_mock(mission, fp, airport, drone)

        with pytest.raises(DomainError) as exc_info:
            export_service.export_mission(db, uuid4(), [incapable_format], include_geozones=True)
        assert exc_info.value.status_code == 400
        # gate fires before status transition
        mission.transition_to.assert_not_called()
        db.commit.assert_not_called()

    def test_drone_without_capability_raises_400(self):
        """flag + capable format + drone without capability => DomainError 400."""
        from app.core.exceptions import DomainError

        mission = self._mission()
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        drone = MagicMock()
        drone.supports_geozone_upload = False
        db = _build_export_db_mock(mission, fp, airport, drone)

        with pytest.raises(DomainError) as exc_info:
            export_service.export_mission(db, uuid4(), ["JSON"], include_geozones=True)
        assert exc_info.value.status_code == 400
        mission.transition_to.assert_not_called()

    def test_no_drone_profile_raises_400_when_flag_set(self):
        """flag set + mission has no drone_profile_id => DomainError 400."""
        from app.core.exceptions import DomainError

        mission = MagicMock()
        mission.status = "VALIDATED"
        mission.name = "x"
        mission.drone_profile_id = None

        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        db = _build_export_db_mock(mission, fp, airport, None)

        with pytest.raises(DomainError) as exc_info:
            export_service.export_mission(db, uuid4(), ["JSON"], include_geozones=True)
        assert exc_info.value.status_code == 400

    def test_supported_combo_embeds_geozones(self):
        """capable format + capable drone + flag => zones appear in output."""
        mission = self._mission()
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        drone = MagicMock()
        drone.supports_geozone_upload = True
        db = _build_export_db_mock(mission, fp, airport, drone)

        files, _ = export_service.export_mission(db, uuid4(), ["JSON"], include_geozones=True)

        content, _ = next(iter(files.values()))
        data = json.loads(content)
        assert "geozones" in data
        assert len(data["geozones"]["safety_zones"]) == 1
        assert len(data["geozones"]["obstacles"]) == 1
        # runway_buffers flag off by default
        assert data["geozones"]["runway_buffers"] == []

    def test_runway_buffers_without_geozones_raises_400(self):
        """include_runway_buffers=True without include_geozones => DomainError 400."""
        from app.core.exceptions import DomainError

        mission = self._mission()
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        drone = MagicMock()
        drone.supports_geozone_upload = True
        db = _build_export_db_mock(mission, fp, airport, drone)

        with pytest.raises(DomainError) as exc_info:
            export_service.export_mission(db, uuid4(), ["JSON"], include_runway_buffers=True)
        assert exc_info.value.status_code == 400

    def test_mavlink_with_geozones_produces_plan_file(self):
        """mavlink + include_geozones => .plan json output with geoFence block."""
        mission = self._mission()
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        drone = MagicMock()
        drone.supports_geozone_upload = True
        db = _build_export_db_mock(mission, fp, airport, drone)

        files, safe_name = export_service.export_mission(
            db, uuid4(), ["MAVLINK"], include_geozones=True
        )

        filename = list(files.keys())[0]
        assert filename.endswith(".plan")
        content, content_type = files[filename]
        assert content_type == "application/json"
        data = json.loads(content)
        assert data["fileType"] == "Plan"
        assert len(data["geoFence"]["polygons"]) >= 1
        # planned-home altitude must reference airport elevation, not sea level
        assert data["mission"]["plannedHomePosition"][2] == airport.elevation

    def test_mavlink_firmware_type_px4_default(self):
        """px4-manufactured drone produces firmwareType=12 (MAV_AUTOPILOT_PX4)."""
        mission = self._mission()
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        drone = MagicMock()
        drone.supports_geozone_upload = True
        drone.manufacturer = "PX4 Autopilot"
        db = _build_export_db_mock(mission, fp, airport, drone)

        files, _ = export_service.export_mission(db, uuid4(), ["MAVLINK"], include_geozones=True)

        content, _ = next(iter(files.values()))
        data = json.loads(content)
        assert data["mission"]["firmwareType"] == 12

    def test_mavlink_firmware_type_ardupilot(self):
        """ardupilot-manufactured drone produces firmwareType=3 (MAV_AUTOPILOT_ARDUPILOTMEGA)."""
        mission = self._mission()
        fp = _make_flight_plan(1)
        airport = _make_airport_with_geozones()
        drone = MagicMock()
        drone.supports_geozone_upload = True
        drone.manufacturer = "ArduPilot"
        db = _build_export_db_mock(mission, fp, airport, drone)

        files, _ = export_service.export_mission(db, uuid4(), ["MAVLINK"], include_geozones=True)

        content, _ = next(iter(files.values()))
        data = json.loads(content)
        assert data["mission"]["firmwareType"] == 3

    def test_legacy_export_without_flag_unchanged(self):
        """no flag => no geozone handling, no extra queries, legacy output."""
        mission = self._mission()
        fp = _make_flight_plan(1)
        airport = MagicMock()
        airport.elevation = 100.0
        db = _build_export_db_mock(mission, fp, airport, MagicMock())

        files, _ = export_service.export_mission(db, uuid4(), ["JSON"])

        content, _ = next(iter(files.values()))
        data = json.loads(content)
        assert "geozones" not in data
