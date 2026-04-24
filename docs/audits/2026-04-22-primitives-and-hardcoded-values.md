# Audit: Primitives and Hardcoded Values

**Date:** 2026-04-22
**Issue:** #202
**Author:** implementer agent (read-only audit)
**Risk tier:** T1 (docs-only delivery; issue label says T2)

## 1. Summary

This audit surveys how TarmacView uses shared primitives (value objects, enums,
Pydantic schemas, TypeScript types, CSS variables, i18n keys) and catalogues
ad-hoc literals that should migrate to `backend/app/models/value_objects.py`,
`backend/app/core/`, `frontend/src/constants/`, `frontend/src/config/`,
`frontend/src/i18n/locales/*.json`, or `frontend/src/index.css` variables.

**Finding counts by priority and layer (approximate, not exhaustive):**

| Layer          | P1 | P2 | P3 | Total |
|----------------|----|----|----|-------|
| Backend        | 2  | 5  | 3  | 10    |
| Frontend       | 3  | 9  | 6  | 18    |
| Cross-cutting  | 2  | 2  | 0  | 4     |
| **Totals**     | 7  | 16 | 9  | 32    |

**Top three risks to address first (see §6 for the consolidation roadmap):**

1. `ConstraintType` TypeScript union does not match the Python enum - values are
   completely disjoint (frontend: `NO_FLY | ALTITUDE_LIMIT | SPEED_LIMIT`,
   backend: `ALTITUDE | SPEED | GEOFENCE | RUNWAY_BUFFER | BATTERY`).
2. Four copies of the minimum transit altitude constant (`5.0 m AGL`) across
   models / schemas / trajectory types; drift here silently permits low flights.
3. Design system palette is duplicated as raw hex strings across
   MapLibre/Cesium/SVG layers, bypassing the `--tv-*` CSS variables that
   `docs/specs/DESIGN-SYSTEM.md` mandates.

**This audit does not refactor code.** §6 lists follow-up issue drafts; a human
must triage and file them.

## 2. Scope & Method

### Scope (in)

- `backend/app/**` (models, schemas, services, routes, core, utils)
- `frontend/src/**` (types, components, pages, constants, config, i18n, CSS)
- Cross-cutting: enum parity, API path discipline, style-token discipline

### Scope (out)

- Tests (`backend/tests/**`, `frontend/src/**/*.test.*`)
- Generated artifacts (`docs/exported_routes_schema.json`)
- Alembic migrations (`backend/migrations/versions/**`)
- Protected files per `harness.config.json`

### Method

Used `ripgrep` with targeted patterns and manual file reads. Searches used:

- `rg -n "\.status\s*=\s*" backend/app/services` - bypassed state machine
- `rg -n "(9\.81|6371|1852|180|360)" backend/app` - geo/math constants
- `rg -n "https?://" backend/app` - hardcoded URLs
- `rg -n "timedelta\(" backend/app` - hardcoded time constants
- `rg -n "setTimeout|setInterval" frontend/src` - hardcoded UI delays
- `rg -n "#[0-9a-fA-F]{3,8}" frontend/src` - raw hex colors
- `rg -n "style=\{\{[^}]*(color|background|border)" frontend/src` - inline style colors
- `rg -n "(altitude|speed|angle|timeout|duration).*=\s*\d+" frontend/src` - magic numbers
- `rg -n "(placeholder|title|aria-label)=\"[A-Z]" frontend/src` - unwrapped strings
- `rg -n "setError\(\"[A-Z]" frontend/src` - unwrapped state messages

Coverage is **sampled, not exhaustive**. Findings are illustrative; the full
remediation must re-run these searches and enumerate matches at fix time.

## 3. Backend Findings

### 3.1 Hardcoded numeric constants that should be centralised

