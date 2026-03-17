# TarmacView — Domain & UI Specification Reference

**Purpose:** Condensed reference for anyone implementing features. Contains the domain model, enum values, trajectory formulas, UI page specs, and status rules. Read this before implementing any issue.

---

## Domain Model (19 tables)

### Airport Infrastructure

**airport** — icao_code (VARCHAR 4, unique), name, elevation, location (PointZ 4326)

**airfield_surface** — airport_id (FK), identifier (VARCHAR 10), surface_type (RUNWAY|TAXIWAY discriminator), geometry (LineStringZ 4326). RUNWAY adds: heading, length, width, threshold_position (PointZ), end_position (PointZ). TAXIWAY adds: width. Single-table inheritance.

**obstacle** — airport_id (FK), name, position (PointZ 4326), height, radius, geometry (PolygonZ 4326), type (ObstacleType enum)

**safety_zone** — airport_id (FK), name, type (SafetyZoneType enum), geometry (PolygonZ 4326), altitude_floor, altitude_ceiling, is_active

### AGL / PAPI Lighting

**agl** — surface_id (FK), agl_type (VARCHAR 30), name, position (PointZ 4326), side (VARCHAR 10), glide_slope_angle, distance_from_threshold, offset_from_centerline

**lha** (Light Housing Assembly) — agl_id (FK), unit_number, setting_angle, transition_sector_width, lamp_type (LampType enum), position (PointZ 4326)

### Inspection Templates

**inspection_template** — name, description, default_config_id (FK → inspection_configuration), angular_tolerances, created_by, created_at

**insp_template_targets** — template_id (FK), agl_id (FK). Junction table.

**insp_template_methods** — template_id (FK), method (VARCHAR 30). Junction table.

**inspection_configuration** — altitude_offset, speed_override, measurement_density (INTEGER), custom_tolerances, density

### Mission & Inspection

**mission** — name, status (MissionStatus enum), created_at, operator_notes, drone_profile_id (FK), date_time, default_speed, default_altitude_offset, takeoff_coordinate (PointZ 4326), landing_coordinate (PointZ 4326)

**drone_profile** — name, manufacturer, model, max_speed, max_climb_rate, max_altitude, battery_capacity, endurance_minutes, camera_resolution, camera_frame_rate (INTEGER), sensor_fov, weight

**inspection** — mission_id (FK), template_id (FK), config_id (FK → inspection_configuration), method (VARCHAR 30), sequence_order

### Flight Plan & Output

**flight_plan** — mission_id (FK, unique), airport_id (FK), total_distance, estimated_duration, is_validated, generated_at, constraints (via constraint_rule)

**waypoint** — flight_plan_id (FK), inspection_id (FK nullable), sequence_order, position (PointZ 4326), heading, speed, hover_duration, camera_action (CameraAction enum), waypoint_type (WaypointType enum), camera_target (PointZ 4326)

**validation_result** — flight_plan_id (FK, unique), passed, validated_at

**validation_violation** — validation_result_id (FK), constraint_id (FK), is_warning, message

**export_result** — flight_plan_id (FK), file_name, format (ExportFormat enum), file_path, exported_at

**constraint_rule** — name, constraint_type (discriminator), is_hard_constraint. Subtypes: AltitudeConstraint (min/max_altitude), SpeedConstraint (max_horizontal/vertical_speed), BatteryConstraint (max_flight_time, reserve_margin), RunwayBufferConstraint (lateral/longitudinal_buffer), GeofenceConstraint (boundary PolygonZ 4326). Single-table inheritance.

---

## Enum Values

| Enum | Values |
|------|--------|
| MissionStatus | DRAFT, PLANNED, VALIDATED, EXPORTED, COMPLETED, CANCELLED |
| WaypointType | TAKEOFF, TRANSIT, MEASUREMENT, HOVER, LANDING |
| CameraAction | NONE, PHOTO_CAPTURE, RECORDING_START, RECORDING_STOP |
| ExportFormat | MAVLINK, KML, KMZ, JSON |
| InspectionMethod | VERTICAL_PROFILE, ANGULAR_SWEEP |
| SafetyZoneType | CTR, RESTRICTED, PROHIBITED, TEMPORARY_NO_FLY |
| ObstacleType | BUILDING, TOWER, ANTENNA, VEGETATION, OTHER |
| LampType | HALOGEN, LED |
| PAPISide | LEFT, RIGHT |

---

## Mission Status State Machine

