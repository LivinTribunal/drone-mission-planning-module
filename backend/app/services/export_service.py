"""flight plan export file generators"""

import csv
import io
import json
import math
import re
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from uuid import UUID

import simplekml
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import DomainError, NotFoundError
from app.models.airport import Airport
from app.models.flight_plan import FlightPlan
from app.models.mission import DroneProfile, Mission
from app.schemas.geometry import parse_ewkb


def _extract_coords(geom) -> tuple[float, float, float]:
    """extract (lon, lat, alt) from a postgis geometry column."""
    if geom is None:
        raise ValueError("waypoint has no position geometry")
    geojson = parse_ewkb(geom.data)
    coords = geojson.get("coordinates", [0, 0, 0])
    return (coords[0], coords[1], coords[2] if len(coords) > 2 else 0)


def _waypoint_sort_key(wp):
    """sort waypoints by sequence order."""
    return wp.sequence_order


class _UUIDEncoder(json.JSONEncoder):
    """json encoder that handles UUIDs and datetimes."""

    def default(self, o):
        """serialize non-standard types."""
        if isinstance(o, UUID):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


def generate_kml(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
) -> bytes:
    """serialize flight plan waypoints to kml format."""
    kml = simplekml.Kml()
    kml.document.name = f"Flight Plan - {mission_name}" if mission_name else "Flight Plan"

    folder = kml.newfolder(name="Waypoints")
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    coords_list = []
    for wp in waypoints:
        lon, lat, alt = _extract_coords(wp.position)
        # convert absolute MSL altitude to height above ground
        agl = alt - airport_elevation
        coords_list.append((lon, lat, agl))

        pnt = folder.newpoint(
            name=f"WP{wp.sequence_order}",
            coords=[(lon, lat, agl)],
        )
        pnt.description = (
            f"Type: {wp.waypoint_type}\n"
            f"Camera: {wp.camera_action or 'NONE'}\n"
            f"Speed: {wp.speed or 0} m/s\n"
            f"Heading: {wp.heading or 0}°\n"
            f"Altitude MSL: {alt:.1f}m\n"
            f"Altitude AGL: {agl:.1f}m"
        )
        pnt.altitudemode = simplekml.AltitudeMode.relativetoground

    # connecting line
    if len(coords_list) > 1:
        line = kml.newlinestring(name="Flight Path")
        line.coords = coords_list
        line.altitudemode = simplekml.AltitudeMode.relativetoground
        line.style.linestyle.color = simplekml.Color.green
        line.style.linestyle.width = 2

    return kml.kml().encode("utf-8")


