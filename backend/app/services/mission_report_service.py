"""mission technical report pdf generator."""

import io
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

import matplotlib
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, NotFoundError
from app.models.agl import AGL
from app.models.airport import AirfieldSurface, Airport
from app.models.flight_plan import (
    ConstraintRule,
    FlightPlan,
    ValidationResult,
    ValidationViolation,
    Waypoint,
)
from app.models.inspection import Inspection, InspectionTemplate
from app.models.mission import DroneProfile, Mission
from app.schemas.geometry import parse_ewkb
from app.utils.geo import distance_between

matplotlib.use("Agg")

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

# inspection segment colors
SEGMENT_COLORS = [
    "#2196F3",
    "#4CAF50",
    "#FF9800",
    "#E91E63",
    "#9C27B0",
    "#00BCD4",
    "#FF5722",
    "#795548",
    "#607D8B",
    "#3F51B5",
]

METHOD_LABELS = {
    "VERTICAL_PROFILE": "Vertical Profile",
    "PAPI_HORIZONTAL_RANGE": "PAPI Horizontal Range",
    "FLY_OVER": "Fly Over",
    "PARALLEL_SIDE_SWEEP": "Parallel Side Sweep",
    "HOVER_POINT_LOCK": "Hover Point Lock",
}


@dataclass
class ReportData:
    """internal data container for pdf generation."""

    mission: Mission
    flight_plan: FlightPlan
    airport: Airport
    drone_profile: DroneProfile | None
    waypoints: list[Waypoint]
    inspections: list[Inspection]
    validation_result: ValidationResult | None
    violations: list[ValidationViolation]
    constraints: list[ConstraintRule]


def _extract_coords(geom) -> tuple[float, float, float]:
    """extract (lon, lat, alt) from a postgis geometry column."""
    if geom is None:
        return (0.0, 0.0, 0.0)
    geojson = parse_ewkb(geom.data)
    coords = geojson.get("coordinates", [0, 0, 0])
    return (coords[0], coords[1], coords[2] if len(coords) > 2 else 0)


def _extract_polygon_coords(geom) -> list[tuple[float, float]]:
    """extract 2d coords from polygon geometry."""
    if geom is None:
        return []
    geojson = parse_ewkb(geom.data)
    coords = geojson.get("coordinates", [[]])
    if not coords or not coords[0]:
        return []
    return [(c[0], c[1]) for c in coords[0]]


def _extract_line_coords(geom) -> list[tuple[float, float]]:
    """extract 2d coords from linestring geometry."""
    if geom is None:
        return []
    geojson = parse_ewkb(geom.data)
    coords = geojson.get("coordinates", [])
    return [(c[0], c[1]) for c in coords]


def _sanitize_filename(name: str) -> str:
    """remove special chars and replace spaces with underscores."""
    sanitized = re.sub(r"[^\w\s-]", "", name)
    sanitized = re.sub(r"\s+", "_", sanitized).strip("_")
    return sanitized.encode("ascii", errors="ignore").decode()


def _format_duration(seconds: float | None) -> str:
    """format seconds into human-readable duration."""
    if seconds is None or seconds <= 0:
        return "N/A"
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    if mins > 0:
        return f"{mins}m {secs}s"
    return f"{secs}s"


def _format_distance(meters: float | None) -> str:
    """format meters into human-readable distance."""
    if meters is None or meters <= 0:
        return "N/A"
    if meters >= 1000:
        return f"{meters / 1000:.2f} km"
    return f"{meters:.1f} m"


def generate_mission_report(db: Session, mission_id: UUID) -> tuple[bytes, str]:
    """generate a mission technical report pdf."""
    data = _load_report_data(db, mission_id)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    icao = data.airport.icao_code or "XXXX"
    mission_name = _sanitize_filename(data.mission.name or "Mission")
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pdf_title = f"MissionReport_{icao}_{mission_name}_{date_str}"
    c.setTitle(pdf_title)

    page = 1
    _build_cover_page(c, data)
    if data.inspections:
        page += 1
    page = _build_inspection_detail_pages(c, data, page + 1)
    page = _build_2d_map_page(c, data, page + 1)
    page = _build_altitude_profile_page(c, data, page + 1)
    page = _build_timeline_page(c, data, page + 1)
    page = _build_waypoint_table_page(c, data, page + 1)
    page = _build_crossing_analysis_page(c, data, page + 1)
    _build_validation_summary_page(c, data, page + 1)

    c.save()

    filename = f"{pdf_title}.pdf"
    return buf.getvalue(), filename


def _load_report_data(db: Session, mission_id: UUID) -> ReportData:
    """load all data needed for the mission report."""
    mission = (
        db.query(Mission)
        .options(
            joinedload(Mission.inspections).joinedload(Inspection.config),
            joinedload(Mission.inspections)
            .joinedload(Inspection.template)
            .joinedload(InspectionTemplate.default_config),
        )
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise NotFoundError("mission not found")

    flight_plan = (
        db.query(FlightPlan)
        .options(
            joinedload(FlightPlan.waypoints),
            joinedload(FlightPlan.validation_result).joinedload(ValidationResult.violations),
            joinedload(FlightPlan.constraints),
        )
        .filter(FlightPlan.mission_id == mission_id)
        .first()
    )
    if not flight_plan:
        raise ConflictError("no flight plan exists for this mission")

    airport = (
        db.query(Airport)
        .options(
            joinedload(Airport.surfaces).joinedload(AirfieldSurface.agls).joinedload(AGL.lhas),
            joinedload(Airport.safety_zones),
        )
        .filter(Airport.id == mission.airport_id)
        .first()
    )
    if not airport:
        raise NotFoundError("airport not found")

    drone_profile = None
    if mission.drone_profile_id:
        drone_profile = db.get(DroneProfile, mission.drone_profile_id)

    waypoints = sorted(flight_plan.waypoints, key=lambda w: w.sequence_order)
    inspections = sorted(mission.inspections, key=lambda i: i.sequence_order)
    validation_result = flight_plan.validation_result
    violations = validation_result.violations if validation_result else []
    constraints = flight_plan.constraints or []

    return ReportData(
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


# page builders


def _draw_header(c: canvas.Canvas, title: str, page_num: int):
    """draw page header with title and page number."""
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN, PAGE_H - 15 * mm, title)
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 15 * mm, f"Page {page_num}")
    c.setStrokeColor(colors.HexColor("#CCCCCC"))
    c.line(MARGIN, PAGE_H - 18 * mm, PAGE_W - MARGIN, PAGE_H - 18 * mm)