```
DRAFT → PLANNED → VALIDATED → EXPORTED → COMPLETED
                                        → CANCELLED
```

**Transitions:**
- DRAFT → PLANNED: automatic after trajectory generation succeeds
- PLANNED → VALIDATED: operator clicks Accept
- VALIDATED → EXPORTED: operator triggers export
- EXPORTED → COMPLETED: operator marks mission done
- EXPORTED → CANCELLED: operator abandons mission

**Regression rules:**
- Any waypoint edit (move, add, delete) → status regresses to PLANNED
- Config change affecting trajectory (drone, framerate-related) → regresses to PLANNED
- Config change NOT affecting geometry → validate only, no regression

**Status gating:**
- Export button: disabled until VALIDATED
- Complete/Cancel buttons: disabled until EXPORTED
- COMPLETED and CANCELLED are terminal states — no further actions

---

## Trajectory Generation Algorithm (5 phases)

### Phase 1 — Load mission data
Load airport infrastructure, drone profile, resolve inspection configs (mergedefaults with operator overrides via `resolveWithDefaults()`).

### Phase 2 — Inspection loop
Iterate inspections by `sequenceOrder`. For each: resolve config, check `isSpeedCompatibleWithFrameRate()`, compute LHA center point (centroid of selected LHA positions).

### Phase 3 — Waypoint computation

**ANGULAR_SWEEP:**
```
xi = xc + r · sin(θi)
yi = yc + r · cos(θi)
```
Arc centered on LHA center point. Radius ≥ 350m. Sweep ±10° from extended centerline. Waypoints at angular steps: Δθ = 2α/n (n = measurement density). Constant altitude at glide slope.

**VERTICAL_PROFILE:**
```
hi = d · tan(φi)
```
Fixed horizontal distance d from LHA center. Altitude varies from ~1.9° to ~6.5° elevation angle. Waypoints at altitude steps by measurement density.

### Phase 4 — Validation
Check each waypoint against all constraints. PostGIS `ST_Contains` for geofence, `ST_DWithin` for runway buffer. Hard failure → terminate. Soft violation → add warning.

### Phase 5 — Final assembly
Compute transit paths between segments (straight-line for MVP). Add TAKEOFF from `mission.takeoff_coordinate`, LANDING from `mission.landing_coordinate`. Compile FlightPlan with totalDistance, estimatedDuration. Set status to PLANNED.

**Camera heading:** MEASUREMENT waypoints point at LHA center. TRANSIT/TAKEOFF/LANDING point in direction of travel.

---

## UI Pages — Wireframe Summary

### Page 01 — Login (`/login`)
Email + password. JWT with refresh tokens. Wrong credentials: inline error. After login: load last airport → dashboard. No airport → airport selection.

### Page 02 — Airport Selection (`/airport-selection`)
Search by ICAO + name. List: name, ICAO, city, country. Click selects → loads ALL airport data → dashboard. Users see only their assigned airports.

### Page 03 — Dashboard (`/operator-center/dashboard`)
Left: mission list (searchable, clickable), statistics placeholder, drone profile read-only, "+ New Mission" button. Right: read-only MapLibre map with airport assets, layer toggles, PoI info panel, legend.

### Page 04 — Mission Overview (`/operator-center/missions/:id/overview`)
Tabs: **Overview** | Configuration | Map | Validation & Export. Left (read-only): mission info, warnings ("Compute trajectory to see warnings" before generation), estimated stats, validation status. Right: interactive but read-only map preview, "Modify Parameters" → Config tab, "Open Map" → Map tab.

### Page 05 — Mission List (`/operator-center/missions`)
Filters: status, date, drone, operator. Columns: ID, name, airport, status, drone, created, updated. Pagination 10/20/50/200. Row actions: duplicate, rename, delete. "Add New" → creation flow (name, template, drone).

### Page 06 — Mission Map (`/operator-center/missions/:id/map`)
Full-screen MapLibre. Toolbar: undo/redo (10 max, per-session), save, recompute. Left: layers, inspection filter (multi-select), waypoint list (click=info, double-click=fly to), waypoint info editor. Right: legend, warnings (clickable), stats.

**Waypoint editing:** Waypoint mode (default): move, add transit between existing (hover segment → "+"), delete. Camera mode (toggle): edit camera heading targets. Only TRANSIT addable by operator. START/END placement via toolbar. Any edit → PLANNED.

**Recompute logic:** Waypoint-only edits → validate only. Config changes → full 5-phase regeneration.

