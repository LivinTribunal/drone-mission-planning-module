"""flight plan export file generators"""

import io
import json
import re
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


# mavlink command codes
_MAV_CMD_NAV_WAYPOINT = 16
_MAV_CMD_NAV_TAKEOFF = 22
_MAV_CMD_NAV_LAND = 21

# MAV_FRAME_GLOBAL_RELATIVE_ALT
_MAV_FRAME = 3

_WAYPOINT_TYPE_COMMANDS = {
    "TAKEOFF": _MAV_CMD_NAV_TAKEOFF,
    "LANDING": _MAV_CMD_NAV_LAND,
}


def generate_mavlink(
    flight_plan: FlightPlan,
    mission_name: str = "",
    airport_elevation: float = 0,
) -> bytes:
    """serialize flight plan to qgc wpl 110 mavlink waypoint format."""
    lines = ["QGC WPL 110"]
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    for i, wp in enumerate(waypoints):
        lon, lat, alt = _extract_coords(wp.position)
        # mavlink uses relative altitude (AGL)
        agl = alt - airport_elevation
        command = _WAYPOINT_TYPE_COMMANDS.get(wp.waypoint_type, _MAV_CMD_NAV_WAYPOINT)

        # first waypoint is current
        current = 1 if i == 0 else 0

        # p1 = hold time for hover waypoints
        p1 = wp.hover_duration or 0

        line = (
            f"{i}\t{current}\t{_MAV_FRAME}\t{command}\t"
            f"{p1}\t0\t0\t{wp.heading or 0}\t"
            f"{lat}\t{lon}\t{agl}\t1"
        )
        lines.append(line)

    return "\n".join(lines).encode("utf-8")


# content types for export formats
_EXPORT_CONTENT_TYPES = {
    "KML": ("application/vnd.google-earth.kml+xml", "kml"),
    "KMZ": ("application/vnd.google-earth.kmz", "kmz"),
    "JSON": ("application/json", "json"),
    "MAVLINK": ("text/plain", "waypoints"),
}

_EXPORT_GENERATORS = {
    "KML": generate_kml,
    "KMZ": generate_kmz,
    "JSON": generate_json,
    "MAVLINK": generate_mavlink,
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

    if mission.status == "VALIDATED":
        try:
            mission.transition_to("EXPORTED")
            db.commit()
            db.refresh(mission)
        except ValueError:
            raise DomainError("invalid status transition", status_code=409)
    elif mission.status != "EXPORTED":
        raise DomainError(
            f"mission must be VALIDATED or EXPORTED to export, current: {mission.status}",
            status_code=409,
        )

    safe_name = _sanitize_filename(mission.name)

    files: dict[str, tuple[bytes, str]] = {}
    for fmt in formats:
        generator = _EXPORT_GENERATORS[fmt]
        content_type, ext = _EXPORT_CONTENT_TYPES[fmt]
        filename = f"mission_{safe_name}.{ext}"
        files[filename] = (generator(flight_plan, mission.name, airport_elevation), content_type)

    return files, safe_name