def _draw_footer(c: canvas.Canvas):
    """draw page footer."""
    c.setFont("Helvetica", 7)
    c.setFillColor(colors.HexColor("#999999"))
    c.drawString(MARGIN, 10 * mm, "TarmacView Mission Technical Report")
    c.drawRightString(
        PAGE_W - MARGIN,
        10 * mm,
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )


def _build_cover_page(c: canvas.Canvas, data: ReportData):
    """page 1 - cover/summary."""
    y = PAGE_H - 40 * mm

    # title
    c.setFont("Helvetica-Bold", 24)
    c.setFillColor(colors.HexColor("#1a1a1a"))
    c.drawCentredString(PAGE_W / 2, y, "Mission Technical Report")
    y -= 8 * mm
    c.setFont("Helvetica", 12)
    c.setFillColor(colors.HexColor("#666666"))
    c.drawCentredString(PAGE_W / 2, y, "Airport Lighting Inspection")
    y -= 15 * mm

    c.setStrokeColor(colors.HexColor("#3bbb3b"))
    c.setLineWidth(2)
    c.line(MARGIN + 40 * mm, y, PAGE_W - MARGIN - 40 * mm, y)
    y -= 15 * mm

    def _label_value(label: str, value: str, y_pos: float) -> float:
        """draw a label-value pair."""
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#888888"))
        c.drawString(MARGIN + 10 * mm, y_pos, label)
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.HexColor("#333333"))
        c.drawString(MARGIN + 65 * mm, y_pos, str(value))
        return y_pos - 7 * mm

    # airport info
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN + 10 * mm, y, "Airport")
    y -= 8 * mm
    airport = data.airport
    y = _label_value("Name", airport.name if airport else "N/A", y)
    y = _label_value("ICAO Code", airport.icao_code if airport else "N/A", y)
    elev_str = f"{airport.elevation:.1f} m MSL" if airport and airport.elevation else "N/A"
    y = _label_value("Elevation", elev_str, y)
    y -= 5 * mm

    # mission info
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN + 10 * mm, y, "Mission")
    y -= 8 * mm
    y = _label_value("Name", data.mission.name or "N/A", y)
    y = _label_value("ID", str(data.mission.id), y)
    y -= 5 * mm

    # drone info
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN + 10 * mm, y, "Drone")
    y -= 8 * mm
    dp = data.drone_profile
    y = _label_value("Name", dp.name if dp else "N/A", y)
    y = _label_value("Manufacturer", dp.manufacturer if dp else "N/A", y)
    y = _label_value("Model", dp.model if dp else "N/A", y)
    y -= 5 * mm

    # flight summary
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN + 10 * mm, y, "Flight Summary")
    y -= 8 * mm
    y = _label_value("Operator", "N/A", y)
    y = _label_value("Total Flight Time", _format_duration(data.flight_plan.estimated_duration), y)
    y = _label_value("Total Distance", _format_distance(data.flight_plan.total_distance), y)
    transit_speed = data.mission.default_speed
    y = _label_value("Transit Speed", f"{transit_speed} m/s" if transit_speed else "N/A", y)
    y = _label_value("Inspections", str(len(data.inspections)), y)
    y = _label_value("Waypoints", str(len(data.waypoints)), y)

    # min/max altitude from waypoints
    airport_elev = data.airport.elevation if data.airport and data.airport.elevation else 0
    if data.waypoints:
        alts = [_extract_coords(w.position)[2] for w in data.waypoints]
        min_msl = min(alts)
        max_msl = max(alts)
        min_agl = min_msl - airport_elev
        max_agl = max_msl - airport_elev
        y = _label_value("Min Altitude", f"{min_agl:.1f} m AGL / {min_msl:.1f} m MSL", y)
        y = _label_value("Max Altitude", f"{max_agl:.1f} m AGL / {max_msl:.1f} m MSL", y)
    y -= 5 * mm

    # date
    y = _label_value(
        "Generated",
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        y,
    )

    _draw_footer(c)
    c.showPage()

    # inspection summary on separate page
    if data.inspections:
        _build_inspection_summary_page(c, data)