| ID | file:line | Literal / symbol | Category | Suggested home | Priority |
|----|-----------|------------------|----------|----------------|----------|
| B-1 | `backend/app/models/mission.py:54` | `MIN_TRANSIT_ALTITUDE_AGL = 5.0` | geo/altitude | single const in `backend/app/core/constants.py` | **P1** |
| B-2 | `backend/app/schemas/mission.py:34` | `_MIN_TRANSIT_ALTITUDE_AGL = 5.0` | geo/altitude | duplicate of B-1 - same module const | **P1** |
| B-3 | `backend/app/services/trajectory/types.py:107` | `MINIMUM_ALTITUDE_THRESHOLD: Meters = 5.0` | geo/altitude | duplicate of B-1 - re-export, not re-declare | **P1** |
| B-4 | `backend/app/schemas/infrastructure.py:29,87,108`; `backend/app/models/airport.py:99,195`; `backend/app/services/trajectory/types.py:171`; `backend/app/seed.py:198` | `buffer_distance = 5.0` (six call sites) | defaults | hoist into `DEFAULT_BUFFER_DISTANCE` in `backend/app/core/constants.py`; reference from each site | P2 |
| B-5 | `backend/app/core/config.py:20,21,22` | `takeoff_safe_altitude=10.0`, `landing_safe_altitude=10.0`, `vertex_buffer_m=5.0` | safety constants | already env-overridable - **already correctly placed**, noted as positive finding | — |
| B-6 | `backend/app/services/export_service.py:461,491,492` | `"xmlns": "http://www.topografix.com/GPX/1/1"`, `_KML_NS`, `_WPML_NS` | export namespaces | already module-level constants - correct | — |
| B-7 | `backend/app/services/admin_service.py:87,157` | `timedelta(hours=72)` (invitation expiry - two copies) | time policy | hoist into `INVITATION_EXPIRY_HOURS` in `admin_service` or `core/config.py` (env-overridable) | P2 |
| B-8 | `backend/app/models/mission.py:24` | `MAX_INSPECTIONS = 10` | business rule | OK on model, but frontend has **no mirror** - see F-13 | P2 |
| B-9 | `backend/app/utils/geo.py:4` | `EARTH_RADIUS_M = 6371000.0` | geo constant | OK at module top - correct placement | — |
| B-10 | `backend/app/services/openaip_service.py:81` | `_METERS_PER_NM = 1852.0` | unit conversion | candidate for a shared `app/utils/units.py` if more conversions appear | P3 |

### 3.2 Business logic in services that should move to model methods

| ID | file:line | What it does | Why it violates DDD-lite | Priority |
|----|-----------|--------------|--------------------------|----------|
| B-11 | `backend/app/services/mission_service.py:144-154` | `trajectory_changed` check on `TRAJECTORY_FIELDS` + `mission.invalidate_trajectory()` | `Mission.change_drone_profile()` exists but is bypassed for other trajectory-affecting fields. The whole "check whether any of these fields changed and regress" rule should be a `Mission.update_config(data)` method on the aggregate. | P2 |
| B-12 | `backend/app/services/mission_service.py:206-243` | `duplicate_mission` manually re-reads `_MERGE_FIELDS` and re-constructs `InspectionConfiguration` | `Mission.duplicate()` or `Mission.deep_copy()` would encapsulate the "how we clone" rule. Service then just persists. | P2 |
| B-13 | `backend/app/services/mission_service.py:181-184` | Reads `Mission._TERMINAL` directly to refuse delete | Expose `Mission.can_delete()` / `Mission.assert_deletable()` to keep `_TERMINAL` encapsulated. `_TERMINAL` is currently a leaky underscore-prefixed attribute. | P3 |
| B-14 | `backend/app/services/export_service.py:1156-1162` | Transitions `mission` from `"VALIDATED"` to `"EXPORTED"` using a **string literal compare** (`if mission.status == "VALIDATED"`) instead of `MissionStatus.VALIDATED.value` / enum | Enum members exist; hardcoded strings drift. Also violates "never assign status directly" hygiene even though this one does use `transition_to`. | P2 |
| B-15 | `backend/app/services/inspection_service.py:32-36, 115-119, 160-164` | `_delete_flight_plan_if_exists` + `mission.invalidate_trajectory()` is duplicated in three call paths (add/update/delete/reorder) | Collapse into `Mission.modify_inspections(fn)` or a `Mission.with_flight_plan_regen()` context manager that handles the delete+invalidate sequence | P2 |

### 3.3 Pydantic schema vs SQLAlchemy model drift

