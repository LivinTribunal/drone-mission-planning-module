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
from app.models.mission import Mission
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
) -> bytes:
    """serialize flight plan waypoints to kmz (zipped kml) format."""
    kml_bytes = generate_kml(flight_plan, mission_name, airport_elevation)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("doc.kml", kml_bytes)

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
    "build": 9205,
    "component": "DATABASE",
}

# ugcs import only accepts "Waypoint" for all segments - Takeoff/Landing
# are internal types assigned by ugcs route planner, not valid for import.


def _deg_to_rad(degrees: float) -> float:
    """convert degrees to radians for ugcs coordinate format."""
    return degrees * math.pi / 180.0


def _build_ugcs_actions(wp) -> list[dict]:
    """build ugcs action list from waypoint fields.

    camera actions (PHOTO_CAPTURE, RECORDING_START, RECORDING, RECORDING_STOP)
    are intentionally excluded - ugcs requires camera mode configuration that
    depends on the vehicle profile. users should configure camera settings
    within ugcs after route import.
    """
    actions = []

    if wp.hover_duration and wp.hover_duration > 0:
        actions.append({"type": "Wait", "interval": wp.hover_duration})

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
        turn_type = "STOP_AND_TURN" if wp.waypoint_type == "HOVER" else "SPLINE"

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

    return ET.tostring(gpx, encoding="unicode", xml_declaration=True).encode("utf-8")


# dji camera action mapping
_DJI_CAMERA_ACTIONS = {
    "PHOTO_CAPTURE": "takePhoto",
    "RECORDING_START": "startRecord",
    "RECORDING_STOP": "stopRecord",
}


def generate_wpml(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
) -> bytes:
    """serialize flight plan to dji wpml (waypoint mission) xml format."""
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    wpml = ET.Element("wpml")

    # mission config
    config = ET.SubElement(wpml, "missionConfig")
    ET.SubElement(config, "flyToWaylineMode").text = "safely"
    ET.SubElement(config, "finishAction").text = "goHome"
    ET.SubElement(config, "maxFlightSpeed").text = "15"
    auto_speed = str(waypoints[0].speed or 5) if waypoints else "5"
    ET.SubElement(config, "autoFlightSpeed").text = auto_speed
    drone_info = ET.SubElement(config, "droneInfo")
    ET.SubElement(drone_info, "droneEnumValue").text = "68"
    ET.SubElement(drone_info, "droneSubEnumValue").text = "0"

    folder = ET.SubElement(wpml, "folder")
    ET.SubElement(folder, "waylineId").text = "0"

    wps_elem = ET.SubElement(folder, "waypoints")
    for wp in waypoints:
        lon, lat, alt = _extract_coords(wp.position)
        agl = alt - airport_elevation

        point = ET.SubElement(wps_elem, "waypoint")
        ET.SubElement(point, "index").text = str(wp.sequence_order)
        loc = ET.SubElement(point, "point")
        ET.SubElement(loc, "latitude").text = f"{lat:.8f}"
        ET.SubElement(loc, "longitude").text = f"{lon:.8f}"
        ET.SubElement(point, "executeHeight").text = f"{agl:.2f}"
        ET.SubElement(point, "waypointSpeed").text = str(wp.speed or 0)

        heading_param = ET.SubElement(point, "waypointHeadingParam")
        ET.SubElement(heading_param, "waypointHeadingMode").text = "smoothTransition"
        ET.SubElement(heading_param, "waypointHeadingAngle").text = str(wp.heading or 0)

        dji_action = _DJI_CAMERA_ACTIONS.get(wp.camera_action)
        if dji_action:
            action_group = ET.SubElement(point, "actionGroup")
            ET.SubElement(action_group, "actionGroupId").text = "0"
            action = ET.SubElement(action_group, "action")
            ET.SubElement(action, "actionActuatorFunc").text = dji_action

    return ET.tostring(wpml, encoding="unicode", xml_declaration=True).encode("utf-8")


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
    """remove characters unsafe for content-disposition header filenames."""
    # strip non-ASCII for RFC 7230 compliance
    sanitized = name.encode("ascii", errors="ignore").decode("ascii")

    # strip control characters (RFC 7230 prohibits octets 0-31 and 127)
    sanitized = re.sub(r"[\x00-\x1f\x7f]", "", sanitized)
    sanitized = re.sub(r'["\\/]', "", sanitized)

    # prevent path traversal sequences
    while ".." in sanitized:
        sanitized = sanitized.replace("..", "")
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

    safe_name = _sanitize_filename(mission.name)

    files: dict[str, tuple[bytes, str]] = {}
    for fmt in formats:
        generator = _EXPORT_GENERATORS[fmt]
        content_type, ext = _EXPORT_CONTENT_TYPES[fmt]
        filename = f"mission_{safe_name}.{ext}"
        files[filename] = (generator(flight_plan, mission.name, airport_elevation), content_type)

    return files, safe_name