def _build_inspection_summary_page(c: canvas.Canvas, data: ReportData):
    """inspection summary page - list of all inspections with method and template."""
    y = PAGE_H - 40 * mm

    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN + 10 * mm, y, "Inspection Summary")
    y -= 10 * mm

    airport_elev = data.airport.elevation if data.airport and data.airport.elevation else 0

    for idx, insp in enumerate(data.inspections):
        if y < 30 * mm:
            break
        method_label = METHOD_LABELS.get(insp.method, insp.method)
        template_name = insp.template.name if insp.template else "N/A"
        color_hex = SEGMENT_COLORS[idx % len(SEGMENT_COLORS)]

        c.setFillColor(colors.HexColor(color_hex))
        c.rect(MARGIN + 10 * mm, y - 1, 3 * mm, 5 * mm, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(colors.HexColor("#333333"))
        c.drawString(
            MARGIN + 15 * mm,
            y,
            f"#{idx + 1} — {template_name} ({method_label})",
        )
        y -= 7 * mm

        # per-inspection altitude range
        insp_wps = [
            w for w in data.waypoints if w.inspection_id and str(w.inspection_id) == str(insp.id)
        ]
        if insp_wps:
            alts = [_extract_coords(w.position)[2] for w in insp_wps]
            min_alt = min(alts)
            max_alt = max(alts)
            c.setFont("Helvetica", 8)
            c.setFillColor(colors.HexColor("#555555"))
            c.drawString(
                MARGIN + 15 * mm,
                y,
                f"Altitude range: {min_alt - airport_elev:.1f} - {max_alt - airport_elev:.1f} m AGL"
                f" ({min_alt:.1f} - {max_alt:.1f} m MSL)"
                f"  |  Waypoints: {len(insp_wps)}",
            )
            y -= 7 * mm
        else:
            y -= 3 * mm

    _draw_footer(c)
    c.showPage()


def _build_inspection_detail_pages(c: canvas.Canvas, data: ReportData, page_num: int) -> int:
    """inspection detail pages - one section per inspection."""
    if not data.inspections:
        _draw_header(c, "Inspection Procedures Detail", page_num)
        c.setFont("Helvetica", 10)
        c.drawString(MARGIN, PAGE_H - 30 * mm, "No inspections configured.")
        _draw_footer(c)
        c.showPage()
        return page_num

    y = PAGE_H - 25 * mm
    _draw_header(c, "Inspection Procedures Detail", page_num)

    for idx, insp in enumerate(data.inspections):
        if y < 60 * mm:
            _draw_footer(c)
            c.showPage()
            page_num += 1
            _draw_header(c, "Inspection Procedures Detail (cont.)", page_num)
            y = PAGE_H - 25 * mm

        # inspection header
        template_name = insp.template.name if insp.template else "N/A"
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.HexColor("#1a1a1a"))
        color_hex = SEGMENT_COLORS[idx % len(SEGMENT_COLORS)]
        c.setFillColor(colors.HexColor(color_hex))
        c.rect(MARGIN, y - 1, 3 * mm, 5 * mm, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#1a1a1a"))
        c.drawString(MARGIN + 5 * mm, y, f"Inspection #{idx + 1} — {template_name}")
        y -= 7 * mm

        method_label = METHOD_LABELS.get(insp.method, insp.method)
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#555555"))
        c.drawString(MARGIN + 5 * mm, y, f"Method: {method_label}")
        y -= 6 * mm

        # resolve config
        resolved = {}
        if insp.config:
            template_cfg = insp.template.default_config if insp.template else None
            resolved = insp.config.resolve_with_defaults(template_cfg)

        # flight parameters
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(colors.HexColor("#333333"))
        c.drawString(MARGIN + 5 * mm, y, "Flight Parameters")
        y -= 5 * mm
        c.setFont("Helvetica", 8)

        alt_offset = resolved.get("altitude_offset") or data.mission.default_altitude_offset or 0
        c.drawString(MARGIN + 10 * mm, y, f"Altitude Offset: {alt_offset} m")
        y -= 4.5 * mm

        meas_speed = (
            resolved.get("measurement_speed_override") or data.mission.measurement_speed_override
        )
        if meas_speed:
            c.drawString(MARGIN + 10 * mm, y, f"Measurement Speed: {meas_speed} m/s")
            y -= 4.5 * mm

        buffer_dist = resolved.get("buffer_distance") or data.mission.default_buffer_distance
        if buffer_dist:
            c.drawString(MARGIN + 10 * mm, y, f"Buffer Distance: {buffer_dist} m")
            y -= 4.5 * mm

        # camera parameters
        y -= 2 * mm
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(colors.HexColor("#333333"))
        c.drawString(MARGIN + 5 * mm, y, "Camera Parameters")
        y -= 5 * mm
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor("#555555"))

        capture = resolved.get("capture_mode") or data.mission.default_capture_mode or "N/A"
        c.drawString(MARGIN + 10 * mm, y, f"Capture Mode: {capture}")
        y -= 4.5 * mm

        gimbal = resolved.get("camera_gimbal_angle")
        if gimbal is not None:
            c.drawString(MARGIN + 10 * mm, y, f"Gimbal Angle: {gimbal}°")
            y -= 4.5 * mm

        dp = data.drone_profile
        if dp:
            if dp.sensor_fov:
                c.drawString(MARGIN + 10 * mm, y, f"Sensor FOV: {dp.sensor_fov}°")
                y -= 4.5 * mm
            if dp.camera_resolution:
                c.drawString(MARGIN + 10 * mm, y, f"Resolution: {dp.camera_resolution}")
                y -= 4.5 * mm
            if dp.camera_frame_rate:
                c.drawString(MARGIN + 10 * mm, y, f"Frame Rate: {dp.camera_frame_rate} fps")
                y -= 4.5 * mm

        recording_dur = resolved.get("recording_setup_duration")
        if recording_dur:
            c.drawString(MARGIN + 10 * mm, y, f"Recording Setup: {recording_dur}s")
            y -= 4.5 * mm

        # night camera settings
        _cam_fields = [
            ("white_balance", "White Balance", None),
            ("iso", "ISO", None),
            ("shutter_speed", "Shutter Speed", None),
            ("focus_mode", "Focus Mode", None),
            ("focus_distance_m", "Focus Distance", " m"),
            ("optical_zoom", "Optical Zoom", "x"),
        ]
        _has_cam = any(resolved.get(f[0]) is not None for f in _cam_fields)
        if _has_cam:
            y -= 2 * mm
            c.setFont("Helvetica-Bold", 9)
            c.setFillColor(colors.HexColor("#333333"))
            c.drawString(MARGIN + 5 * mm, y, "Night Camera Settings")
            y -= 5 * mm
            c.setFont("Helvetica", 8)
            c.setFillColor(colors.HexColor("#555555"))
            for key, label, suffix in _cam_fields:
                val = resolved.get(key)
                if val is not None:
                    display = f"{label}: {val}{suffix}" if suffix else f"{label}: {val}"
                    c.drawString(MARGIN + 10 * mm, y, display)
                    y -= 4.5 * mm

        # measurement parameters
        y -= 2 * mm
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(colors.HexColor("#333333"))
        c.drawString(MARGIN + 5 * mm, y, "Measurement Parameters")
        y -= 5 * mm
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor("#555555"))

        density = resolved.get("measurement_density")
        if density:
            c.drawString(MARGIN + 10 * mm, y, f"Density: {density} waypoints")
            y -= 4.5 * mm

        sweep = resolved.get("sweep_angle")
        if sweep:
            c.drawString(MARGIN + 10 * mm, y, f"Sweep Angle: ±{sweep}°")
            y -= 4.5 * mm

        vp_height = resolved.get("vertical_profile_height")
        if vp_height:
            c.drawString(MARGIN + 10 * mm, y, f"Vertical Profile Height: {vp_height} m")
            y -= 4.5 * mm

        horiz_dist = resolved.get("horizontal_distance")
        if horiz_dist:
            c.drawString(MARGIN + 10 * mm, y, f"Horizontal Distance: {horiz_dist} m")
            y -= 4.5 * mm

        # waypoint summary for this inspection
        insp_wps = [
            w for w in data.waypoints if w.inspection_id and str(w.inspection_id) == str(insp.id)
        ]
        if insp_wps:
            y -= 2 * mm
            c.setFont("Helvetica", 8)
            c.setFillColor(colors.HexColor("#555555"))
            meas_count = sum(1 for w in insp_wps if w.waypoint_type == "MEASUREMENT")
            hover_count = sum(1 for w in insp_wps if w.waypoint_type == "HOVER")
            c.drawString(
                MARGIN + 10 * mm,
                y,
                f"Waypoints: {len(insp_wps)} total ({meas_count} measurement, {hover_count} hover)",
            )
            y -= 4.5 * mm

            airport_elev = data.airport.elevation if data.airport and data.airport.elevation else 0
            insp_alts = [_extract_coords(w.position)[2] for w in insp_wps]
            min_alt = min(insp_alts)
            max_alt = max(insp_alts)
            c.drawString(
                MARGIN + 10 * mm,
                y,
                f"Altitude: {min_alt - airport_elev:.1f} - {max_alt - airport_elev:.1f} m AGL"
                f" ({min_alt:.1f} - {max_alt:.1f} m MSL)",
            )
            y -= 4.5 * mm

        y -= 6 * mm

    _draw_footer(c)
    c.showPage()
    return page_num