def generate_kmz(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
    *,
    mission=None,
    drone_profile=None,
) -> bytes:
    """serialize flight plan to a dji wpmz archive consumable by flight hub 2."""
    template_kml = _build_dji_template_kml(
        flight_plan, mission_name, airport_elevation, mission, drone_profile
    )
    waylines_wpml = _build_dji_waylines_wpml(
        flight_plan, mission_name, airport_elevation, mission, drone_profile
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("wpmz/template.kml", template_kml)
        zf.writestr("wpmz/waylines.wpml", waylines_wpml)

    return buf.getvalue()


def generate_json(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
) -> bytes:
    """serialize flight plan to structured json."""
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    wp_list = []
    for wp in waypoints:
        lon, lat, alt = _extract_coords(wp.position)
        agl = alt - airport_elevation

        camera_target = None
        if wp.camera_target:
            ct_lon, ct_lat, ct_alt = _extract_coords(wp.camera_target)
            camera_target = {
                "latitude": ct_lat,
                "longitude": ct_lon,
                "altitude_msl": ct_alt,
                "altitude_agl": ct_alt - airport_elevation,
            }

        wp_list.append(
            {
                "sequence_order": wp.sequence_order,
                "latitude": lat,
                "longitude": lon,
                "altitude_msl": alt,
                "altitude_agl": agl,
                "speed": wp.speed,
                "heading": wp.heading,
                "camera_action": wp.camera_action,
                "waypoint_type": wp.waypoint_type,
                "camera_target": camera_target,
                "inspection_id": wp.inspection_id,
            }
        )

    data = {
        "mission_name": mission_name,
        "mission_id": flight_plan.mission_id,
        "airport_elevation": airport_elevation,
        "generated_at": flight_plan.generated_at or datetime.now(timezone.utc),
        "total_distance": flight_plan.total_distance,
        "estimated_duration": flight_plan.estimated_duration,
        "waypoints": wp_list,
    }

    return json.dumps(data, indent=2, cls=_UUIDEncoder).encode("utf-8")


# ugcs data model version - matches the version ugcs expects for route import.
# update these values if your ugcs installation uses a different schema version.
_UGCS_VERSION = {
    "major": 5,
    "minor": 16,
    "patch": 1,
    "build": "9205",
    "component": "DATABASE",
}

# ugcs import only accepts "Waypoint" for all segments - Takeoff/Landing
# are internal types assigned by ugcs route planner, not valid for import.


def _deg_to_rad(degrees: float) -> float:
    """convert degrees to radians for ugcs coordinate format."""
    return degrees * math.pi / 180.0


def _build_ugcs_actions(wp) -> list[dict]:
    """build ugcs action list from waypoint fields."""
    actions = []

    if wp.heading is not None:
        actions.append({
            "type": "Heading",
            "heading": _deg_to_rad(wp.heading),
            "relativeToNextWaypoint": False,
            "relativeToNorth": True,
        })

    if wp.gimbal_pitch is not None:
        actions.append({
            "type": "CameraControl",
            "tilt": _deg_to_rad(wp.gimbal_pitch),
            "roll": 0.0,
            "yaw": 0.0,
            "zoomLevel": None,
        })

    if wp.camera_action == "PHOTO_CAPTURE":
        actions.append({"type": "CameraTrigger", "state": "SINGLE_SHOT"})
    elif wp.camera_action == "RECORDING_START":
        actions.append({"type": "CameraTrigger", "state": "START_RECORDING"})
    elif wp.camera_action == "RECORDING_STOP":
        actions.append({"type": "CameraTrigger", "state": "STOP_RECORDING"})

    if wp.hover_duration and wp.hover_duration > 0:
        actions.append({
            "type": "Wait",
            "interval": wp.hover_duration,
            "waitForOperator": False,
            "waitForInstant": False,
        })

    return actions


def generate_ugcs(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
) -> bytes:
    """serialize flight plan to ugcs-compatible json route format."""
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    segments = []
    for wp in waypoints:
        lon, lat, alt = _extract_coords(wp.position)
        agl = alt - airport_elevation
        speed = wp.speed or 0.0

        # ugcs turn type - hover waypoints stop, others fly through
        turn_type = "STOP_AND_TURN" if wp.waypoint_type == "HOVER" else "STRAIGHT"

        segment = {
            "type": "Waypoint",
            "actions": _build_ugcs_actions(wp),
            "point": {
                "latitude": _deg_to_rad(lat),
                "longitude": _deg_to_rad(lon),
                "altitude": agl,
                "altitudeType": "AGL",
            },
            "parameters": {
                "avoidObstacles": False,
                "avoidTerrain": False,
                "speed": speed,
                "wpTurnType": turn_type,
                "altitudeType": "AGL",
                "cornerRadius": None,
            },
        }
        segments.append(segment)

    if flight_plan.generated_at:
        creation_time = int(flight_plan.generated_at.timestamp() * 1000)
    else:
        creation_time = int(datetime.now(timezone.utc).timestamp() * 1000)

    initial_speed = waypoints[0].speed if waypoints else 5.0

    data = {
        "version": _UGCS_VERSION,
        "payloadProfiles": [],
        "vehicleProfiles": [],
        "route": {
            "name": mission_name or "Untitled Route",
            "creationTime": creation_time,
            "scheduledTime": None,
            "startDelay": None,
            "vehicleProfile": None,
            "trajectoryType": None,
            "safeAltitude": 50.0,
            "maxAltitude": 1500.0,
            "initialSpeed": initial_speed or 5.0,
            "maxSpeed": None,
            "failsafes": {
                "rcLost": "GO_HOME",
                "gpsLost": None,
                "lowBattery": None,
                "datalinkLost": None,
            },
            "checkAerodromeNfz": False,
            "checkCustomNfz": False,
            "segments": segments,
            "takeoffHeight": None,
            "cornerRadius": 20.0,
        },
    }

    # ugcs uses java jackson serializer - match its formatting
    return json.dumps(data, indent=2, separators=(",", " : "), cls=_UUIDEncoder).encode("utf-8")


# mavlink command codes
_MAV_CMD_NAV_WAYPOINT = 16
_MAV_CMD_NAV_TAKEOFF = 22
_MAV_CMD_NAV_LAND = 21
_MAV_CMD_IMAGE_START_CAPTURE = 2000
_MAV_CMD_VIDEO_START_CAPTURE = 2500
_MAV_CMD_VIDEO_STOP_CAPTURE = 2501

# MAV_FRAME_GLOBAL_RELATIVE_ALT
_MAV_FRAME = 3

_WAYPOINT_TYPE_COMMANDS = {
    "TAKEOFF": _MAV_CMD_NAV_TAKEOFF,
    "LANDING": _MAV_CMD_NAV_LAND,
}

_CAMERA_ACTION_COMMANDS = {
    "RECORDING_START": _MAV_CMD_VIDEO_START_CAPTURE,
    "RECORDING_STOP": _MAV_CMD_VIDEO_STOP_CAPTURE,
    "PHOTO_CAPTURE": _MAV_CMD_IMAGE_START_CAPTURE,
}


def generate_mavlink(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
) -> bytes:
    """serialize flight plan to qgc wpl 110 mavlink waypoint format."""
    lines = ["QGC WPL 110"]
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    seq = 0
    for i, wp in enumerate(waypoints):
        lon, lat, alt = _extract_coords(wp.position)
        # mavlink uses relative altitude (AGL)
        agl = alt - airport_elevation
        command = _WAYPOINT_TYPE_COMMANDS.get(wp.waypoint_type, _MAV_CMD_NAV_WAYPOINT)

        # first waypoint is current
        current = 1 if seq == 0 else 0

        # p1 = hold time for hover waypoints
        p1 = wp.hover_duration or 0

        line = (
            f"{seq}\t{current}\t{_MAV_FRAME}\t{command}\t"
            f"{p1}\t0\t0\t{wp.heading or 0}\t"
            f"{lat}\t{lon}\t{agl}\t1"
        )
        lines.append(line)
        seq += 1

        # camera command after navigation waypoint
        cam_cmd = _CAMERA_ACTION_COMMANDS.get(wp.camera_action)
        if cam_cmd:
            cam_line = f"{seq}\t0\t0\t{cam_cmd}\t0\t0\t0\t0\t0\t0\t0\t1"
            lines.append(cam_line)
            seq += 1

    return "\n".join(lines).encode("utf-8")


def generate_csv_export(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
) -> bytes:
    """serialize flight plan to csv format."""
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "sequence",
            "latitude",
            "longitude",
            "altitude_msl",
            "altitude_agl",
            "speed",
            "heading",
            "camera_action",
            "waypoint_type",
        ]
    )

    for wp in waypoints:
        lon, lat, alt = _extract_coords(wp.position)
        agl = alt - airport_elevation
        writer.writerow(
            [
                wp.sequence_order,
                f"{lat:.8f}",
                f"{lon:.8f}",
                f"{alt:.2f}",
                f"{agl:.2f}",
                wp.speed or 0,
                wp.heading or 0,
                wp.camera_action or "NONE",
                wp.waypoint_type,
            ]
        )

    return buf.getvalue().encode("utf-8")


