# TarmacView — Wireframe Specification & Design Decisions

**Project:** Design and Implementation of a Drone Mission Planning Module for Airport Lighting Inspection
**Author:** Štefan Moravík
**Last Updated:** 2026-03-14
**Status:** Complete — ready for GitHub issue creation

---

## Architecture Decisions

### Tech Stack
- **Frontend:** React 18 + TypeScript + Vite
- **2D Map:** MapLibre GL JS (free open-source fork of Mapbox)
- **3D Map:** CesiumJS (separate 3D viewer for flight plan visualization)
- **Drawing Tools:** Leaflet.draw (for Coordinator map editing)
- **Satellite Tiles:** ESRI World Imagery (free for academic use)
- **Coordinate System:** WGS84 for display, PostGIS SRID 4326 internally
- **Backend:** Spring Boot 3 + Java 21 + Spring Data JPA
- **Database:** PostgreSQL 16 + PostGIS 3.4 on Amazon RDS
- **Auth:** JWT with refresh tokens stored in localStorage, Spring Security custom JWT filter
- **Deployment:** Spring Boot on AWS Lambda via SnapStart (`aws-serverless-java-container-springboot3`), React on AWS Amplify Hosting, PostgreSQL on Amazon RDS

### Application Structure
- Single React app with two route trees: `/operator-center` and `/coordinator-center`
- Role-based routing: login response includes user roles, Operator sees Mission Control Center nav, Coordinator sees Configurator Center nav
- Admin manages user accounts and role assignments — outside thesis scope

### Map Architecture
- **2D editing:** MapLibre GL JS — supports pitch/bearing tilt, satellite tiles, drawing tools via terra-draw
- **3D visualization:** CesiumJS — separate viewer tab for orbital 3D flight plan review, altitude shown natively, no separate elevation panel needed in 2D
- **Coordinator drawing:** Leaflet.draw for polygons, circles, rectangles, point placement, vertex dragging, GeoJSON text editing
- **Middle mouse button:** Changes 3D pitch/bearing view in MapLibre
- **Satellite imagery:** ESRI World Imagery via MapLibre raster source
- **Performance target:** 250 waypoints comfortable, 500 max, SVG renderer (no marker clustering)

---

## Global Patterns

### List Item Action Pattern
Referenced throughout the app. Every list item (missions, airports, inspections, drones) follows this pattern:
- **Row actions (end of row):** Duplicate, Rename, Delete
- **Dropdown header actions (in the selection dropdown):** Pencil (rename), Deselect (x), Dropdown (v)
- **Dropdown list items:** Rename, Duplicate, Delete
- **Role restrictions:** Operators cannot delete/edit airport infrastructure, safety zones, obstacles, AGL systems
- **Delete always triggers confirmation dialog:** "Are you sure you want to delete [item name]?" with mission/reference listing if the item is in use

### Save & Unsaved Changes
- **Save is manual** via Save button
- **Unsaved changes guard:** When navigating away from a dirty form, dialog appears: "You have unsaved changes. Save / Don't Save / Cancel"
- **"Saved Status Last Updated"** timestamp shown next to save button on all editing pages

### Undo/Redo
- **Scope:** Waypoint edits only (on Map tab and Coordinator map)
- **Resets:** When parameters or AGL changes are made, undo stack clears
- **Max depth:** 10 actions per session
- **Not persisted** across sessions or page navigations

### Error Handling
- Deferred to implementation phase — not specified in wireframes
- Generic error states will be handled globally

### Loading States
- Login: loading indicator during authentication
- Trajectory computation: blocks UI, button shows progress indicator, expected runtime in seconds
- All API calls: appropriate loading indicators (implementation detail)

### Confirmation Dialogs
- Required before: deleting any entity, cancelling a mission, completing a mission
- Format: modal dialog with item name and impact description
- For drone deletion: shows list of missions referencing that drone

### Notifications
- Low priority — toast notifications in upper right corner
- Triggers: flight plan generated, export successful, validation failed
- Not a blocking requirement for initial implementation

### Responsive Behavior
- Desktop web app — no mobile optimization
- Minimum supported viewport: to be determined during implementation