def _build_2d_map_page(c: canvas.Canvas, data: ReportData, page_num: int) -> int:
    """2d top-down map rendered with matplotlib."""
    _draw_header(c, "2D Top-Down Map", page_num)

    fig, ax = plt.subplots(1, 1, figsize=(7, 5.5))
    ax.set_aspect("equal")

    # safety zones
    zone_colors = {
        "CTR": "#2196F388",
        "RESTRICTED": "#FF980088",
        "PROHIBITED": "#E5454588",
        "TEMPORARY_NO_FLY": "#9C27B088",
        "AIRPORT_BOUNDARY": "#CCCCCC44",
    }
    if data.airport and data.airport.safety_zones:
        for zone in data.airport.safety_zones:
            coords = _extract_polygon_coords(zone.geometry)
            if coords:
                lons, lats = zip(*coords)
                color = zone_colors.get(zone.type, "#CCCCCC44")
                ax.fill(lons, lats, alpha=0.3, color=color, label=zone.name)
                ax.plot(lons, lats, color=color[:7], linewidth=0.5)

    # surfaces (runways/taxiways)
    if data.airport and data.airport.surfaces:
        for surface in data.airport.surfaces:
            if surface.boundary:
                coords = _extract_polygon_coords(surface.boundary)
                if coords:
                    lons, lats = zip(*coords)
                    scolor = "#444444" if surface.surface_type == "RUNWAY" else "#888888"
                    ax.fill(lons, lats, color=scolor, alpha=0.4)
                    ax.plot(lons, lats, color=scolor, linewidth=1)
                    # label
                    clat = sum(lats) / len(lats)
                    clon = sum(lons) / len(lons)
                    ax.text(
                        clon,
                        clat,
                        surface.identifier or "",
                        ha="center",
                        va="center",
                        fontsize=7,
                        fontweight="bold",
                        color="#222222",
                    )

    # agl / lha positions
    if data.airport and data.airport.surfaces:
        for surface in data.airport.surfaces:
            for agl in getattr(surface, "agls", []):
                agl_lon, agl_lat, _ = _extract_coords(agl.position)
                ax.plot(
                    agl_lon,
                    agl_lat,
                    "s",
                    color="#FF6F00",
                    markersize=6,
                    zorder=5,
                    markeredgecolor="#333333",
                    markeredgewidth=0.5,
                )
                ax.annotate(
                    agl.name or agl.agl_type,
                    (agl_lon, agl_lat),
                    fontsize=5,
                    color="#FF6F00",
                    fontweight="bold",
                    textcoords="offset points",
                    xytext=(4, 4),
                    zorder=7,
                )
                for lha in getattr(agl, "lhas", []):
                    lha_lon, lha_lat, _ = _extract_coords(lha.position)
                    ax.plot(
                        lha_lon,
                        lha_lat,
                        "d",
                        color="#FFB300",
                        markersize=3,
                        zorder=5,
                        markeredgecolor="#333333",
                        markeredgewidth=0.3,
                    )

    # build inspection method lookup
    insp_methods = {}
    for ins in data.inspections:
        insp_methods[str(ins.id)] = ins.method

    # trajectory path
    if data.waypoints:
        wp_lons = []
        wp_lats = []
        wp_alts = []
        wp_colors = []
        wp_is_vp = []
        for wp in data.waypoints:
            lon, lat, alt = _extract_coords(wp.position)
            wp_lons.append(lon)
            wp_lats.append(lat)
            wp_alts.append(alt)
            if wp.inspection_id:
                insp_idx = next(
                    (
                        i
                        for i, ins in enumerate(data.inspections)
                        if str(ins.id) == str(wp.inspection_id)
                    ),
                    0,
                )
                wp_colors.append(SEGMENT_COLORS[insp_idx % len(SEGMENT_COLORS)])
                method = insp_methods.get(str(wp.inspection_id), "")
                wp_is_vp.append(method == "VERTICAL_PROFILE")
            else:
                wp_colors.append("#888888")
                wp_is_vp.append(False)

        # draw path segments
        for i in range(len(wp_lons) - 1):
            ax.plot(
                [wp_lons[i], wp_lons[i + 1]],
                [wp_lats[i], wp_lats[i + 1]],
                color=wp_colors[i],
                linewidth=1.5,
                alpha=0.8,
                zorder=3,
            )

        # non-vertical-profile waypoint dots first (lower z)
        for i in range(len(wp_lons)):
            if not wp_is_vp[i]:
                ax.plot(
                    wp_lons[i],
                    wp_lats[i],
                    "o",
                    color=wp_colors[i],
                    markersize=2,
                    zorder=4,
                )

        # vertical profile waypoints on top
        for i in range(len(wp_lons)):
            if wp_is_vp[i]:
                ax.plot(
                    wp_lons[i],
                    wp_lats[i],
                    "o",
                    color=wp_colors[i],
                    markersize=3,
                    zorder=6,
                )

        # takeoff/landing markers
        ax.plot(wp_lons[0], wp_lats[0], "^", color="#3bbb3b", markersize=10, zorder=8)
        ax.plot(wp_lons[-1], wp_lats[-1], "v", color="#e54545", markersize=10, zorder=8)

    # zoom to trajectory extent with padding
    if data.waypoints:
        all_lons = list(wp_lons)
        all_lats = list(wp_lats)

        # include runway/taxiway surfaces in bounds
        if data.airport and data.airport.surfaces:
            for surface in data.airport.surfaces:
                if surface.boundary:
                    coords = _extract_polygon_coords(surface.boundary)
                    if coords:
                        s_lons, s_lats = zip(*coords)
                        all_lons.extend(s_lons)
                        all_lats.extend(s_lats)

        lon_min, lon_max = min(all_lons), max(all_lons)
        lat_min, lat_max = min(all_lats), max(all_lats)
        lon_pad = (lon_max - lon_min) * 0.15 or 0.0005
        lat_pad = (lat_max - lat_min) * 0.15 or 0.0005
        ax.set_xlim(lon_min - lon_pad, lon_max + lon_pad)
        ax.set_ylim(lat_min - lat_pad, lat_max + lat_pad)

    # legend
    legend_items = [
        mpatches.Patch(color="#3bbb3b", label="Takeoff"),
        mpatches.Patch(color="#e54545", label="Landing"),
        mpatches.Patch(color="#888888", label="Transit"),
    ]
    for idx, insp in enumerate(data.inspections):
        name = insp.template.name if insp.template else f"Inspection {idx + 1}"
        resolved = {}
        if insp.config:
            tmpl_cfg = insp.template.default_config if insp.template else None
            resolved = insp.config.resolve_with_defaults(tmpl_cfg)
        alt_offset = resolved.get("altitude_offset") or 0
        h_lights = resolved.get("height_above_lights")
        h_lha = resolved.get("height_above_lha")
        detail_parts = [f"AGL offset {alt_offset}m"]
        if h_lights is not None:
            detail_parts.append(f"HAL {h_lights}m")
        if h_lha is not None:
            detail_parts.append(f"H-LHA {h_lha}m")
        label = f"{name} ({', '.join(detail_parts)})"
        legend_items.append(
            mpatches.Patch(
                color=SEGMENT_COLORS[idx % len(SEGMENT_COLORS)],
                label=label,
            )
        )
    if data.airport and data.airport.safety_zones:
        seen_types = set()
        for zone in data.airport.safety_zones:
            if zone.type not in seen_types:
                seen_types.add(zone.type)
                color = zone_colors.get(zone.type, "#CCCCCC44")
                label = zone.type.replace("_", " ").title()
                legend_items.append(mpatches.Patch(color=color, alpha=0.3, label=label))
    legend_items.append(mpatches.Patch(color="#FF6F00", label="AGL"))
    legend_items.append(mpatches.Patch(color="#FFB300", label="LHA"))
    ax.legend(
        handles=legend_items,
        loc="upper left",
        bbox_to_anchor=(1.02, 1),
        fontsize=5.5,
        framealpha=0.8,
    )

    # north arrow
    ax.annotate(
        "N",
        xy=(0.97, 0.97),
        xycoords="axes fraction",
        fontsize=10,
        fontweight="bold",
        ha="center",
        va="top",
    )
    ax.annotate(
        "",
        xy=(0.97, 0.97),
        xycoords="axes fraction",
        xytext=(0.97, 0.90),
        textcoords="axes fraction",
        arrowprops={"arrowstyle": "->", "color": "black", "lw": 1.5},
    )

    ax.set_xlabel("Longitude", fontsize=8)
    ax.set_ylabel("Latitude", fontsize=8)
    ax.tick_params(labelsize=6)
    plt.setp(ax.get_xticklabels(), rotation=30, ha="right")
    ax.set_title("Flight Plan - Top Down View", fontsize=10)
    fig.tight_layout()

    img_buf = io.BytesIO()
    fig.savefig(img_buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    img_buf.seek(0)

    c.drawImage(
        ImageReader(img_buf),
        MARGIN,
        PAGE_H - 200 * mm,
        width=CONTENT_W,
        height=160 * mm,
        preserveAspectRatio=True,
    )

    _draw_footer(c)
    c.showPage()
    return page_num


def _build_altitude_profile_page(c: canvas.Canvas, data: ReportData, page_num: int) -> int:
    """vertical altitude profile chart."""
    _draw_header(c, "Vertical Altitude Profile", page_num)

    fig, ax = plt.subplots(1, 1, figsize=(7, 4))
    airport_elev = data.airport.elevation if data.airport and data.airport.elevation else 0

    if data.waypoints:
        distances = [0.0]
        alts_msl = []
        alts_agl = []
        colors_list = []

        prev_lon, prev_lat, prev_alt = _extract_coords(data.waypoints[0].position)
        alts_msl.append(prev_alt)
        alts_agl.append(prev_alt - airport_elev)

        for wp in data.waypoints:
            if wp.inspection_id:
                insp_idx = next(
                    (
                        i
                        for i, ins in enumerate(data.inspections)
                        if str(ins.id) == str(wp.inspection_id)
                    ),
                    0,
                )
                colors_list.append(SEGMENT_COLORS[insp_idx % len(SEGMENT_COLORS)])
            else:
                colors_list.append("#888888")

        for wp in data.waypoints[1:]:
            lon, lat, alt = _extract_coords(wp.position)
            dist = distance_between(prev_lon, prev_lat, lon, lat)
            distances.append(distances[-1] + dist)
            alts_msl.append(alt)
            alts_agl.append(alt - airport_elev)
            prev_lon, prev_lat = lon, lat

        # color-coded altitude segments (AGL)
        for i in range(len(distances) - 1):
            ax.plot(
                [distances[i], distances[i + 1]],
                [alts_agl[i], alts_agl[i + 1]],
                color=colors_list[i],
                linewidth=2,
            )

        # ground level
        ax.axhline(
            y=0,
            color="#8B4513",
            linewidth=1.5,
            linestyle="--",
            alpha=0.6,
            label="Ground",
        )

        # max altitude constraint
        for constraint in data.constraints:
            if constraint.constraint_type == "ALTITUDE" and constraint.max_altitude:
                max_agl = constraint.max_altitude - airport_elev
                ax.axhline(
                    y=max_agl,
                    color="#e54545",
                    linewidth=1,
                    linestyle=":",
                    alpha=0.7,
                    label="Max Altitude",
                )

        ax.set_xlabel("Distance Along Path (m)", fontsize=8)
        ax.set_ylabel("Altitude AGL (m)", fontsize=8)
        ax.tick_params(labelsize=6)
        ax.grid(True, alpha=0.3)

        # secondary y-axis for MSL with dashed grid lines
        ax2 = ax.twinx()
        agl_min, agl_max = ax.get_ylim()
        ax2.set_ylim(agl_min + airport_elev, agl_max + airport_elev)
        ax2.set_ylabel("Altitude MSL (m)", fontsize=8)
        ax2.tick_params(labelsize=6)
        ax2.grid(True, alpha=0.3, linestyle="--")

        ax.legend(fontsize=6, loc="upper right")
        ax.set_title("Altitude Profile", fontsize=10)

    fig.tight_layout()
    img_buf = io.BytesIO()
    fig.savefig(img_buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    img_buf.seek(0)

    c.drawImage(
        ImageReader(img_buf),
        MARGIN,
        PAGE_H - 160 * mm,
        width=CONTENT_W,
        height=120 * mm,
        preserveAspectRatio=True,
    )

    _draw_footer(c)
    c.showPage()
    return page_num


def _build_timeline_page(c: canvas.Canvas, data: ReportData, page_num: int) -> int:
    """gantt-style timeline and time-based flight plan table."""
    _draw_header(c, "Time-Based Flight Plan", page_num)

    # build activity segments from waypoints
    activities = _build_activities(data)

    fig, ax = plt.subplots(1, 1, figsize=(7, 3))

    if activities:
        labels = []
        for i, act in enumerate(activities):
            ax.barh(
                i,
                act["duration"],
                left=act["start"],
                color=act["color"],
                height=0.6,
                alpha=0.8,
            )
            labels.append(act["name"])

        ax.set_yticks(range(len(labels)))
        ax.set_yticklabels(labels, fontsize=7)
        ax.set_xlabel("Time (seconds)", fontsize=8)
        ax.set_title("Flight Timeline", fontsize=10)
        ax.tick_params(labelsize=6)
        ax.invert_yaxis()
        ax.grid(True, alpha=0.3, axis="x")

    fig.tight_layout()
    img_buf = io.BytesIO()
    fig.savefig(img_buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    img_buf.seek(0)

    c.drawImage(
        ImageReader(img_buf),
        MARGIN,
        PAGE_H - 120 * mm,
        width=CONTENT_W,
        height=80 * mm,
        preserveAspectRatio=True,
    )

    # time table below chart
    y = PAGE_H - 130 * mm
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.HexColor("#333333"))
    headers = ["Time", "Activity", "Position", "Alt (m)", "Speed (m/s)"]
    col_widths = [25 * mm, 40 * mm, 50 * mm, 25 * mm, 25 * mm]
    x = MARGIN
    for i, h in enumerate(headers):
        c.drawString(x, y, h)
        x += col_widths[i]
    y -= 4 * mm
    c.setStrokeColor(colors.HexColor("#CCCCCC"))
    c.line(MARGIN, y, PAGE_W - MARGIN, y)
    y -= 5 * mm

    c.setFont("Helvetica", 7)
    c.setFillColor(colors.HexColor("#555555"))

    elapsed = 0.0
    prev_coords = None
    for wp in data.waypoints[:30]:
        if y < 20 * mm:
            break
        lon, lat, alt = _extract_coords(wp.position)
        agl = alt - (data.airport.elevation if data.airport and data.airport.elevation else 0)
        x = MARGIN
        c.drawString(x, y, _format_duration(elapsed))
        x += col_widths[0]
        c.drawString(x, y, wp.waypoint_type or "")
        x += col_widths[1]
        c.drawString(x, y, f"{lat:.5f}, {lon:.5f}")
        x += col_widths[2]
        c.drawString(x, y, f"{agl:.1f}")
        x += col_widths[3]
        c.drawString(x, y, f"{wp.speed or 0:.1f}")
        y -= 4 * mm

        # estimate time advance
        if prev_coords and wp.speed and wp.speed > 0:
            dist = distance_between(prev_coords[0], prev_coords[1], lon, lat)
            elapsed += dist / wp.speed
        if wp.hover_duration:
            elapsed += wp.hover_duration

        prev_coords = (lon, lat)

    _draw_footer(c)
    c.showPage()
    return page_num


def _build_activities(data: ReportData) -> list[dict]:
    """build activity list from waypoints for the timeline gantt chart."""
    activities = []
    current_time = 0.0
    current_activity = None
    activity_start = 0.0

    prev_coords = None
    for wp in data.waypoints:
        lon, lat, alt = _extract_coords(wp.position)

        # estimate segment duration
        seg_duration = 0.0
        if prev_coords and wp.speed and wp.speed > 0:
            dist = distance_between(prev_coords[0], prev_coords[1], lon, lat)
            seg_duration = dist / wp.speed
        if wp.hover_duration:
            seg_duration += wp.hover_duration

        # determine activity type
        if wp.waypoint_type == "TAKEOFF":
            activity_name = "Takeoff"
            color = "#3bbb3b"
        elif wp.waypoint_type == "LANDING":
            activity_name = "Landing"
            color = "#e54545"
        elif wp.inspection_id:
            insp_idx = next(
                (
                    i
                    for i, ins in enumerate(data.inspections)
                    if str(ins.id) == str(wp.inspection_id)
                ),
                0,
            )
            insp = data.inspections[insp_idx] if insp_idx < len(data.inspections) else None
            name = insp.template.name if insp and insp.template else f"Inspection {insp_idx + 1}"
            activity_name = name
            color = SEGMENT_COLORS[insp_idx % len(SEGMENT_COLORS)]
        else:
            activity_name = "Transit"
            color = "#888888"

        if activity_name != current_activity:
            if current_activity is not None and activities:
                activities[-1]["duration"] = max(current_time - activity_start, 1.0)
            current_activity = activity_name
            activity_start = current_time
            activities.append(
                {
                    "name": activity_name,
                    "start": activity_start,
                    "duration": 0,
                    "color": color,
                }
            )

        current_time += seg_duration
        prev_coords = (lon, lat)

    # finalize last activity
    if activities:
        activities[-1]["duration"] = max(current_time - activity_start, 1.0)

    # remove zero-duration placeholder entries
    return [a for a in activities if a["duration"] > 0]


def _build_waypoint_table_page(c: canvas.Canvas, data: ReportData, page_num: int) -> int:
    """full waypoint table."""
    _draw_header(c, "Waypoint Table", page_num)
    airport_elev = data.airport.elevation if data.airport and data.airport.elevation else 0

    y = PAGE_H - 25 * mm

    # headers
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(colors.HexColor("#333333"))
    col_headers = [
        "#",
        "Type",
        "Lat",
        "Lon",
        "Alt MSL",
        "Alt AGL",
        "Speed",
        "Heading",
        "Camera",
        "Inspection",
    ]
    col_widths = [
        8 * mm,
        18 * mm,
        22 * mm,
        22 * mm,
        16 * mm,
        16 * mm,
        14 * mm,
        16 * mm,
        20 * mm,
        20 * mm,
    ]
    x = MARGIN
    for i, h in enumerate(col_headers):
        c.drawString(x, y, h)
        x += col_widths[i]
    y -= 3.5 * mm
    c.setStrokeColor(colors.HexColor("#CCCCCC"))
    c.line(MARGIN, y, PAGE_W - MARGIN, y)
    y -= 4 * mm

    c.setFont("Helvetica", 6.5)
    c.setFillColor(colors.HexColor("#555555"))

    for wp in data.waypoints:
        if y < 20 * mm:
            _draw_footer(c)
            c.showPage()
            page_num += 1
            _draw_header(c, "Waypoint Table (cont.)", page_num)
            y = PAGE_H - 25 * mm

            # re-draw headers
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(colors.HexColor("#333333"))
            x = MARGIN
            for i, h in enumerate(col_headers):
                c.drawString(x, y, h)
                x += col_widths[i]
            y -= 3.5 * mm
            c.line(MARGIN, y, PAGE_W - MARGIN, y)
            y -= 4 * mm
            c.setFont("Helvetica", 6.5)
            c.setFillColor(colors.HexColor("#555555"))

        lon, lat, alt = _extract_coords(wp.position)
        agl = alt - airport_elev

        # find inspection name
        insp_name = ""
        if wp.inspection_id:
            for ins in data.inspections:
                if str(ins.id) == str(wp.inspection_id):
                    insp_name = ins.template.name if ins.template else ""
                    break

        x = MARGIN
        vals = [
            str(wp.sequence_order),
            wp.waypoint_type or "",
            f"{lat:.6f}",
            f"{lon:.6f}",
            f"{alt:.1f}",
            f"{agl:.1f}",
            f"{wp.speed or 0:.1f}",
            f"{wp.heading or 0:.0f}°",
            wp.camera_action or "NONE",
            insp_name[:12],
        ]
        for i, v in enumerate(vals):
            c.drawString(x, y, v)
            x += col_widths[i]
        y -= 3.5 * mm

    _draw_footer(c)
    c.showPage()
    return page_num


def _build_crossing_analysis_page(c: canvas.Canvas, data: ReportData, page_num: int) -> int:
    """runway crossing and safety zone conflict analysis."""
    _draw_header(c, "Crossing & Conflict Analysis", page_num)
    y = PAGE_H - 25 * mm
    airport_elev = data.airport.elevation if data.airport and data.airport.elevation else 0

    # runway crossing analysis - check waypoints near runway surfaces
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN, y, "Runway Crossings")
    y -= 7 * mm

    crossings = []
    if data.airport and data.airport.surfaces:
        runways = [s for s in data.airport.surfaces if s.surface_type == "RUNWAY"]
        for wp in data.waypoints:
            wp_lon, wp_lat, wp_alt = _extract_coords(wp.position)
            for runway in runways:
                if runway.boundary:
                    boundary_coords = _extract_polygon_coords(runway.boundary)
                    if boundary_coords and _point_near_polygon(wp_lon, wp_lat, boundary_coords, 50):
                        crossings.append(
                            {
                                "runway": runway.identifier,
                                "waypoint": wp.sequence_order,
                                "alt_agl": wp_alt - airport_elev,
                                "type": wp.waypoint_type,
                            }
                        )

    if crossings:
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(colors.HexColor("#333333"))
        cross_headers = ["Runway", "Waypoint #", "Altitude AGL", "Waypoint Type"]
        cross_widths = [30 * mm, 30 * mm, 35 * mm, 40 * mm]
        x = MARGIN
        for i, h in enumerate(cross_headers):
            c.drawString(x, y, h)
            x += cross_widths[i]
        y -= 3 * mm
        c.line(MARGIN, y, PAGE_W - MARGIN, y)
        y -= 4 * mm

        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#555555"))
        seen = set()
        for cr in crossings:
            key = (cr["runway"], cr["waypoint"])
            if key in seen:
                continue
            seen.add(key)
            if y < 30 * mm:
                break
            x = MARGIN
            c.drawString(x, y, cr["runway"] or "")
            x += cross_widths[0]
            c.drawString(x, y, str(cr["waypoint"]))
            x += cross_widths[1]
            c.drawString(x, y, f"{cr['alt_agl']:.1f} m")
            x += cross_widths[2]
            c.drawString(x, y, cr["type"] or "")
            y -= 4 * mm
    else:
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#555555"))
        c.drawString(MARGIN + 5 * mm, y, "No runway crossings detected.")
        y -= 7 * mm

    # safety zone passes
    y -= 5 * mm
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN, y, "Safety Zone Passes")
    y -= 7 * mm

    zone_passes = []
    if data.airport and data.airport.safety_zones:
        active_zones = [
            z for z in data.airport.safety_zones if z.is_active and z.type != "AIRPORT_BOUNDARY"
        ]
        for wp in data.waypoints:
            wp_lon, wp_lat, _ = _extract_coords(wp.position)
            for zone in active_zones:
                zone_coords = _extract_polygon_coords(zone.geometry)
                if zone_coords and _point_in_polygon(wp_lon, wp_lat, zone_coords):
                    zone_passes.append(
                        {
                            "zone": zone.name,
                            "type": zone.type,
                            "waypoint": wp.sequence_order,
                        }
                    )

    if zone_passes:
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(colors.HexColor("#333333"))
        zp_headers = ["Zone Name", "Zone Type", "Waypoint #"]
        zp_widths = [50 * mm, 40 * mm, 30 * mm]
        x = MARGIN
        for i, h in enumerate(zp_headers):
            c.drawString(x, y, h)
            x += zp_widths[i]
        y -= 3 * mm
        c.line(MARGIN, y, PAGE_W - MARGIN, y)
        y -= 4 * mm

        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#555555"))
        seen = set()
        for zp in zone_passes:
            key = (zp["zone"], zp["waypoint"])
            if key in seen:
                continue
            seen.add(key)
            if y < 30 * mm:
                break
            x = MARGIN
            c.drawString(x, y, zp["zone"] or "")
            x += zp_widths[0]
            c.drawString(x, y, zp["type"] or "")
            x += zp_widths[1]
            c.drawString(x, y, str(zp["waypoint"]))
            y -= 4 * mm
    else:
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#555555"))
        c.drawString(MARGIN + 5 * mm, y, "No safety zone passes detected.")
        y -= 7 * mm

    # waypoints near runway thresholds
    y -= 5 * mm
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN, y, "Waypoints Near Runway Thresholds")
    y -= 7 * mm

    threshold_warnings = []
    if data.airport and data.airport.surfaces:
        runways = [s for s in data.airport.surfaces if s.surface_type == "RUNWAY"]
        for wp in data.waypoints:
            wp_lon, wp_lat, _ = _extract_coords(wp.position)
            for runway in runways:
                if runway.threshold_position:
                    t_lon, t_lat, _ = _extract_coords(runway.threshold_position)
                    dist = distance_between(wp_lon, wp_lat, t_lon, t_lat)
                    if dist < 200:
                        threshold_warnings.append(
                            {
                                "runway": runway.identifier,
                                "waypoint": wp.sequence_order,
                                "distance": dist,
                            }
                        )

    if threshold_warnings:
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#555555"))
        seen = set()
        for tw in threshold_warnings:
            key = (tw["runway"], tw["waypoint"])
            if key in seen:
                continue
            seen.add(key)
            if y < 20 * mm:
                break
            c.drawString(
                MARGIN + 5 * mm,
                y,
                f"WP#{tw['waypoint']} is {tw['distance']:.0f}m from {tw['runway']} threshold",
            )
            y -= 4 * mm
    else:
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#555555"))
        c.drawString(MARGIN + 5 * mm, y, "No waypoints within 200m of runway thresholds.")

    _draw_footer(c)
    c.showPage()
    return page_num