def generate_gpx(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
) -> bytes:
    """serialize flight plan to gpx 1.1 format."""
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    gpx = ET.Element(
        "gpx",
        {
            "version": "1.1",
            "creator": "TarmacView",
            "xmlns": "http://www.topografix.com/GPX/1/1",
        },
    )

    metadata = ET.SubElement(gpx, "metadata")
    ET.SubElement(metadata, "name").text = mission_name or "Flight Plan"
    ET.SubElement(metadata, "time").text = datetime.now(timezone.utc).isoformat()

    # waypoint elements
    for wp in waypoints:
        lon, lat, alt = _extract_coords(wp.position)
        wpt = ET.SubElement(gpx, "wpt", {"lat": f"{lat:.8f}", "lon": f"{lon:.8f}"})
        ET.SubElement(wpt, "ele").text = f"{alt:.2f}"
        ET.SubElement(wpt, "name").text = f"WP{wp.sequence_order}"
        ET.SubElement(wpt, "desc").text = f"{wp.waypoint_type} {wp.camera_action or 'NONE'}"

    # track element
    trk = ET.SubElement(gpx, "trk")
    ET.SubElement(trk, "name").text = mission_name or "Flight Plan"
    trkseg = ET.SubElement(trk, "trkseg")

    for wp in waypoints:
        lon, lat, alt = _extract_coords(wp.position)
        trkpt = ET.SubElement(trkseg, "trkpt", {"lat": f"{lat:.8f}", "lon": f"{lon:.8f}"})
        ET.SubElement(trkpt, "ele").text = f"{alt:.2f}"

    return ET.tostring(gpx, encoding="utf-8", xml_declaration=True)


# dji wpmz 1.0.6 - flight hub 2 / pilot 2 schema used by real dji exports
_KML_NS = "http://www.opengis.net/kml/2.2"
_WPML_NS = "http://www.dji.com/wpmz/1.0.6"
_KML = f"{{{_KML_NS}}}"
_WPML = f"{{{_WPML_NS}}}"

ET.register_namespace("", _KML_NS)
ET.register_namespace("wpml", _WPML_NS)

# dji camera action mapping - values match actionActuatorFunc in the dji wpml schema
_DJI_CAMERA_ACTIONS = {
    "PHOTO_CAPTURE": "takePhoto",
    "RECORDING_START": "startRecord",
    "RECORDING_STOP": "stopRecord",
}

# drone + payload enum. forced to m30t (99/1) + h30t-integrated (89/0).
#
# we've tested two fh2 exports from the user - one labeled APCH, one PAPI 22
# exported with an m4t selected - and both come back with droneEnum=99/1 and
# payloadEnum=89. fh2 evidently normalizes every export to m30t regardless of
# which drone is selected, and it only renders the preview gimbal-follow
# behavior for drone enums it knows (m30t works; m4t 100/1 leaves the camera
# locked at absolute north in the preview and presumably at flight time too).
#
# until fh2 ships official support for the m4 series, we write the m30t enum
# set for every mission so the file is renderable. actual flight behavior is
# driven by the aircraft firmware interpreting the wpml actions, not by the
# drone enum, so an m4t in the field still flies the route correctly.
_DJI_FALLBACK_ENUMS: tuple[str, str, str, str] = ("99", "1", "89", "0")


def _dji_enums_for(drone_profile) -> tuple[str, str, str, str]:
    """return the dji drone + payload enum tuple for the mission.

    currently always returns m30t (99/1/89/0) - the only enum set fh2
    currently renders correctly. the drone_profile argument is retained for
    future per-drone overrides once fh2 supports more drones.
    """
    del drone_profile  # intentionally unused for now
    return _DJI_FALLBACK_ENUMS


def _kml_tag(name: str) -> str:
    """qualify an element name with the kml namespace."""
    return f"{_KML}{name}"


def _wpml_tag(name: str) -> str:
    """qualify an element name with the dji wpml namespace."""
    return f"{_WPML}{name}"