### Theme & Language
- Light and dark mode supported
- Multiple language support prepared for future extension
- Language selector in settings

---

## Page Specifications

---

### Page 01 — Login

**Route:** `/login`

**Authentication:**
- JWT with refresh tokens
- Refresh token stored in localStorage
- Spring Security with custom JWT filter
- Login response includes user roles (Operator, Coordinator, Admin)

**Behavior:**
- After successful login: loads last remembered airport, forwards to dashboard
- If no airport remembered: forwards to Airport Selection
- Wrong credentials: inline error message "Wrong login credentials. Try again."
- Loading indicator shown during authentication

**Out of Scope:**
- Forgot password flow
- Account creation (admin-only, outside thesis)
- Registration

---

### Page 02 — Airport Selection

**Route:** `/airport-selection`

**When shown:**
- No airport currently selected
- No airport remembered from previous session
- User clicks X on "Selected Airport" in nav bar

**Airport Row Info:**
- Airport Name
- ICAO Code
- City and Country

**Search:** Filters by ICAO code AND name simultaneously

**Data Loading:** Selecting an airport loads ALL airport data (runways, safety zones, AGL targets, obstacles) for smooth experience

**Access Control:** Each user has assigned Airport Code(s). User sees only airports assigned to them. Admin sees all.

**Empty State:** "No Airports Available" message in the list area

**Airport Switching:** Also available via "Selected Airport" dropdown in nav bar on any page

---

### Page 03 — Mission Dashboard

**Route:** `/operator-center/dashboard`

**Layout:**
- Top nav: TarmacView Mission Control Center | Dashboard | **Missions** | Airport | Results | Selected Airport dropdown | Username dropdown
- "Results" tab: placeholder, inaccessible, out of thesis scope (shows inspection results from drone data + computer vision)
- "Configurator" access: only in Username dropdown menu, visible only to Coordinators
- Light/Dark mode toggle and Language selector in settings

**Left Panel:**
- Mission List: clickable, searchable list of missions for selected airport
- Statistics: filler content (avg inspection time, inspections done, etc.)
- Drone Profile: read-only display of drones available to this airport. If only one drone: show that drone's basic info (name, endurance, missions done). Not editable from dashboard.
- **"+ New Mission" button** below mission list

**Right Panel:**
- Map Preview: **read-only**, shows all airport assets by default (runways, obstacles, safety zones, AGLs)
- Layers panel: runways, obstacles, safety zones, AGLs
- Waypoint/PoI Info panel: displays info about any map object the user clicks (AGL, obstacle, safety zone — anything stored in DB)
- Legend

**Removed from wireframe (mistake):** "Modify Parameters" and "Open Map" buttons do NOT appear on dashboard

**Log out:** In username dropdown, forwards to login page (no confirmation needed)

---

### Page 04 — Missions Overview (Mission Selected)

**Route:** `/operator-center/missions/:id/overview`
**Tab:** Overview | Configuration | Map | Validation & Export

**Mission Selection Header:**
- "Mission ID - Name" with actions: pencil (rename), x (deselect → forward to mission list), v (dropdown with mission list showing IDs and names for quick switching, includes rename/duplicate/delete per item)

**Left Panel (all read-only on Overview):**
- **Mission Info:** name, created date, airport, runway, drone profile, status, operator notes
- **Warnings:** Empty with note "Compute trajectory to see warnings" before trajectory exists. After computation: list of warnings. If no warnings: "No warnings present"
- **Mission Estimated Stats:** total distance, estimated time, battery consumption, number of inspections. Empty before trajectory computation.
- **Validation Status:** Empty with note "Trajectory needs to be computed" before computation. After computation: minimal validation stats and status.

**Right Panel:**
- Map Preview: **interactive but read-only** (user can pan, zoom, click objects for info but cannot edit)
- Shows airport assets by default. After trajectory generation: also shows waypoints and trajectory for this mission
- Default display: waypoints and AGLs specific to this mission + all safety zones and obstacles
- Layers panel, PoI Info panel, Legend
- **"Modify Parameters"** button → navigates to Configuration tab
- **"Open Map"** button → navigates to Map tab
- Map preview updates automatically when changes are made and new trajectory is generated