| ID | file:line (pair) | Drift | Priority |
|----|-----------------|-------|----------|
| B-16 | `backend/app/models/inspection.py:73+` ↔ `backend/app/schemas/mission.py:46+` (InspectionConfigOverride) | Schema has `angle_offset` constrained to `ge=0 le=10`; model has no check. Schema has `shutter_speed` `max_length=20`; model has `Column(String(20))` - match, OK. `camera_preset_id` present in both. **No drift detected - good.** | — |
| B-17 | `backend/app/models/mission.py:111-116` ↔ `backend/app/schemas/mission.py` (mission defaults) | Model defaults `camera_mode="AUTO"` and `flight_plan_scope="FULL"` via `server_default`; schemas declare them as `Literal` with defaults. In sync today but not auto-kept in sync. | P3 |
| B-18 | `backend/app/models/airport.py:46-53` ↔ `backend/app/schemas/airport.py` | Model has `terrain_source` `CheckConstraint` listing `'FLAT', 'DEM_UPLOAD', 'DEM_API'` as a raw string. The Python enum for this doesn't exist. **Create a `TerrainSource` enum in `core/enums.py` and reuse.** | P2 |

### 3.4 Raw SQL or string-concatenated queries

Found **none** - all persistence goes through SQLAlchemy ORM. Positive finding.

## 4. Frontend Findings

### 4.1 Hardcoded literals that should move to constants/config

| ID | file:line | Literal | Category | Suggested home | Priority |
|----|-----------|---------|----------|----------------|----------|
| F-1 | `frontend/src/components/map/AirportMap.tsx:285,505,821,827,845,927,1536,1542,2023,2243,2476,2480,2512,2524` | `duration: 200-800`, `flyTo zoom: 17`, `panBy duration: 200`, `easeTo pitch: 60` | map animation timings | `frontend/src/constants/mapAnimations.ts` (new) | P2 |
| F-2 | `frontend/src/components/map/CesiumMapViewer.tsx:314,461,486` | `duration: 1.0/1.5` | cesium animations | same file as F-1 | P3 |
| F-3 | `frontend/src/hooks/useFlyAlong.ts:17`; `frontend/src/components/map/cesium/CesiumFlyAlong.tsx:61` | `speed: 2`, `duration: 1.5 / flyAlongState.speed` | fly-along defaults | `frontend/src/constants/flyAlong.ts` (new) | P3 |
| F-4 | `frontend/src/components/Layout/MissionTabNav.tsx:194`; `frontend/src/components/admin/InviteUserDialog.tsx:70`; eight different `*Page.tsx` files using `setTimeout(..., 3000)` or `setTimeout(..., 4000)` | notification/toast auto-dismiss | `frontend/src/constants/ui.ts` as `NOTIFICATION_TIMEOUT_MS` | P2 |
| F-5 | `frontend/src/pages/coordinator-center/InspectionEditPage.tsx:78,286`; `frontend/src/pages/coordinator-center/DroneEditPage.tsx:359,449` | autosave `setInterval(30000)` + debounce timers | centralize `AUTOSAVE_DEBOUNCE_MS`, `AUTOSAVE_INTERVAL_MS` | P2 |
| F-6 | `frontend/src/components/coordinator/CreationForm.tsx:139,144,146,147,158,159,360` | `altFloor="0"`, `bufferDistance="5"`, `glideSlopeAngle="3.0"`, `lhaSettingAngle="3.0"` etc. as `useState("3.0")` | infrastructure defaults | `frontend/src/constants/infrastructureDefaults.ts` (new) | P2 |
| F-7 | `frontend/src/components/coordinator/CreateAirportDialog.tsx:53`; `frontend/src/components/coordinator/EditableFeatureInfo.tsx:1077` | `useState("3")` for radius/spacing | same as F-6 | P3 |

### 4.2 Duplicated enum/type definitions (frontend vs backend)