def _sub_text(parent, tag: str, text: str):
    """create a child element in the wpml namespace with text content."""
    el = ET.SubElement(parent, _wpml_tag(tag))
    el.text = text
    return el


def _takeoff_ref_point(mission, flight_plan) -> str:
    """build the 'lat,lon,alt' string for wpml:takeOffRefPoint.

    dji schema nominally calls the z-field HAE, but fh2 anchors its ground
    reference and waypoint rendering against this value directly. writing a
    consistent MSL value here (matching executeHeight + heightMode=EGM96)
    keeps the whole route positioned against the same datum; introducing a
    geoid offset causes fh2 to render waypoints ~44 m above ground.

    prefers mission.takeoff_coordinate; falls back to the first waypoint.
    """
    takeoff = getattr(mission, "takeoff_coordinate", None) if mission else None
    if takeoff is not None:
        lon, lat, alt = _extract_coords(takeoff)
        return f"{lat:.6f},{lon:.6f},{alt:.6f}"
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)
    if waypoints:
        lon, lat, alt = _extract_coords(waypoints[0].position)
        return f"{lat:.6f},{lon:.6f},{alt:.6f}"
    return "0.000000,0.000000,0.000000"


def _append_mission_config(doc, flight_plan, mission, drone_profile, *, in_waylines: bool) -> None:
    """build wpml:missionConfig. takeOffRefPoint belongs to template.kml only."""
    drone_enum, drone_sub, payload_enum, payload_sub = _dji_enums_for(drone_profile)

    config = ET.SubElement(doc, _wpml_tag("missionConfig"))
    _sub_text(config, "flyToWaylineMode", "safely")
    _sub_text(config, "finishAction", "goHome")
    _sub_text(config, "exitOnRCLost", "goContinue")
    _sub_text(config, "executeRCLostAction", "goBack")
    _sub_text(config, "takeOffSecurityHeight", "20")
    if not in_waylines:
        # takeOffRefPoint lives in template.kml only; the real dji sample omits
        # it from waylines.wpml to keep the executable file minimal.
        _sub_text(config, "takeOffRefPoint", _takeoff_ref_point(mission, flight_plan))
        _sub_text(config, "takeOffRefPointAGLHeight", "0")
    _sub_text(config, "globalTransitionalSpeed", "15")
    _sub_text(config, "globalRTHHeight", "100")

    drone_info = ET.SubElement(config, _wpml_tag("droneInfo"))
    _sub_text(drone_info, "droneEnumValue", drone_enum)
    _sub_text(drone_info, "droneSubEnumValue", drone_sub)

    _sub_text(config, "waylineAvoidLimitAreaMode", "0")

    payload_info = ET.SubElement(config, _wpml_tag("payloadInfo"))
    _sub_text(payload_info, "payloadEnumValue", payload_enum)
    _sub_text(payload_info, "payloadSubEnumValue", payload_sub)
    _sub_text(payload_info, "payloadPositionIndex", "0")


_AIMED_WAYPOINT_TYPES = {"MEASUREMENT", "HOVER"}


def _aims_at_target(wp) -> bool:
    """true when the waypoint needs to rotate the aircraft toward a target.

    only measurement/hover points have a camera target - takeoff, landing,
    and transit points should keep the aircraft pointing along the flight
    direction (followWayline), not rotated toward the stored heading.
    """
    return wp.waypoint_type in _AIMED_WAYPOINT_TYPES and wp.camera_target is not None


def _normalize_heading(heading: float) -> float:
    """wrap a compass bearing into dji's [-180, 180] range.

    our bearing_between returns [0, 360); dji's aircraftHeading and
    gimbalYawRotateAngle expect [-180, 180]. a raw 202° becomes -158°
    (same physical direction, valid input).
    """
    return ((heading + 180.0) % 360.0) - 180.0


def _append_heading_param(parent, wp, *, in_waylines: bool) -> None:
    """attach waypointHeadingParam - followWayline across the board.

    matches the working fh2 export pattern: placemark heading follows the
    wayline, and the rotateYaw action at each reachPoint rotates the aircraft
    to the target bearing. the gimbal then tracks the body via the m30
    default Follow mode. this avoids the 'camera locked to north' issue where
    smoothTransition + explicit yaw commands stopped fh2 from simulating
    the gimbal follow.
    """
    _ = wp  # heading angle is always 0 at the placemark level; rotateYaw handles aim
    heading_param = ET.SubElement(parent, _wpml_tag("waypointHeadingParam"))
    _sub_text(heading_param, "waypointHeadingMode", "followWayline")
    _sub_text(heading_param, "waypointHeadingAngle", "0")
    _sub_text(heading_param, "waypointPoiPoint", "0.000000,0.000000,0.000000")
    if in_waylines:
        _sub_text(heading_param, "waypointHeadingAngleEnable", "0")
    _sub_text(heading_param, "waypointHeadingPathMode", "followBadArc")
    _sub_text(heading_param, "waypointHeadingPoiIndex", "0")


def _append_turn_param(parent) -> None:
    """attach waypointTurnParam - stop at each point for inspection missions."""
    turn_param = ET.SubElement(parent, _wpml_tag("waypointTurnParam"))
    _sub_text(turn_param, "waypointTurnMode", "toPointAndStopWithDiscontinuityCurvature")
    _sub_text(turn_param, "waypointTurnDampingDist", "0.2")