**Version System:** NO version system. Only one flight plan per mission with "Last Updated" timestamp.

**Status-dependent behavior:** Page layout is the SAME for all statuses. Difference is only in content:
- Before trajectory: map shows no waypoints, warnings/validation/stats panels show placeholder notes
- After trajectory (PLANNED+): all panels populated with data

---

### Page 05 — Missions List (No Mission Selected)

**Route:** `/operator-center/missions`

**Filters:** Status, date range, drone profile, operator name

**Columns:** ID, Name, Airport, Status, Drone, Created, Last Updated

**Sorting:** Click column header to toggle ASC/DESC. Available on all columns (alphabetical or numeric).

**Pagination:** 10 items default. Options: 10, 20, 50, 200.

**Row Actions:** Duplicate, Rename, Delete (List Item Action Pattern)

**Bulk Actions:** Bulk Delete, Archive

**"Add New" button:** Opens mission creation flow. Minimal required fields for DRAFT:
- Name
- Inspection (template selection)
- Drone profile
- All other configuration pre-filled from templates
- Before trajectory computation: operator must provide takeoff/landing waypoint (can be the same point)

**Empty State:** Same pattern as empty airport list — "No Missions Available"

**Click Row:** Opens Missions Overview tab with that mission selected

---

### Page 06 — Missions Map (Full Map View)

**Route:** `/operator-center/missions/:id/map`
**Tab:** Overview | Configuration | **Map** | Validation & Export

**Toolbar:**
- Undo / Redo (waypoint edits only, max 10, per-session, resets on param/AGL changes)
- Save (manual save only)
- "Saved Status Last Updated" timestamp
- Recompute Trajectory button: replaces "Save & Validate", triggers save + recomputation. Grayed out / not clickable when no changes made and trajectory is current. If saved but validation not current: exclamation mark + note in saved status area.

**Left Panel:**
- Layers (same as overview + mission-specific: waypoint path, waypoints by type/inspection, transit segments)
- Inspection Select: dropdown with checkboxes — filters which inspections' waypoints are visible and editable. "Select All" button included.
- Waypoint List: scrollable table. Single click → show waypoint info + highlight on map. Double click → map flies/centers to that waypoint.
- Waypoint Info panel: lat, lon, alt, speed, heading, action, type, inspection reference, camera heading. Editable fields.

**Right Panel:**
- Legend
- Warnings: same content as Overview (not filtered). When a warning is obstacle/waypoint-based: clicking it shows waypoint info and flies map to that area.
- Estimated Stats / Summary: duplicate of overview but reacts to which inspections are currently selected in dropdown.

**Map Controls:** Pan, Select, Measure Distance, Zoom, Zoom Reset, Add START waypoint, Add END waypoint

**Waypoint Editing Workflow:**
- **Toggle modes:** Camera edit mode vs. Waypoint edit mode
  - **Waypoint mode:** user can move waypoints on map, hover over line between two waypoints shows "+" to insert a new transit waypoint between them
  - **Camera mode:** user can edit camera heading target points for each waypoint. All waypoints have camera heading points (for PAPI: the LHA center point). This requires adding a `cameraTarget` field to the Waypoint entity.
- **Operator restrictions:** Can only add TRANSIT waypoints between existing ones. Cannot add MEASUREMENT waypoints. Can change waypoint density for measurement and arc radius (ANGULAR_SWEEP) / vertical height (VERTICAL_PROFILE) — these are overrides from the config.
- **START/END waypoints:** User places on map → writes to `MissionConfiguration.takeoffCoordinate` / `landingCoordinate`. Also visible in Configuration tab (coordinates only, editable there too). Can use same point for both. Automatically connects to first/last waypoint.
- **Waypoint deletion:** Click waypoint once → delete button appears. On deletion: previous and next waypoints relink (linked list behavior).
- **Type changes:** Only TRANSIT can be added by operator. Operator cannot change MEASUREMENT, START, or END types. This keeps thesis scope manageable.

**Status effects:** ANY manual waypoint edit (add, move, delete, change) sets mission status back to PLANNED (invalidates VALIDATED status). User must revalidate.