| ID | frontend file:line | backend file:line | Drift | Priority |
|----|-------------------|-------------------|-------|----------|
| F-8 | `frontend/src/types/enums.ts:67` (`ConstraintType = "NO_FLY" \| "ALTITUDE_LIMIT" \| "SPEED_LIMIT"`) | `backend/app/core/enums.py:104-109` (`ALTITUDE \| SPEED \| GEOFENCE \| RUNWAY_BUFFER \| BATTERY`) | **Values are entirely disjoint.** Either the frontend code is dead, or it's silently broken. | **P1** |
| F-9 | `frontend/src/types/enums.ts:1-71` (MissionStatus, WaypointType, CameraAction, CaptureMode, ExportFormat, InspectionMethod, SafetyZoneType, ObstacleType, LampType, PAPISide, SurfaceType, FlightPlanScope, ComputationStatus, UserRole) | `backend/app/core/enums.py` | Redeclared by hand. Any backend enum change is a silent frontend break. All other enums match today but are fragile. | P2 |
| F-10 | `frontend/src/types/mission.ts:4` (`CameraMode = "AUTO" \| "MANUAL"`); `frontend/src/types/mission.ts:27` (`focus_mode: "AUTO" \| "INFINITY"`); `frontend/src/types/mission.ts:65` (`hover_bearing_reference: "RUNWAY" \| "COMPASS"`) | `backend/app/schemas/mission.py:28` (`CameraModeStr`); `backend/app/schemas/common.py` (`FocusModeStr`); `backend/app/schemas/mission.py:30` (`HoverBearingRefStr`) | Literal unions declared twice. | P2 |
| F-11 | `frontend/src/types/airport.ts:19,133,138` (`"FLAT" \| "DEM_UPLOAD" \| "DEM_API"` inline three times) | `backend/app/models/airport.py:51` (same values as CheckConstraint) | Repeat of same literal union inline; plus backend doesn't have an enum for this (B-18). | P2 |
| F-12 | `frontend/src/types/airport.ts:54` (`AglType = "PAPI" \| "RUNWAY_EDGE_LIGHTS"`) | `backend/app/schemas/infrastructure.py:18` (`AglTypeStr`) | Same values, drifted location. OK today. | P3 |

### 4.3 JSX strings / attributes missing `t()` wrapping