def _append_action_group(placemark, wp, index: int) -> None:
    """emit a wpml:actionGroup covering yaw, gimbal, hover, and camera actions.

    rotateYaw + gimbalRotate are only emitted for measurement/hover waypoints
    with a camera target. takeoff / landing / transit points keep the nose
    along flight direction and the gimbal in its default position.

    order matches real dji exports: rotateYaw -> gimbalRotate -> hover -> camera.
    """
    camera_func = _DJI_CAMERA_ACTIONS.get(wp.camera_action)
    hover_secs = wp.hover_duration or 0
    aims = _aims_at_target(wp)
    heading_val = wp.heading if aims else None
    gimbal_pitch = getattr(wp, "gimbal_pitch", None) if aims else None

    if not camera_func and hover_secs <= 0 and heading_val is None and gimbal_pitch is None:
        return

    group = ET.SubElement(placemark, _wpml_tag("actionGroup"))
    _sub_text(group, "actionGroupId", str(index))
    _sub_text(group, "actionGroupStartIndex", str(index))
    _sub_text(group, "actionGroupEndIndex", str(index))
    _sub_text(group, "actionGroupMode", "sequence")

    trigger = ET.SubElement(group, _wpml_tag("actionTrigger"))
    _sub_text(trigger, "actionTriggerType", "reachPoint")

    action_id = 0

    if heading_val is not None:
        heading_val = _normalize_heading(heading_val)
        action = ET.SubElement(group, _wpml_tag("action"))
        _sub_text(action, "actionId", str(action_id))
        _sub_text(action, "actionActuatorFunc", "rotateYaw")
        params = ET.SubElement(action, _wpml_tag("actionActuatorFuncParam"))
        _sub_text(params, "aircraftHeading", f"{heading_val:g}")
        # path mode must match the sign of the target heading so the
        # rotation takes the short way round. hardcoding counterClockwise
        # with a positive target (e.g. 172°) forces a 188° wrap-around
        # that fh2/firmware refuses to execute, leaving the aircraft +
        # gimbal at their startup yaw (absolute north).
        path_mode = "counterClockwise" if heading_val < 0 else "clockwise"
        _sub_text(params, "aircraftPathMode", path_mode)
        action_id += 1

    if gimbal_pitch is not None:
        action = ET.SubElement(group, _wpml_tag("action"))
        _sub_text(action, "actionId", str(action_id))
        _sub_text(action, "actionActuatorFunc", "gimbalRotate")
        params = ET.SubElement(action, _wpml_tag("actionActuatorFuncParam"))
        # matches fh2's own export: gimbal pitch is commanded, yaw is disabled.
        # the aircraft's rotateYaw action (emitted just before this) aims the
        # nose at the target; the gimbal then follows the body via the m30
        # default Follow mode. explicit yaw commands here break fh2's gimbal-
        # follow simulation and lock the camera to the commanded absolute angle.
        _sub_text(params, "gimbalHeadingYawBase", "north")
        _sub_text(params, "gimbalRotateMode", "absoluteAngle")
        _sub_text(params, "gimbalPitchRotateEnable", "1")
        _sub_text(params, "gimbalPitchRotateAngle", f"{gimbal_pitch:g}")
        _sub_text(params, "gimbalRollRotateEnable", "0")
        _sub_text(params, "gimbalRollRotateAngle", "0")
        _sub_text(params, "gimbalYawRotateEnable", "0")
        _sub_text(params, "gimbalYawRotateAngle", "0")
        _sub_text(params, "gimbalRotateTimeEnable", "0")
        _sub_text(params, "gimbalRotateTime", "0")
        _sub_text(params, "payloadPositionIndex", "0")
        action_id += 1

    if hover_secs > 0:
        action = ET.SubElement(group, _wpml_tag("action"))
        _sub_text(action, "actionId", str(action_id))
        _sub_text(action, "actionActuatorFunc", "hover")
        params = ET.SubElement(action, _wpml_tag("actionActuatorFuncParam"))
        _sub_text(params, "hoverTime", f"{hover_secs:g}")
        action_id += 1

    if camera_func:
        action = ET.SubElement(group, _wpml_tag("action"))
        _sub_text(action, "actionId", str(action_id))
        _sub_text(action, "actionActuatorFunc", camera_func)
        params = ET.SubElement(action, _wpml_tag("actionActuatorFuncParam"))
        _sub_text(params, "payloadPositionIndex", "0")
        if camera_func == "takePhoto":
            _sub_text(params, "fileSuffix", "")
            _sub_text(params, "useGlobalPayloadLensIndex", "1")
        elif camera_func == "startRecord":
            _sub_text(params, "useGlobalPayloadLensIndex", "1")


