# Planned Issues

Issues are ordered by priority within each section.

---

## Zephyr UAS feedback (Jaroslav Šulc, 2026-04-19)

---

### Z2. Derive PAPI Horizontal Range altitude from LHA setting angles

The PAPI Horizontal Range inspection altitude must place the drone in the all-white zone (above all PAPI transition sectors). Currently, the trajectory uses `AGL.glide_slope_angle` directly which could put the drone at the transition boundary instead of safely in the all-white zone.

We trust the coordinator's LHA data. The altitude is derived from actual LHA setting angles, not a generic glide slope value.

**Approach:**

1. Read all `LHA.setting_angle` values from the target AGL and take the **maximum** (this is unit A - highest angle, farthest from runway)
2. Add a configurable **angle offset** (default: **0.5 deg**)
   - Per ICAO Doc 9157 P4: PAPI transition sector width is 3 arc-minutes (0.05 deg). The all-white boundary is at `setting_angle + transition_sector_width / 2`. The 0.5 deg default provides comfortable margin above this boundary for stable observation.
3. Calculate inspection altitude: `height = distance * tan(max_setting_angle + angle_offset)`

**Implementation:**

- Add `angle_offset: Float, default=0.5` to `InspectionConfiguration` model (user-configurable per inspection)
- In trajectory method (after Z1 rename): replace `glide_slope_angle` parameter with computed value `max(lha.setting_angle for lha in agl.lhas) + config.angle_offset`
- The existing `altitude_offset` (in meters) remains as secondary fine-tuning; the new `angle_offset` (in degrees) is the primary control
- Frontend: show the computed observation angle and allow editing the offset in InspectionConfigForm
- Add validation warning if any LHA has `setting_angle = None` (coordinator hasn't configured it yet)
- Translations for new field labels

**Depends on:** Z1 (rename)

---

### Z3. Add camera settings for night PAPI inspection

For night PAPI inspections, auto-focus doesn't work in darkness. Operators need to document camera parameters that get exported in the mission report and flight plan. These are advisory fields - the drone doesn't auto-configure from them, but they are essential for the operator's pre-flight checklist.

Quote from Jaroslav Šulc: "Auto-focus mode (center or area) is not suitable. Autofocus can't focus properly in darkness. Work in optical zoom range only, not digital. Ideally set focus to distance to PAPI."

**New fields on `InspectionConfiguration` model:**

- `white_balance: String(20), nullable` - e.g. "DAYLIGHT", "CLOUDY", "TUNGSTEN", "MANUAL_4000K"
- `iso: Integer, nullable` - e.g. 100, 400, 800
- `shutter_speed: String(20), nullable` - e.g. "1/500", "1/1000"
- `focus_mode: String(20), nullable` - "MANUAL", "AUTO_CENTER", "AUTO_AREA"
- `focus_distance_m: Float, nullable` - manual focus distance in meters (ideally set to PAPI distance)
- `optical_zoom: Float, nullable` - optical zoom multiplier (e.g. 2.0x, 5.0x)

**Scope:**

- Backend: add columns to `InspectionConfiguration`, update schemas
- Frontend: add fields to `InspectionConfigForm.tsx` with appropriate inputs
- Include camera settings section in mission report PDF output
- Add to flight plan export data
- Translations for all new labels
- DB migration for new columns

---

### Z3b. Camera settings presets

Camera settings (Z3) should be reusable across inspections via presets tied to specific drone profiles. Coordinators create default presets for common scenarios (e.g. "PAPI Night - DJI M30T", "Runway Edge - Daylight"). Operators can use these defaults, create their own, or edit existing ones for their drone fleet.

**Model: `CameraPreset`**

- `id: UUID, primary key`
- `name: String, not null` - e.g. "PAPI Night - Manual Focus 300m"
- `drone_profile_id: UUID, FK to drone_profile, nullable` - null means generic (any drone)
- `created_by: UUID, FK to user` - who created it
- `is_default: Boolean, default=false` - coordinator-created defaults shown first
- `white_balance, iso, shutter_speed, focus_mode, focus_distance_m, optical_zoom` - same fields as Z3

**Access rules:**

- Coordinators can create/edit/delete presets marked `is_default=true` (shown to all operators at that airport)
- Operators can create/edit/delete their own presets (`is_default=false`, scoped to their user)
- Operators can see coordinator defaults but not edit them
- Presets are filtered by `drone_profile_id` when a drone is selected on the mission - show matching presets + generic ones

**Scope:**

- Backend: new `CameraPreset` model, CRUD endpoints under `/api/v1/camera-presets`
- Backend: add `camera_preset_id: UUID, FK, nullable` to `InspectionConfiguration` - when set, camera fields are populated from the preset
- Frontend: preset picker dropdown in InspectionConfigForm (above the individual camera fields)
  - Selecting a preset fills in all camera fields
  - Fields remain editable after selection (override preset values for this inspection)
  - "Save as new preset" button when fields are manually changed
- Frontend: preset management page or section in coordinator drone edit page
- Translations for all labels
- DB migration for new table and FK

**Depends on:** Z3 (camera settings fields)

---

### Z4. Add UI for editing runway threshold and end positions

The `AirfieldSurface` model already has `threshold_position` and `end_position` columns (populated from OpenAIP during airport creation), but there is no UI for coordinators to view or edit these on existing runways. This data is critical for computing the MEHT point (Z5) and for accurate AGL distance calculations.

**Scope:**

- AirportEditPage: add threshold and end position display/edit for runway surfaces
  - Show as map markers (draggable) on the runway endpoints
  - Show as coordinate fields in the runway detail panel
  - Allow click-to-place on map (similar to AGL/LHA placement flow)
- Validation: threshold and end position should be on or very near the runway centerline
- Visual: distinct marker style for threshold (e.g. T-bar symbol) vs end position
- Backend: verify the surface update endpoint and schema accept these fields (likely no backend changes needed)
- Translations: "Threshold Position", "End Position"

---

### Z5. Add MEHT Check inspection method per ICAO Doc 9157 P4

ICAO Doc 9157 P4, section 8.3.43 ("Use of an unmanned aircraft system") describes verifying the PAPI signal from the MEHT (Minimum Eye Height over Threshold) point. The drone hovers at the MEHT position and confirms the expected signal (should show on-slope: 2 red / 2 white for standard PAPI).

**MEHT point definition:**

The MEHT is on the extended runway centerline, above the threshold, at the height corresponding to the nominal glide slope angle. Formula: `MEHT_height = distance_from_threshold * tan(glide_slope_angle)`. For a standard 3 deg glide slope with PAPI at 300m from threshold, MEHT is approximately 15m (49ft) above threshold.

**Implementation:**

- New `InspectionMethod.MEHT_CHECK` in enums
- Add to `METHOD_AGL_COMPAT`: PAPI only
- New trajectory method `meht_check.py`:
  - Compute MEHT point from runway `threshold_position` + `AGL.glide_slope_angle` + `AGL.distance_from_threshold`
  - Position drone at MEHT point facing toward the PAPI (heading = approach direction)
  - Camera locked on PAPI LHA center
  - Single HOVER waypoint with stabilization time
- MEHT height auto-calculated but user-adjustable
- Frontend: add to inspection method selector, config form, translations
- Reference ICAO Doc 9157 P4 section 8.3.43 for exact UAS positioning

**Depends on:** Z4 (runway threshold position UI)

---

## Application improvements

### A1. Client-side caching and state persistence

The app resets too much context on navigation. Page refresh always redirects to operator dashboard regardless of the user's current page or role. Switching between role centers (operator, coordinator, super admin) or map and config tabs loses loaded data. This is the most impactful UX issue.

**Current problems:**

- `CatchAllRedirect` in `App.tsx` (line 34) always sends to `/operator-center/dashboard`, ignoring the user's role (coordinator lands on operator dashboard)
- Page refresh loses the current route - the browser URL is correct but the auth rehydration races with the route guard, causing a flash redirect
- No API response caching - every navigation re-fetches the same data (mission details, airport infrastructure, flight plans)
- Map state (viewport, layer visibility, selected features) resets when switching between config and map tabs
- `ComputationContext` is in-memory only - trajectory computation status is lost on refresh

**Implementation:**

- **Route persistence**: fix `CatchAllRedirect` to redirect based on actual user role (COORDINATOR -> `/coordinator-center/airports`, SUPER_ADMIN -> `/super-admin/users`). Persist last visited path in localStorage so refresh returns to the same page.
- **API caching with React Query (TanStack Query)**: replace raw Axios calls with `useQuery`/`useMutation` hooks. Configure stale times per resource type (airport data: 5min, mission list: 1min, flight plan: until invalidated). This gives automatic background refetching, cache sharing across components, and optimistic updates.
- **Map state persistence**: save viewport (center, zoom, bearing, pitch) and layer visibility to localStorage per airport. Restore on map mount.
- **Tab state preservation**: keep mission config and map components mounted (hidden) instead of unmounting on tab switch, or cache their state in context.

---

### A2. Cross-browser optimization

The app has no explicit browser target configuration. It relies on Vite defaults and has only Chrome-specific CSS customizations (`::-webkit-scrollbar`, `::-webkit-inner-spin-button`). MapLibre GL and CesiumJS require WebGL which limits mobile browser support.

**Current gaps:**

- No `browserslist` in `package.json` - Vite defaults to `['defaults and supports es6-module']` but this is implicit
- Scrollbar styling uses webkit-only pseudo-elements (`::-webkit-scrollbar` in `index.css`) - Firefox and Safari show default scrollbars
- Number input spinners hidden only for webkit (`::-webkit-inner-spin-button`)
- No build target in `vite.config.ts` - relies on esbuild defaults
- No WebGL capability detection - MapLibre and Cesium fail silently on unsupported browsers
- No fallback for older Safari versions (WebGL2 support varies)

**Implementation:**

- Add explicit `browserslist` to `package.json`: target last 2 versions of Chrome, Firefox, Safari, Edge
- Add `build.target` to `vite.config.ts` matching browserslist (e.g. `['es2020', 'chrome90', 'firefox90', 'safari14']`)
- Add cross-browser scrollbar styling using `scrollbar-width` and `scrollbar-color` (Firefox) alongside webkit prefixes
- Add WebGL capability check on app init - show a clear error message if WebGL is unavailable instead of a blank map
- Test and fix CSS custom property fallbacks for older browsers
- Add `@supports` queries where needed for progressive enhancement

---

### A3. Extend estimated stats with flight brief data

The frontend stats panels show only 5 metrics (distance, duration, waypoints, inspections, battery), but the flight brief PDF exports much richer data. Surfacing these stats in the UI gives operators immediate feedback without generating the PDF.

**Data available in flight brief but missing from frontend panels:**

- Min / max altitude (AGL and MSL) - computed from waypoint positions in `flight_brief_service.py` lines 330-338
- Transit speed - stored on `mission.default_speed`
- Per-inspection altitude range and waypoint count - computed per inspection in the PDF
- Battery usage percentage (not just remaining) - already partially computed
- Flight timeline segments with durations - computed for the timeline chart
- Validation summary (pass/fail, violation/warning counts) - available in `FlightPlanResponse.validation_result`

**Implementation:**

- **Backend**: add computed stats to `FlightPlanResponse` schema so they don't need client-side recalculation:
  - `min_altitude_agl: float | None`
  - `max_altitude_agl: float | None`
  - `min_altitude_msl: float | None`
  - `max_altitude_msl: float | None`
  - `transit_speed: float | None`
  - Per-inspection stats in `InspectionResponse` (altitude range, waypoint count, segment duration)
- **Frontend StatsPanel / MapStatsPanel**: extend the stats grid with new rows:
  - Altitude range: "12.5 - 45.2 m AGL" with mountain icon
  - Transit speed: "5.0 m/s" with gauge icon
  - Validation: "Passed" / "3 warnings" with shield icon
- Keep the panel compact - use a scrollable list or expandable sections for the extended stats
- Translations for all new stat labels

---

## Existing issues

### E1. Airport-scoped drone fleet with shared drone profiles

Drones become airport-specific (each airport has its own fleet).
Drone profiles are shared templates users can browse to create drones without knowing specs.
Users only see their airport's drone fleet. Requires data migration.

### E2. Refactor large trajectory modules

Split orchestrator.py (~1037 lines) into segment_builder + coordinator.
Split pathfinding.py (~747 lines) into visibility_graph + search.
Split safety_validator.py (~533 lines) into validation/ subpackage.
Redistribute helpers.py (~399 lines) to where functions belong.

### E3. Form field hint buttons

Add a small info/hint button to every form field in the app.
Clicking shows a tooltip explaining the field's purpose and what it affects (similar to map hint pattern).