**Map Layers Detail:**
- Runway geometry: polygon
- Safety zones: colored polygons with labels, color-coded by SafetyZoneType. 2D: polygons only. 3D: objects with opacity.
- Obstacles: point + height + bufferRadius (cylinder in 3D, circle in 2D), color-coded same as safety zones by ObstacleType
- AGL targets: markers with type icons
- Waypoint path: polyline with flight direction arrows (one arrow in middle of each line segment)
- Waypoints: numbered circles, color-coded by type AND by inspection (5 fixed colors for inspections 1–5)
  - TAKEOFF, TRANSIT, LANDING: dotted lines, distinct color
  - MEASUREMENT: full lines, distinct color
  - HOVER: full lines, distinct color
  - LHA arc center point: different color and icon, measurement waypoints point at it and connected to it
- Transit segments: dashed polyline
- **Simplified trajectory toggle (layer):** Smooth Bezier interpolated curve without waypoint dots — clean visualization of overall path

**3D View (Cesium):**
- Separate viewer (toggle between 2D MapLibre and 3D Cesium)
- User can orbit trajectory from any angle
- Altitude shown natively — no separate elevation panel needed
- Waypoint height editing: line with draggable dot for up/down movement
- 3D safety zones and obstacles with opacity
- Waypoint editing: 2D only. 3D is for visualization.

**Map Interaction:**
- Scroll wheel: zoom
- Pan mode selected: left click + drag to pan. OR right button held = pan.
- Middle mouse button held: change 3D pitch/bearing view (MapLibre tilt)
- Click waypoint: highlight + show info
- Double-click waypoint: center/fly to
- Hover line between waypoints: "+" appears to add transit waypoint

**Recompute Trajectory Logic:**
- When triggered from Config tab ("Compute Trajectory"): full 5-phase pipeline, regenerates ALL waypoints from scratch
- When triggered from Map tab ("Recompute Trajectory") after config changes (framerate, drone change): full recomputation needed because density/constraints change
- When triggered from Map tab after waypoint-only edits (move, add transit point): VALIDATE only — runs SafetyValidator on current waypoints without regenerating. Does not overwrite manual edits.
- When config changes NOT connected to trajectory geometry are made: validate only

---

### Page 07 — Missions Configuration

**Route:** `/operator-center/missions/:id/configuration`
**Tab:** Overview | **Configuration** | Map | Validation & Export

**Left Panel:**
- **Inspection numbered list:** Reorderable (changes `sequenceOrder` = physical flight sequence). Checkboxes for selection. "Add Inspection" button opens list of available inspection templates for this airport.
- When inspection selected: shows configuration parameters for that inspection. When none selected: shows whole mission config and overrides.
- **Inspection configuration parameters (per selected inspection):** altitudeOffset (m), speedOverride (m/s), measurementDensity (pts), customTolerances (°), hoverDuration (s). All with units and valid ranges from drone profile limits.
- **Inline warning** for `isSpeedCompatibleWithFrameRate()` when speed override is too high
- **AGL targets for selected inspection:** checkboxes for LHA selection within the inspection's AGL system. Operator can select/deselect LHAs but cannot change which AGL system the inspection uses (set by template).
- **Method selection:** Defined by the inspection template (e.g., "PAPI Inspection - Vertical Sweep"). Method is implicit from template type — not a separate dropdown.
- **Drone Selector:** Changing drone invalidates validation status for existing trajectory, triggers warning that validation is not current.
- **Warnings:** Post-computation only. Before trajectory: note that computation is needed.
- **Estimated Stats:** Post-computation only.

**Right Panel:**
- Map Preview + Layers: before generation shows airport + AGL targets. After generation: full trajectory.
- Operator can click AGL targets on map preview to select/deselect LHAs (when inspection is selected). When no inspection selected: whole AGL system shown.
- Waypoint List and Waypoint Info (after trajectory exists)
- Legend

**Compute Trajectory button:** Blocks UI with progress indicator in button. Expected runtime: seconds. Triggers full 5-phase pipeline.

**Edit Waypoints button:** Navigates to Map tab. If unsaved changes exist: triggers save warning dialog.