def _append_placemark(folder, wp, airport_elevation: float, *, in_waylines: bool) -> None:
    """add a wpml waypoint placemark.

    waylines executeHeight is written as AGL relative to the takeoff point,
    paired with executeHeightMode=relativeToStartPoint so fh2's renderer
    anchors against the takeoff's screen-space position (no reliance on
    fh2's terrain dem, which is unreliable for non-commercial airports).

    template ellipsoidHeight / height stay as raw msl - they're only used
    for preview and stay consistent with takeOffRefPoint.
    """
    lon, lat, alt = _extract_coords(wp.position)
    msl = alt
    agl = alt - airport_elevation

    placemark = ET.SubElement(folder, _kml_tag("Placemark"))
    point = ET.SubElement(placemark, _kml_tag("Point"))
    ET.SubElement(point, _kml_tag("coordinates")).text = f"{lon:.8f},{lat:.8f}"

    _sub_text(placemark, "index", str(wp.sequence_order))

    if in_waylines:
        _sub_text(placemark, "executeHeight", f"{agl:.6f}")
    else:
        _sub_text(placemark, "ellipsoidHeight", f"{msl:.6f}")
        _sub_text(placemark, "height", f"{msl:.6f}")

    _sub_text(placemark, "waypointSpeed", f"{wp.speed or 0:g}")
    _append_heading_param(placemark, wp, in_waylines=in_waylines)
    _append_turn_param(placemark)

    # template placemark inherits all globals (speed, heading, turn). waylines
    # placemark omits the useGlobal* flags (it's already executable). matches
    # the working fh2 export exactly.
    if not in_waylines:
        _sub_text(placemark, "useGlobalSpeed", "1")
        _sub_text(placemark, "useGlobalHeadingParam", "1")
        _sub_text(placemark, "useGlobalTurnParam", "1")
    _sub_text(placemark, "useStraightLine", "1")

    _append_action_group(placemark, wp, wp.sequence_order)

    if in_waylines:
        # waylines always carries waypointGimbalHeadingParam with zeros, per
        # the working fh2 export. with gimbalPitchMode=manual this block is
        # informational; the actual aim comes from the actionGroup. template
        # placemarks omit this block entirely.
        gimbal_param = ET.SubElement(placemark, _wpml_tag("waypointGimbalHeadingParam"))
        _sub_text(gimbal_param, "waypointGimbalPitchAngle", "0")
        _sub_text(gimbal_param, "waypointGimbalYawAngle", "0")

    _sub_text(placemark, "isRisky", "0")

    if in_waylines:
        _sub_text(placemark, "waypointWorkType", "0")


def _append_payload_param(folder) -> None:
    """attach the Folder-trailing wpml:payloadParam block.

    values mirror the dji pilot 2 defaults for an h20t-class inspection payload;
    flight hub 2 rejects the file if this block is missing.
    """
    payload = ET.SubElement(folder, _wpml_tag("payloadParam"))
    _sub_text(payload, "payloadPositionIndex", "0")
    _sub_text(payload, "focusMode", "firstPoint")
    _sub_text(payload, "meteringMode", "average")
    _sub_text(payload, "returnMode", "singleReturnStrongest")
    _sub_text(payload, "samplingRate", "240000")
    _sub_text(payload, "scanningMode", "repetitive")
    _sub_text(payload, "imageFormat", "visable")
    _sub_text(payload, "photoSize", "default_l")


def _max_agl(waypoints, airport_elevation: float) -> float:
    """highest AGL across the waypoint set, or 100m fallback when empty."""
    heights = []
    for wp in waypoints:
        try:
            _, _, alt = _extract_coords(wp.position)
            heights.append(alt - airport_elevation)
        except ValueError:
            continue
    return max(heights) if heights else 100.0


def _build_dji_template_kml(
    flight_plan: FlightPlan,
    mission_name: str,
    airport_elevation: float,
    mission=None,
    drone_profile=None,
) -> bytes:
    """build wpmz/template.kml - mission config plus reference waypoint template."""
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)
    auto_speed = f"{waypoints[0].speed or 5:g}" if waypoints else "10"
    # keep global ceiling above the highest waypoint so the drone honors per-point altitude
    global_height = str(max(50, int(_max_agl(waypoints, airport_elevation) + 5)))
    now = datetime.now(timezone.utc)
    timestamp_ms = str(int(now.timestamp() * 1000))

    kml = ET.Element(_kml_tag("kml"))
    doc = ET.SubElement(kml, _kml_tag("Document"))
    _sub_text(doc, "author", "TarmacView")
    _sub_text(doc, "createTime", timestamp_ms)
    _sub_text(doc, "updateTime", timestamp_ms)

    _append_mission_config(doc, flight_plan, mission, drone_profile, in_waylines=False)

    folder = ET.SubElement(doc, _kml_tag("Folder"))
    _sub_text(folder, "templateType", "waypoint")
    _sub_text(folder, "templateId", "0")

    coord_sys = ET.SubElement(folder, _wpml_tag("waylineCoordinateSysParam"))
    _sub_text(coord_sys, "coordinateMode", "WGS84")
    _sub_text(coord_sys, "heightMode", "EGM96")

    _sub_text(folder, "autoFlightSpeed", auto_speed)
    _sub_text(folder, "globalHeight", global_height)
    _sub_text(folder, "caliFlightEnable", "0")
    # matches the working fh2 export - 'manual' means the gimbal is driven by
    # the actionGroup gimbalRotate actions (not by waypointGimbalHeadingParam),
    # which is what rotates the camera into target direction at each waypoint.
    _sub_text(folder, "gimbalPitchMode", "manual")

    global_heading = ET.SubElement(folder, _wpml_tag("globalWaypointHeadingParam"))
    _sub_text(global_heading, "waypointHeadingMode", "followWayline")
    _sub_text(global_heading, "waypointHeadingAngle", "0")
    _sub_text(global_heading, "waypointPoiPoint", "0.000000,0.000000,0.000000")
    _sub_text(global_heading, "waypointHeadingPathMode", "followBadArc")
    _sub_text(global_heading, "waypointHeadingPoiIndex", "0")

    _sub_text(folder, "globalWaypointTurnMode", "toPointAndStopWithDiscontinuityCurvature")
    _sub_text(folder, "globalUseStraightLine", "1")

    for wp in waypoints:
        _append_placemark(folder, wp, airport_elevation, in_waylines=False)

    _append_payload_param(folder)

    return ET.tostring(kml, encoding="utf-8", xml_declaration=True)