**Map layers:** Runway polygons, safety zones (color by type), obstacles (point + buffer circle), AGL markers, waypoint path (polyline + arrows), waypoints (numbered, colored by type + inspection), transit segments (dashed).

**3D View:** CesiumJS separate viewer toggle. Orbit from any angle. Altitude native. View-only (editing is 2D only).

### Page 07 — Mission Configuration (`/operator-center/missions/:id/configuration`)
Left: reorderable inspection list with add/remove, per-inspection params (altitudeOffset, speedOverride, measurementDensity, customTolerances, hoverDuration), speed/framerate warning, LHA checkboxes, drone selector, takeoff/landing coordinates. Right: map preview, waypoint list (after generation). "Compute Trajectory" button (blocks UI). "Edit Waypoints" → Map tab.

### Page 08 — Validation & Export (`/operator-center/missions/:id/validation-export`)
Left: per-constraint breakdown (pass/fail/warning), "Edit Configuration" → Config tab, "Accept" → VALIDATED. Right: map + export section (KML/KMZ/JSON/MAVLink checkboxes, download button). Export disabled until VALIDATED. Complete/Cancel disabled until EXPORTED. Delete available always.

### Page 09 — Airport (Operator) (`/operator-center/airport`)
Read-only full airport view. All infrastructure on map. Left: surface list, AGL/PoI list. Everything clickable.

### Page 10 — Coordinator: Airport Editing (`/coordinator-center/airports/:id`)
Left: collapsible CRUD sections for Ground Surfaces, Obstacles, Safety Zones, AGL+LHA. Map: editable via Leaflet.draw (polygons, circles, rectangles, point placement, vertex dragging, GeoJSON text editing). Undo/Redo + Save.

### Page 11-14 — Coordinator: Lists + Editors
Airport list, inspection template editor (AGL selector, LHA checkboxes, default config, method), drone profile editor (12 fields), inspection template list. All follow same list pattern: search, filters, pagination, add/duplicate/delete.

---

## Map Architecture

- **2D editing:** MapLibre GL JS — satellite tiles (ESRI World Imagery), pitch/bearing via middle mouse
- **3D visualization:** CesiumJS — separate viewer tab, orbital view, altitude native
- **Coordinator drawing:** Leaflet.draw for geometry editing
- **Coordinate system:** WGS84 / SRID 4326
- **Performance target:** 250 waypoints comfortable, 500 max

## Global UI Patterns

- **Save:** manual via Save button. Unsaved changes guard on navigation.
- **Undo/Redo:** waypoint edits only, max 10, per-session, resets on param changes
- **List Item Actions:** row end: duplicate/rename/delete. Dropdown: same + deselect.
- **Delete:** always confirmation dialog with impact description
- **Max 5 inspections per mission.** Fixed color per inspection order.
- **Desktop only** — no mobile optimization

---

## DDD-Lite Patterns

### Aggregate Roots

- **Mission** — owns inspections, controls status transitions via `transition_to()`. Enforces DRAFT-only for inspection add/remove, max 10 inspections, auto-regresses VALIDATED->PLANNED on trajectory-affecting changes.
- **Airport** — owns surfaces, obstacles, safety zones via `add_surface()`, `add_obstacle()`, `add_safety_zone()`. Sets `airport_id` on child entities.

### Value Objects (`backend/app/models/value_objects.py`)

- **Coordinate** — immutable (lat, lon, alt) with range validation, `to_wkt()` method
- **Speed** — non-negative float value
- **AltitudeRange** — min <= max invariant, `contains()` method
- **IcaoCode** — exactly 4 uppercase alpha characters

### Business Methods on Entities

- `Mission.transition_to(target_status)` — enforces state machine
- `Mission.regress_if_validated()` — VALIDATED -> PLANNED on trajectory changes
- `Mission.add_inspection(inspection)` / `remove_inspection(id)` — DRAFT-only with max 10
- `Mission.change_drone_profile(id)` — auto-regresses
- `Airport.add_surface/obstacle/safety_zone()` — sets airport_id on child
- `InspectionConfiguration.resolve_with_defaults(template_config)` — merges overrides
- `AGL.calculate_lha_center_point()` — centroid of LHA positions
- `Inspection.is_speed_compatible_with_frame_rate(drone, speed)` — speed/framerate check
- `FlightPlan.compile(total_distance, estimated_duration)` — sets metrics and timestamp