def _build_validation_summary_page(c: canvas.Canvas, data: ReportData, page_num: int) -> int:
    """validation summary with constraint results and battery analysis."""
    _draw_header(c, "Validation Summary", page_num)
    y = PAGE_H - 25 * mm

    # overall status
    c.setFont("Helvetica-Bold", 14)
    if data.validation_result:
        if data.validation_result.passed:
            c.setFillColor(colors.HexColor("#3bbb3b"))
            c.drawString(MARGIN, y, "PASSED")
        else:
            c.setFillColor(colors.HexColor("#e54545"))
            c.drawString(MARGIN, y, "FAILED")
    else:
        c.setFillColor(colors.HexColor("#e5a545"))
        c.drawString(MARGIN, y, "NOT VALIDATED")
    y -= 10 * mm

    # constraint results
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN, y, "Constraint Results")
    y -= 7 * mm

    if data.constraints:
        c.setFont("Helvetica", 8)
        for constraint in data.constraints:
            if y < 30 * mm:
                break
            icon = "●"
            # check if any violations reference this constraint
            has_violation = any(
                v.constraint_id
                and str(v.constraint_id) == str(constraint.id)
                and v.category == "violation"
                for v in data.violations
            )
            if has_violation:
                c.setFillColor(colors.HexColor("#e54545"))
            else:
                c.setFillColor(colors.HexColor("#3bbb3b"))
            c.drawString(MARGIN + 5 * mm, y, icon)
            c.setFillColor(colors.HexColor("#333333"))
            hard_soft = "Hard" if constraint.is_hard_constraint else "Soft"
            c.drawString(MARGIN + 10 * mm, y, f"{constraint.name} ({hard_soft})")
            y -= 5 * mm
    else:
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#555555"))
        c.drawString(MARGIN + 5 * mm, y, "No constraints defined.")
        y -= 7 * mm

    # violations
    y -= 5 * mm
    violations = [v for v in data.violations if v.category == "violation"]
    warnings = [v for v in data.violations if v.category != "violation"]

    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN, y, f"Violations ({len(violations)})")
    y -= 7 * mm

    if violations:
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor("#e54545"))
        for v in violations[:15]:
            if y < 30 * mm:
                break
            c.drawString(MARGIN + 5 * mm, y, f"• {v.message}")
            y -= 4.5 * mm
    else:
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#3bbb3b"))
        c.drawString(MARGIN + 5 * mm, y, "No violations.")
        y -= 5 * mm

    y -= 5 * mm
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN, y, f"Warnings ({len(warnings)})")
    y -= 7 * mm

    if warnings:
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor("#e5a545"))
        for w in warnings[:15]:
            if y < 30 * mm:
                break
            c.drawString(MARGIN + 5 * mm, y, f"• {w.message}")
            y -= 4.5 * mm

    # battery analysis
    y -= 8 * mm
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(MARGIN, y, "Battery Analysis")
    y -= 7 * mm

    dp = data.drone_profile
    fp = data.flight_plan
    if dp and dp.endurance_minutes and fp and fp.estimated_duration:
        endurance_secs = dp.endurance_minutes * 60
        usage_pct = (fp.estimated_duration / endurance_secs) * 100
        remaining_pct = max(0, 100 - usage_pct)

        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#555555"))
        c.drawString(MARGIN + 5 * mm, y, f"Drone Endurance: {dp.endurance_minutes:.0f} min")
        y -= 5 * mm
        dur_str = _format_duration(fp.estimated_duration)
        c.drawString(MARGIN + 5 * mm, y, f"Est. Flight Time: {dur_str}")
        y -= 5 * mm
        c.drawString(MARGIN + 5 * mm, y, f"Est. Battery Usage: {usage_pct:.1f}%")
        y -= 5 * mm

        if remaining_pct < 20:
            c.setFillColor(colors.HexColor("#e54545"))
        elif remaining_pct < 40:
            c.setFillColor(colors.HexColor("#e5a545"))
        else:
            c.setFillColor(colors.HexColor("#3bbb3b"))
        c.drawString(MARGIN + 5 * mm, y, f"Est. Remaining: {remaining_pct:.1f}%")
    else:
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor("#555555"))
        msg = "Battery analysis not available (no drone profile or duration)."
        c.drawString(MARGIN + 5 * mm, y, msg)

    _draw_footer(c)
    c.showPage()
    return page_num


# geometry helpers


def _point_in_polygon(px: float, py: float, polygon: list[tuple[float, float]]) -> bool:
    """ray-casting point-in-polygon test."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _point_near_polygon(
    px: float,
    py: float,
    polygon: list[tuple[float, float]],
    threshold_m: float,
) -> bool:
    """check if point is within threshold meters of any polygon edge."""
    for i in range(len(polygon) - 1):
        x1, y1 = polygon[i]
        x2, y2 = polygon[i + 1]
        dx, dy = x2 - x1, y2 - y1
        len_sq = dx * dx + dy * dy
        if len_sq == 0:
            nearest_x, nearest_y = x1, y1
        else:
            t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / len_sq))
            nearest_x = x1 + t * dx
            nearest_y = y1 + t * dy
        dist = distance_between(px, py, nearest_x, nearest_y)
        if dist < threshold_m:
            return True
    return _point_in_polygon(px, py, polygon)