def _build_dji_waylines_wpml(
    flight_plan: FlightPlan,
    mission_name: str,
    airport_elevation: float,
    mission=None,
    drone_profile=None,
) -> bytes:
    """build wpmz/waylines.wpml - executable wayline consumed by the aircraft."""
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)
    auto_speed = f"{waypoints[0].speed or 5:g}" if waypoints else "10"

    kml = ET.Element(_kml_tag("kml"))
    doc = ET.SubElement(kml, _kml_tag("Document"))

    _append_mission_config(doc, flight_plan, mission, drone_profile, in_waylines=True)

    folder = ET.SubElement(doc, _kml_tag("Folder"))
    _sub_text(folder, "templateId", "0")
    # relativeToStartPoint: executeHeight is AGL relative to takeoff. fh2
    # anchors against the takeoff's screen position in its 3d view so we
    # don't depend on fh2's DEM being accurate at the airport (it isn't,
    # for non-commercial fields like JARO). WGS84 / EGM96 modes asked fh2
    # to place waypoints at absolute ellipsoidal or geoid heights, which
    # rendered either under ground or floating above it depending on the
    # dem quality at that coordinate.
    _sub_text(folder, "executeHeightMode", "relativeToStartPoint")
    _sub_text(folder, "waylineId", "0")
    if flight_plan.total_distance is not None:
        _sub_text(folder, "distance", f"{flight_plan.total_distance:g}")
    if flight_plan.estimated_duration is not None:
        _sub_text(folder, "duration", f"{flight_plan.estimated_duration:g}")
    _sub_text(folder, "autoFlightSpeed", auto_speed)
    _sub_text(folder, "realTimeFollowSurfaceByFov", "0")

    for wp in waypoints:
        _append_placemark(folder, wp, airport_elevation, in_waylines=True)

    return ET.tostring(kml, encoding="utf-8", xml_declaration=True)


def generate_wpml(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
    *,
    mission=None,
    drone_profile=None,
) -> bytes:
    """serialize flight plan to dji waylines.wpml - the executable wayline file."""
    return _build_dji_waylines_wpml(
        flight_plan, mission_name, airport_elevation, mission, drone_profile
    )


# litchi camera action codes
_LITCHI_ACTION_TYPES = {
    "PHOTO_CAPTURE": 1,
    "RECORDING_START": 2,
    "RECORDING_STOP": 3,
}


def generate_litchi_csv(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
) -> bytes:
    """serialize flight plan to litchi mission hub csv format."""
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "latitude",
            "longitude",
            "altitude(m)",
            "heading(deg)",
            "curvesize(m)",
            "rotationdir",
            "gimbalmode",
            "gimbalpitchangle",
            "actiontype1",
            "actionparam1",
            "altitudemode",
            "speed(m/s)",
            "poi_latitude",
            "poi_longitude",
            "poi_altitude(m)",
            "poi_altitudemode",
            "photo_timeinterval",
            "photo_distinterval",
        ]
    )

    for wp in waypoints:
        lon, lat, alt = _extract_coords(wp.position)
        agl = alt - airport_elevation
        action_type = _LITCHI_ACTION_TYPES.get(wp.camera_action, -1)
        curvesize = 0 if wp.waypoint_type == "HOVER" else 5
        gimbal_mode = 2 if wp.gimbal_pitch is not None else 0

        writer.writerow(
            [
                f"{lat:.8f}",
                f"{lon:.8f}",
                f"{agl:.2f}",
                f"{wp.heading or 0:.1f}",
                curvesize,
                0,
                gimbal_mode,
                f"{wp.gimbal_pitch or 0:.1f}",
                action_type,
                0,
                0,
                wp.speed or 0,
                0,
                0,
                0,
                0,
                -1,
                -1,
            ]
        )

    return buf.getvalue().encode("utf-8")


def generate_dronedeploy(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
) -> bytes:
    """serialize flight plan to dronedeploy json format."""
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    dd_action_map = {
        "PHOTO_CAPTURE": {"type": "photo"},
        "RECORDING_START": {"type": "videoStart"},
        "RECORDING_STOP": {"type": "videoStop"},
    }

    wp_list = []
    for wp in waypoints:
        lon, lat, alt = _extract_coords(wp.position)
        agl = alt - airport_elevation

        actions = []
        dd_action = dd_action_map.get(wp.camera_action)
        if dd_action:
            actions.append(dd_action)

        wp_list.append(
            {
                "lat": lat,
                "lng": lon,
                "alt": agl,
                "speed": wp.speed or 0,
                "heading": wp.heading or 0,
                "actions": actions,
            }
        )

    data = {
        "version": 1,
        "name": mission_name or "Flight Plan",
        "waypoints": wp_list,
    }

    return json.dumps(data, indent=2, cls=_UUIDEncoder).encode("utf-8")