| ID | file:line | Untranslated string | Priority |
|----|-----------|--------------------|----------|
| F-13 | `frontend/src/components/common/Modal.tsx:60` | `aria-label="Close"` | P2 |
| F-14 | `frontend/src/components/admin/InviteUserDialog.tsx:112,118` | `placeholder="user@example.com"`, `placeholder="Full Name"` | P2 |
| F-15 | `frontend/src/pages/super-admin/SuperAdminAuditLogPage.tsx:95,128` | `setError("Failed to load audit logs")`, `setError("Failed to export audit log")` | **P1** (entire super-admin page has no `en.json` namespace coverage for errors) |
| F-16 | `frontend/src/pages/super-admin/SuperAdminSystemPage.tsx:27,51` | `setError("Failed to load system settings")`, `setError("Failed to save settings")` | **P1** |
| F-17 | `frontend/src/pages/operator-center/MissionOverviewPage.tsx:123` | `setError("mission.config.loadError")` - **uses the key as-is, never routed through `t()`** | **P1** (looks wrapped but isn't) |
| F-18 | `frontend/src/components/coordinator/EditableFeatureInfo.tsx:515`; `frontend/src/components/coordinator/CreationForm.tsx:766` | `<option value="PAPI">PAPI</option>` - label is an acronym, acceptable to leave, but the AglType dropdown labels aren't translated anywhere | P3 |

(Per-page namespace coverage in `en.json` appears strong for operator/coordinator
pages; the **super-admin pages are the hole** - search for `"superAdmin"` in
`en.json` returns nav entries only, no error/action strings. That is the highest-
leverage follow-up.)

### 4.4 Raw color/style values bypassing `--tv-*` variables

Total matches for `#[0-9a-fA-F]{3,8}` across `frontend/src` excluding tests:
**~268** hits. Hot spots:

| ID | file:line | Issue | Priority |
|----|-----------|-------|----------|
| F-19 | `frontend/src/components/map/layers/surfaceLayers.ts:151,163,174,194,195,246,258,269,289,290,329,330,348,349,397,398,446,447` | 18 raw hex colors for MapLibre paint properties - uses `#4a4a4a`, `#6a6a6a`, `#c8a83c`, `#ffd700`, `#b8a038`, `#4595e5`, `#e54545`, `#000000`, `#ffffff` | P2 - refactor to read from `getComputedStyle(document.documentElement)` for `--tv-*` values or from a single `surfaceLayerColors.ts` module that imports from a shared palette |
| F-20 | `frontend/src/components/map/layers/safetyZoneLayers.ts:17-20,57,120,160` | 4 zone-type colors repeat values already in `--tv-zone-*-fill` / `--tv-zone-*-border` in `frontend/src/index.css:61-68` | P2 - source of truth duplication |
| F-21 | `frontend/src/components/map/overlays/SafetyZonesPanel.tsx:13-18`; `frontend/src/pages/coordinator-center/AirportEditPage.tsx:24` | `const ZONE_COLORS: Record<string, string>` declared **twice**, same values, in two components | P2 - hoist to `frontend/src/constants/zoneColors.ts` |
| F-22 | `frontend/src/components/map/cesium/cesiumColors.ts:7-92` | Cesium color module redeclares every hex that exists in `--tv-*`. Legitimate for Cesium (needs `Color` objects), but the hex strings must match the CSS variables or the 3D view drifts from 2D. | P2 - derive from the CSS variables at load time or keep one JS palette module both use |
| F-23 | `frontend/src/components/map/overlays/LegendPanel.tsx:58,344` | Inline `color: "#e91e90"` - same value exists as `--tv-accent-magenta` in `index.css:16` | P3 |
| F-24 | `frontend/src/components/map/overlays/AGLPanel.tsx:116,126,159` | Inline `"#e91e90"` three times - same as F-23 | P3 |
| F-25 | `frontend/src/components/map/obstacleIcons.tsx:3-9,13,45` | `OBSTACLE_COLORS` object + one raw `#8B6914` in a polygon fill for vegetation trunk | P3 - map to `--tv-*` palette, move trunk color into the palette as `--tv-obstacle-trunk` |
| F-26 | `frontend/src/components/map/AirportMap.tsx:942,943,956,979,980` | Inline `#ff6b00` (selected/waypoint highlight) and `#ffffff`, `#000000`, `#ff6b00` for text halos | P2 - add `--tv-waypoint-highlight` to design system |
| F-27 | `frontend/src/pages/operator-center/DashboardPage.tsx:525-527` | `stat.color + "1a"` (concatenating a hex alpha channel at runtime) - fragile; a missing prefix or 8-char hex breaks it | P3 |

### 4.5 Inline style bleed-through

| ID | file:line | Issue | Priority |
|----|-----------|-------|----------|
| F-28 | 13 `style={{ backgroundColor: ... }}` or `style={{ color: ... }}` sites across `SafetyZonesPanel.tsx`, `LegendPanel.tsx`, `CoordinatorAGLPanel.tsx`, `DashboardPage.tsx`, `AGLPanel.tsx`, `AirportEditPage.tsx` | All pipe a JS string into the DOM rather than toggling a Tailwind / CSS-var-driven class. Unavoidable for dynamic per-zone coloring, but legitimises raw hex to leak in. | P3 |

## 5. Cross-cutting Findings

| ID | Finding | Priority |
|----|---------|----------|
| X-1 | **No generated TypeScript client.** `backend/app/main.py` exposes an OpenAPI spec via FastAPI; the frontend types under `frontend/src/types/` are written by hand. Adopting `openapi-typescript` (or the built-in `openapi` command) would eliminate F-8, F-9, F-10, F-11 wholesale. Biggest single-lever consolidation opportunity in the repo. | **P1** |
| X-2 | **`docs/exported_routes_schema.json` is UGCS TransferData, not this project's OpenAPI.** The planner plan assumed it was an OpenAPI export - it is not. Clarify the filename or move it under `docs/specs/` so it's not mistaken for a sync artefact. | P3 |
| X-3 | **CLAUDE.md documents `frontend/src/constants/` as holding "AGL, cursors, geo, violations" but it only contains `camera.ts`, `mapTiles.ts`, `surface.ts`.** Doc/code drift. Either move the scattered constants into that folder (per this audit's consolidation plan) and update CLAUDE.md, or correct the claim. | P2 |
| X-4 | **Backend enum module is a two-file shim.** `backend/app/models/enums.py` is a pure re-export of `backend/app/core/enums.py` (per line 1 it is `from app.core.enums import ...`). Consolidating to one import path simplifies the story, especially once OpenAPI generation replaces hand-written TS types. | P2 |

## 6. Consolidation Plan

Ranked roadmap of follow-up issues. Each bullet is a candidate GitHub issue;
file them individually so risk tier, reviewer, and CI scope match each one.

### Recommended P1 follow-ups (file as separate issues)

1. **Fix `ConstraintType` enum drift (F-8).** **Effort: S.**
   - Decide whether the frontend `ConstraintType` or backend `ConstraintType` is
     correct, then change the other to match.
   - Acceptance: `frontend/src/types/enums.ts` and `backend/app/core/enums.py`
     list the exact same members; any code path that read the stale values is
     fixed; add a test that asserts the union members match via a generated
     snapshot.
   - Files: `frontend/src/types/enums.ts`, any consumer of `ConstraintType`.

2. **Add OpenAPI-driven TypeScript generation (X-1).**  **Effort: M.**
   - Adopt `openapi-typescript` or `@hey-api/openapi-ts`.
   - Replace hand-written `frontend/src/types/enums.ts`, `mission.ts`,
     `airport.ts` (and peers) with a generated file under `frontend/src/types/generated/`.
   - Gate CI so schema drift fails the build.
   - Acceptance: deleting a backend enum member immediately breaks `tsc`
     in the frontend build.

3. **Dedupe `MIN_TRANSIT_ALTITUDE_AGL` (B-1/B-2/B-3).** **Effort: S.**
   - Add `backend/app/core/constants.py` with `MIN_TRANSIT_ALTITUDE_AGL_M = 5.0`.
   - Import from models, schemas, and `trajectory/types.py`.
   - Acceptance: `rg "5\.0" backend/app` shows only the one definition for this
     semantic constant; existing tests still pass.

4. **Wrap super-admin page errors in `t()` (F-15, F-16, F-17).** **Effort: S.**
   - Add a `superAdmin` namespace to `frontend/src/i18n/locales/en.json` with
     error keys.
   - Convert `setError("literal")` and `setError("mission.config.loadError")`
     to proper `t(...)` calls.
   - Acceptance: eslint rule or grep check shows zero `setError("[A-Z]"` calls
     in `pages/super-admin/`.

5. **Extract `ZONE_COLORS` to a single module (F-21) and audit the Cesium/MapLibre palette against `--tv-*` (F-19, F-20, F-22).** **Effort: M.**
   - Create `frontend/src/constants/palette.ts` that exports the canonical hex
     values and consumes them from a `getComputedStyle` hook where possible.
   - Replace both `ZONE_COLORS` copies, the `safetyZoneLayers.ts` constants, and
     `cesiumColors.ts` literals.
   - Acceptance: a CI grep asserts no component file under
     `frontend/src/components/` or `frontend/src/pages/` contains a raw
     `#[0-9a-fA-F]{3,8}` string.

### P2 bucket (group into one or two follow-ups)

- **DDD-lite follow-up (B-11, B-12, B-13, B-15).** Consolidate the "modify mission
  inspections" dance into aggregate-root methods.
- **Default-value registry for infrastructure forms (F-6, F-7).** New
  `frontend/src/constants/infrastructureDefaults.ts`.
- **UI timing registry (F-1, F-2, F-4, F-5).** New
  `frontend/src/constants/ui.ts` with map/flyAlong/notification/autosave timings.
- **Create `TerrainSource` enum (B-18, F-11).**
- **Dedupe `buffer_distance = 5.0` (B-4).**
- **Status-literal comparison in export (B-14).**
- **Docs update in CLAUDE.md for the real `constants/` contents (X-3).**
- **Collapse `models/enums.py` shim (X-4).**
- **Literal-union parity pass when X-1 is done (F-9, F-10).**

### P3 bucket (polish — batch opportunistically)

- Cesium fly-along / flyTo durations (F-2, F-3).
- `stat.color + "1a"` dynamic alpha concatenation (F-27).
- Inline `style={{ }}` color-bleed (F-28).
- Server/model default in-sync pair (B-17).
- `_METERS_PER_NM` hoist (B-10).
- `Mission._TERMINAL` encapsulation (B-13).

## 7. Appendix - Raw Inventory Snippets

Not every finding is enumerated above; these are the representative searches
to rerun when a follow-up issue starts. Output shown is from 2026-04-22.

### A. `frontend/src/**` hex color hotspots

```
$ rg -n "#[0-9a-fA-F]{3,8}" frontend/src --glob '!**/*.test.*' | wc -l
268
```

Top files by count:
- `frontend/src/components/map/layers/surfaceLayers.ts` (18)
- `frontend/src/components/map/cesium/cesiumColors.ts` (20+)
- `frontend/src/components/map/layers/safetyZoneLayers.ts` (4)
- `frontend/src/components/map/AirportMap.tsx` (5)
- `frontend/src/components/map/obstacleIcons.tsx` (6)
- `frontend/src/components/map/overlays/AGLPanel.tsx` (3)
- `frontend/src/pages/coordinator-center/AirportEditPage.tsx` (4)

### B. `setTimeout` / `setInterval` hotspots

```
$ rg -n "setTimeout|setInterval" frontend/src --glob '!**/*.test.*' | wc -l
23
```

Most collapse to either `3000` ms / `4000` ms notification timers or `30000` ms
autosave ticks. Three repeated magic numbers across ten files.

### C. Backend duplicated altitude constants

```
$ rg -n "5\.0" backend/app/models/mission.py backend/app/schemas/mission.py \
        backend/app/services/trajectory/types.py
backend/app/models/mission.py:54:MIN_TRANSIT_ALTITUDE_AGL = 5.0
backend/app/schemas/mission.py:34:_MIN_TRANSIT_ALTITUDE_AGL = 5.0
backend/app/services/trajectory/types.py:107:MINIMUM_ALTITUDE_THRESHOLD: Meters = 5.0
```

### D. Backend duplicated `buffer_distance` defaults

```
$ rg -n "buffer_distance.*5\.0" backend/app
backend/app/seed.py:198:                buffer_distance=5.0,
backend/app/schemas/infrastructure.py:29:    buffer_distance: float = Field(default=5.0, ge=0)
backend/app/schemas/infrastructure.py:87:    buffer_distance: float = 5.0
backend/app/schemas/infrastructure.py:108:    buffer_distance: float = Field(default=5.0, ge=0)
backend/app/models/airport.py:99:    buffer_distance = Column(Float, nullable=False, default=5.0)
backend/app/models/airport.py:195:    buffer_distance = Column(Float, nullable=False, default=5.0)
backend/app/services/trajectory/types.py:171:    buffer_distance: Meters = 5.0
```

### E. Positive findings (called out so they don't get "fixed" by mistake)

- `backend/app/utils/geo.py:4` - `EARTH_RADIUS_M` is a proper module-level
  constant; leave it.
- `backend/app/core/config.py:20-53` - all URLs, timeouts, and cookie settings
  are `Settings`-driven; correct pattern.
- `backend/app/services/trajectory/types.py:30-107` - trajectory algorithm
  constants are well-curated in one place; matches the critical-path guidance.
- `frontend/src/api/client.ts:18` - API paths are centralised through the Axios
  client with a single `baseURL = "/api/v1"`.
- `frontend/src/constants/` - exists and holds a small set of constants;
  findings recommend **adding to it**, not replacing it.
- `frontend/src/index.css` - uses `--tv-*` variables correctly at its own
  level; the gap is that some component code bypasses them.

## 8. Intentional Non-Goals

- **No code is changed by this audit.** Remediation belongs in the follow-up
  issues listed in §6, each with its own risk tier and test expectations.
- **No exhaustive enumeration.** Every table above is a representative sample
  derived from targeted greps. Each follow-up issue must re-run the relevant
  pattern and fix every match.
- **No opinions on whether the code is good.** This document only notes
  *where* primitives drift or literals repeat.
