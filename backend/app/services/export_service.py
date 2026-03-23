"""flight plan export file generators"""

import io
import json
import zipfile
from datetime import datetime, timezone
from uuid import UUID

import simplekml
from geoalchemy2.shape import to_shape

from app.models.flight_plan import FlightPlan


def _extract_coords(geom) -> tuple[float, float, float]:
    """extract (lon, lat, alt) from a postgis geometry column."""
    shape = to_shape(geom)
    return (shape.x, shape.y, shape.z)


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


def generate_kml(flight_plan: FlightPlan) -> bytes:
    """serialize flight plan waypoints to kml format."""
    kml = simplekml.Kml()
    kml.document.name = f"Flight Plan - Mission {flight_plan.mission_id}"

    folder = kml.newfolder(name="Waypoints")
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    coords_list = []
    for wp in waypoints:
        lon, lat, alt = _extract_coords(wp.position)
        coords_list.append((lon, lat, alt))

        pnt = folder.newpoint(
            name=f"WP{wp.sequence_order}",
            coords=[(lon, lat, alt)],
        )
        pnt.description = (
            f"Type: {wp.waypoint_type}\n"
            f"Camera: {wp.camera_action or 'NONE'}\n"
            f"Speed: {wp.speed or 0} m/s\n"
            f"Heading: {wp.heading or 0}°"
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


def generate_kmz(flight_plan: FlightPlan) -> bytes:
    """serialize flight plan waypoints to kmz (zipped kml) format."""
    kml_bytes = generate_kml(flight_plan)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("doc.kml", kml_bytes)

    return buf.getvalue()


def generate_json(flight_plan: FlightPlan) -> bytes:
    """serialize flight plan to structured json."""
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    wp_list = []
    for wp in waypoints:
        lon, lat, alt = _extract_coords(wp.position)

        camera_target = None
        if wp.camera_target:
            ct_lon, ct_lat, ct_alt = _extract_coords(wp.camera_target)
            camera_target = {
                "latitude": ct_lat,
                "longitude": ct_lon,
                "altitude": ct_alt,
            }

        wp_list.append(
            {
                "sequence_order": wp.sequence_order,
                "latitude": lat,
                "longitude": lon,
                "altitude": alt,
                "speed": wp.speed,
                "heading": wp.heading,
                "camera_action": wp.camera_action,
                "waypoint_type": wp.waypoint_type,
                "camera_target": camera_target,
                "inspection_id": wp.inspection_id,
            }
        )

    data = {
        "mission_id": flight_plan.mission_id,
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


def generate_mavlink(flight_plan: FlightPlan) -> bytes:
    """serialize flight plan to qgc wpl 110 mavlink waypoint format."""
    lines = ["QGC WPL 110"]
    waypoints = sorted(flight_plan.waypoints, key=_waypoint_sort_key)

    for i, wp in enumerate(waypoints):
        lon, lat, alt = _extract_coords(wp.position)
        command = _WAYPOINT_TYPE_COMMANDS.get(wp.waypoint_type, _MAV_CMD_NAV_WAYPOINT)

        # first waypoint is current
        current = 1 if i == 0 else 0

        # p1 = hold time for hover waypoints
        p1 = wp.hover_duration or 0

        line = (
            f"{i}\t{current}\t{_MAV_FRAME}\t{command}\t"
            f"{p1}\t0\t0\t{wp.heading or 0}\t"
            f"{lat}\t{lon}\t{alt}\t1"
        )
        lines.append(line)

    return "\n".join(lines).encode("utf-8")