# content types for export formats
_EXPORT_CONTENT_TYPES = {
    "KML": ("application/vnd.google-earth.kml+xml", "kml"),
    "KMZ": ("application/vnd.google-earth.kmz", "kmz"),
    "JSON": ("application/json", "json"),
    "MAVLINK": ("text/plain", "waypoints"),
    "UGCS": ("application/json", "ugcs.json"),
    "WPML": ("application/xml", "wpml"),
    "CSV": ("text/csv", "csv"),
    "GPX": ("application/gpx+xml", "gpx"),
    "LITCHI": ("text/csv", "litchi.csv"),
    "DRONEDEPLOY": ("application/json", "dronedeploy.json"),
}

_EXPORT_GENERATORS = {
    "KML": generate_kml,
    "KMZ": generate_kmz,
    "JSON": generate_json,
    "MAVLINK": generate_mavlink,
    "UGCS": generate_ugcs,
    "WPML": generate_wpml,
    "CSV": generate_csv_export,
    "GPX": generate_gpx,
    "LITCHI": generate_litchi_csv,
    "DRONEDEPLOY": generate_dronedeploy,
}


def _sanitize_filename(name: str) -> str:
    """produce a base filename safe for content-disposition AND dji flight hub 2.

    fh2 rejects flight route names containing < > : " / | ? * . _ — so we
    strip those (plus backslash and control chars), collapse whitespace, and
    fall back to "mission" when everything gets stripped away.
    """
    sanitized = name.encode("ascii", errors="ignore").decode("ascii")

    # control chars (RFC 7230 prohibits 0-31 and 127)
    sanitized = re.sub(r"[\x00-\x1f\x7f]", "", sanitized)
    # fh2-banned chars + backslash - replace with space so adjacent words do not merge
    sanitized = re.sub(r'[<>:"/|?*._\\]', " ", sanitized)
    # collapse repeated whitespace into a single space
    sanitized = re.sub(r"\s+", " ", sanitized)

    return sanitized.strip() or "mission"


def export_mission(
    db: Session, mission_id: UUID, formats: list[str]
) -> tuple[dict[str, tuple[bytes, str]], str]:
    """transition mission to EXPORTED and generate requested export files.

    returns (files_dict, sanitized_mission_name) where files_dict maps
    filename -> (content_bytes, content_type).
    """
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise NotFoundError("mission not found")

    # reject invalid statuses before querying dependent data
    if mission.status not in ("VALIDATED", "EXPORTED"):
        raise DomainError(
            f"mission must be VALIDATED or EXPORTED to export, current: {mission.status}",
            status_code=409,
        )

    # verify flight plan and airport exist before committing status transition
    flight_plan = (
        db.query(FlightPlan)
        .options(joinedload(FlightPlan.waypoints))
        .filter(FlightPlan.mission_id == mission_id)
        .first()
    )
    if not flight_plan:
        raise NotFoundError("no flight plan found for this mission")

    airport = db.query(Airport).filter(Airport.id == flight_plan.airport_id).first()
    if not airport or airport.elevation is None:
        raise DomainError(
            "airport elevation is required for export - AGL altitudes cannot be calculated",
            status_code=422,
        )
    airport_elevation = airport.elevation

    unsupported = [fmt for fmt in formats if fmt not in _EXPORT_GENERATORS]
    if unsupported:
        raise DomainError(
            f"unsupported export format(s): {', '.join(unsupported)}", status_code=422
        )

    if mission.status == "VALIDATED":
        try:
            mission.transition_to("EXPORTED")
            db.commit()
            db.refresh(mission)
        except ValueError as e:
            raise DomainError("invalid status transition", status_code=409) from e

    scope = mission.flight_plan_scope or "FULL"
    scope_suffix = {
        "NO_TAKEOFF_LANDING": " no tl",
        "MEASUREMENTS_ONLY": " measurements only",
    }.get(scope, "")
    safe_name = _sanitize_filename(mission.name + scope_suffix)

    # load the drone profile for dji enum lookup - cheap, single-row query, only
    # needed for KMZ/WPML but simpler than branching inside the loop.
    drone_profile = None
    if mission.drone_profile_id is not None:
        drone_profile = (
            db.query(DroneProfile).filter(DroneProfile.id == mission.drone_profile_id).first()
        )

    files: dict[str, tuple[bytes, str]] = {}
    for fmt in formats:
        generator = _EXPORT_GENERATORS[fmt]
        content_type, ext = _EXPORT_CONTENT_TYPES[fmt]
        filename = f"{safe_name}.{ext}"
        if fmt in ("KMZ", "WPML"):
            content = generator(
                flight_plan,
                mission.name,
                airport_elevation,
                mission=mission,
                drone_profile=drone_profile,
            )
        else:
            content = generator(flight_plan, mission.name, airport_elevation)
        files[filename] = (content, content_type)

    return files, safe_name