**Takeoff/Landing:** Visible as coordinates from `MissionConfiguration`. Editable here as coordinate input fields. Also settable on Map tab by placing START/END waypoints.

**Missing from wireframe but needed:**
- "Add Inspection" button in the numbered list
- Takeoff/landing coordinate fields

---

### Page 08 — Missions Validation & Export

**Route:** `/operator-center/missions/:id/validation-export`
**Tab:** Overview | Configuration | Map | **Validation & Export**

**Left Panel:**
- **Validation Results & Status:** Per-constraint breakdown: altitude (pass/fail/warning), speed, geofence, battery, runway buffer, obstacle clearance
- **"Edit Configuration" button:** Navigates to Configuration tab
- **"Accept" button:** Sets status to VALIDATED. Not clickable when already VALIDATED. Any changes → status reverts to PLANNED.

**Right Panel:**
- Map Preview + Layers + Waypoint list/info + Legend
- **Export section:**
  - Export Format: checkboxes (KML, KMZ, JSON, MAVLink). User can select multiple.
  - "Download Export": direct browser download
  - **Export grayed out / disabled** until status is VALIDATED. Shows info note: "Validate the plan first"
- **Complete / Cancel / Delete:**
  - Complete: sets COMPLETED (terminal state). Only available after EXPORTED.
  - Cancel: sets CANCELLED (terminal state). Only available after EXPORTED.
  - Delete: removes from database entirely. Available at any status. Confirmation dialog required.
  - Complete and Cancel grayed out / disabled until EXPORTED.

**Status gating summary:**
- DRAFT/PLANNED: Accept button available. Export grayed out. Complete/Cancel grayed out.
- VALIDATED: Accept not clickable. Export available. Complete/Cancel grayed out.
- EXPORTED: Accept not clickable. Export available. Complete/Cancel available.
- COMPLETED/CANCELLED: all actions disabled (terminal states).

**No export history:** Each export is a one-time download. Previous exports are not stored.

**Status transitions on changes:**
- Waypoint edits (move, add, delete) → status back to PLANNED
- Config changes (drone, framerate-related) → status back to PLANNED
- Accepting → VALIDATED
- Exporting → EXPORTED

---

### Page 09 — Airport Page (Operator View)

**Route:** `/operator-center/airport`

**Purpose:** Read-only view of the entire airport with all infrastructure

**Content:**
- Map showing: runway and taxiway polygons (ground surfaces), all AGL systems, all safety zones, all obstacles
- Left panel: Ground Surfaces list, AGL systems/Points of Interest list
- Every DB-stored object is clickable → shows info in PoI panel
- Legend, Layers

**Strictly read-only for Operator.** No editing capability.

---

### Page 10 — Configurator: Airport Editing (Coordinator)

**Route:** `/coordinator-center/airports/:id`

**Nav:** TarmacView Configurator Center | Mission Center | **Airports** | Inspections | Drones | Selected Airport | Username

**Left Panel — collapsible sections:**
- **Ground Surfaces:** Type selector (RUNWAY / TAXIWAY). CRUD for all surfaces.
- **Obstacles:** CRUD. Point + height + bufferRadius. Types from ObstacleType enum.
- **Safety Zones:** CRUD. Polygon geometry. Types from SafetyZoneType enum.
- **AGL and LHA:** CRUD. Create AGL → name it → add LHAs by clicking "Add LHA" → place on map or enter coordinates.

**Map (EDITABLE):**
- Drawing tools: polygons (click to add corners, right-click to finish), circles with radius, rectangles, point placement
- Coordinate entry: alternative to drawing — enter coordinates and click "add point to polygon" or "delete existing point"
- Vertex dragging on existing polygons
- GeoJSON text editing for all geometries (both visual and text editing available)
- Undo/Redo + Save (same pattern as mission map)

**PAPI creation workflow:** Coordinator clicks "Create New AGL" → names it → adds LHAs one by one (click "Add LHA" → place on map or enter coordinates). PAPI has exactly 4 LHAs but coordinator is not software-limited (specialist knowledge assumed).

---

### Page 11 — Configurator: Airport List (Coordinator)

**Route:** `/coordinator-center/airports`

**Same pattern as Mission List:** search, filters, columns, sorting, pagination, List Item Action Pattern

**"Add New" minimal fields:** ICAO code, name, coordinates, elevation

---

### Page 12 — Configurator: Inspections (Coordinator)

**Route:** `/coordinator-center/inspections/:id`

**Purpose:** Coordinator creates and edits inspection TEMPLATES (reusable). Operators use these templates and can override parameters per mission.

**Content:**
- AGL system selector: one AGL system per inspection template. Coordinator selects which AGL.
- LHA checkboxes: within the selected AGL system, coordinator picks which specific LHAs are targets
- Inspection configuration parameters: DEFAULT values (altitudeOffset, speedOverride, measurementDensity, customTolerances, hoverDuration). Operator can override per mission.
- Method selection: set in inspection configuration (ANGULAR_SWEEP or VERTICAL_PROFILE)
- Map preview: shows the AGL targets the coordinator has selected, highlighted on the airport map
- PoI Info panel (NOT waypoint list — templates have no waypoints)

**Templates are airport-specific** — tied to that airport's AGL systems.

**Inspection template list page (missing from wireframe, needs to be added):** Same pattern as other lists — search, filters, list, add new. "Add New" also available as first item in dropdown.

**Constraints:** Auto-derived from drone profile + safety zones. Coordinator does NOT define custom constraints. Kept out of thesis scope.

**Coordinator also defines:** the inspection template name, description, default parameters. No edit waypoints functionality on coordinator pages.

---

### Page 13 — Configurator: Drones (Coordinator)

**Route:** `/coordinator-center/drones/:id`

**Drone Profile Fields:** name, maxAltitude, maxSpeed, batteryCapacity, maxFlightTime, maxPayload, sensorFOV, cameraFrameRate (all with units and validation)

**Actions:**
- Add: new from scratch
- Duplicate: creates copy with "(Copy)" suffix
- Delete: allowed even if referenced by missions — shows warning with list of affected missions. Confirmation dialog required.

**Drone list page:** search, filters (Drone Search, Drone Filters), list, "Add New", "Duplicate", "Delete" buttons. List Item Action Pattern applies.

---

### Page 14 — Configurator: Inspection List (Coordinator) — MISSING WIREFRAME

**Route:** `/coordinator-center/inspections`

**Needed:** Same pattern as airport list and drone list. Search, filters, list, Add New. First item in dropdown is also "Add New." List Item Action Pattern applies.

---

## Inspection Color Mapping (Map)

| Inspection # | Color |
|---|---|
| 1 | To be defined (e.g., Blue) |
| 2 | To be defined (e.g., Green) |
| 3 | To be defined (e.g., Orange) |
| 4 | To be defined (e.g., Purple) |
| 5 | To be defined (e.g., Red) |

**Maximum 5 inspections per mission.** Colors are fixed to inspection order, not configurable.

---

## ERD Changes Required

Based on design decisions:

1. **Waypoint entity — add field:** `cameraTarget` (Coordinate) — stores the point where the camera should look for each waypoint
2. **Obstacle entity — confirm field:** `bufferRadius` (Double) — already in ERD, used for cylinder in 3D / circle in 2D
3. **InspectionTargets multiplicity:** Change to one AGL system per inspection (was potentially N — clarify and align ERD)

---

## Deployment Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Amplify     │────▸│  API Gateway +   │────▸│  Amazon RDS     │
│  Hosting     │     │  Lambda (SnapStart)│     │  PostgreSQL +   │
│  (React SPA) │     │  (Spring Boot 3) │     │  PostGIS        │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

- **Frontend:** AWS Amplify Hosting (CI/CD built-in)
- **Backend:** AWS Lambda with SnapStart + API Gateway (Spring Boot 3 via `aws-serverless-java-container-springboot3`)
- **Database:** Amazon RDS PostgreSQL with PostGIS extension
- **Cold start:** ~1s with SnapStart (acceptable)
- **Limitations:** No WebSockets (fine — REST only), payload size limits (10MB via API Gateway — sufficient for flight plan exports)
