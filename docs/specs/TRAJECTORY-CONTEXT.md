# Trajectory Generation — Complete Thesis Context

Paste this entire block into Claude Code when starting the trajectory engine issue. This is the complete algorithm specification from the thesis, Sections 3.3 and 3.4.

---

## Algorithm Overview

The trajectory generation algorithm is a sequential 5-phase pipeline that transforms a mission configuration into a concrete flight plan. Each phase either advances to the next stage or terminates with an error if an unrecoverable constraint violation is detected.

1. Mission Data Loading
2. Inspection Loop
3. Waypoint Validation Loop
4. Post-Inspection Processing
5. Final Assembly and Transit Path Planning

---

## Inspection Methods and Trajectory Geometry

Five methods are supported. The first two (ANGULAR_SWEEP, VERTICAL_PROFILE) are the ZEPHYR UAS PAPI inspection maneuvers. FLY_OVER, PARALLEL_SIDE_SWEEP, and HOVER_POINT_LOCK were added to support runway edge light inspections.

**Method / AGL-type compatibility matrix:**

| Method              | PAPI | RUNWAY_EDGE_LIGHTS |
|---------------------|:----:|:------------------:|
| VERTICAL_PROFILE    |  ✓   |                    |
| ANGULAR_SWEEP       |  ✓   |                    |
| FLY_OVER            |      |         ✓          |
| PARALLEL_SIDE_SWEEP |      |         ✓          |
| HOVER_POINT_LOCK    |  ✓   |         ✓          |

The matrix is enforced both in the backend (`InspectionTemplate.validate_method_agl_compat()` — returns 400 on mismatch) and in the frontend (`methodAglCompatibility.ts` narrows the pickable methods by the template's target AGL types).

### ANGULAR_SWEEP

Verifies horizontal coverage of the PAPI signal by flying the drone through an arc at a fixed distance from the PAPI installation.

- Arc centered on the LHA center point (geometric centroid of the four LHA positions, computed by `calculateLHACenterPoint()`)
- Sweep extends from -α to +α relative to the extended runway centerline
- α is derived from the required horizontal coverage angle (typically ±10° for PAPI, with additional margin)
- Drone maintains constant altitude within the glide slope sector
- Radius = configured inspection distance, must be at least 350m from PAPI position
- `calculateArcPath()` computes waypoint positions at angular increments from measurement density

**Formula (Equation 3.1):**
```
xi = xc + r * sin(θi)
yi = yc + r * cos(θi)
```
Where:
- (xc, yc) = LHA center point
- r = inspection distance (≥ 350m)
- θi ranges from -α to +α in steps of Δθ = 2α/n
- n = number of measurement points from measurementDensity parameter
- Altitude held constant at elevation corresponding to glide slope angle at distance r

### VERTICAL_PROFILE

Verifies setting angles of each individual PAPI light unit by flying the drone along the extended runway centerline while changing altitude.

- Drone ascends (or descends) through the vertical sector of the PAPI signal
- Sweeps from below the lowest transition angle to above the highest
- For standard 3° glide slope PAPI: vertical sweep covers ~1.9° to ~6.5° elevation (full sector from all-red to all-white)
- Fixed horizontal distance from PAPI (Middle Marker position or configured distance)
- Altitudes increase linearly between start and end elevations

**Formula (Equation 3.2):**
```
hi = d * tan(φi)
```
Where:
- d = horizontal distance from LHA center point to drone position
- φi ranges from lower boundary angle to upper boundary angle
- Steps determined by measurement density parameter

**HOVER waypoints:** At critical measurement positions (each transition angle boundary), the system inserts a HOVER waypoint with configurable dwell time from `hoverDuration` parameter. This allows stabilized image capture of light transitions.

### Common preprocessing (both methods):
1. Compute LHA center point
2. Determine start and end positions based on method type and config parameters
3. Camera heading oriented toward PAPI installation throughout both maneuvers
4. Gimbal pitch angle at each waypoint = elevation angle from drone position to LHA center point

### FLY_OVER

Runway-edge-light variant. Drone overflies the light row, one waypoint per LHA, camera pointed straight down.

- One waypoint per LHA in the template, ordered by `unit_number`
- Drone altitude = LHA ground altitude + `height_above_lights` (default 15 m)
- Heading aligned with the first → last LHA bearing (same heading applied to every waypoint)
- Default gimbal pitch = -90° (straight down); operator can override via `camera_gimbal_angle`
- In VIDEO capture mode the orchestrator wraps the pass in RECORDING_START / RECORDING_STOP hover waypoints
- Requires ≥ 2 LHAs

Config: `height_above_lights`, `camera_gimbal_angle`, `capture_mode`, `recording_setup_duration`. Default speed 5 m/s.

### PARALLEL_SIDE_SWEEP

Drone flies parallel to the light row, offset laterally to the side farther from the runway centerline. One waypoint per LHA, camera pointed toward the lights.

- For each LHA, waypoint is laterally offset perpendicular to the first→last LHA direction
- Offset distance = `lateral_offset` (default 30 m)
- Offset direction is chosen as whichever perpendicular candidate is farther from the runway centerline
- Altitude = LHA ground + `height_above_lights` (default 10 m)
- Heading and gimbal oriented toward the corresponding LHA
- Video/photo capture modes supported

Config: `lateral_offset`, `height_above_lights`, `camera_gimbal_angle`, `capture_mode`. Default speed 3 m/s.

### HOVER_POINT_LOCK

Drone hovers at a single point, camera locked on one specific LHA for the full dwell.

- Produces exactly one `HOVER` waypoint
- Drone position offset from `selected_lha_id` along the approach bearing (`runway_heading + 180°`)
- Default `distance_from_lha`: 50 m for PAPI, 10 m for RUNWAY_EDGE_LIGHTS
- Altitude = target LHA ground + `height_above_lha` (default 5 m)
- Heading points from drone toward the LHA; gimbal toward the LHA
- Dwell = `hover_duration` (default 10 s)
- PHOTO mode emits `PHOTO_CAPTURE`; VIDEO mode emits `RECORDING`
- **Angle Lock**: the UI can couple `height_above_lha`, `distance_from_lha`, and `camera_gimbal_angle` via `angle = -atan2(height, distance)`. When locked, editing any of the three derives the third so the geometry stays consistent.
- Requires a `selected_lha_id` — orchestrator raises if missing

---

## Phase 1 — Mission Data Loading

Loads all data needed for computation. After this phase, no further database access during computation.

1. Retrieve airport infrastructure (runway geometries, obstacle positions, safety zone polygons)
2. Load selected drone profile (physical performance parameters = constraint boundaries)
3. Resolve inspection configurations: expand each inspection template into concrete targets and methods
4. For each inspection: `resolveWithDefaults()` merges operator-specified overrides with template default configuration → final parameter set

---

## Phase 2 — Inspection Loop

Iterate inspections in `sequenceOrder` (set by operator, determines physical flight sequence).

For each inspection:
1. Resolve configuration
2. Check `isSpeedCompatibleWithFrameRate()` — if configured speed too high for camera to capture usable frames at required measurement density → add warning
3. Verify sensor FOV is sufficient to capture all 4 LHA units in single frame at configured distance. If angular span of LHA array exceeds camera sensorFOV → add warning
4. Load inspection targets, compute LHA center point for each PAPI target
5. Branch by inspection method: ANGULAR_SWEEP → `calculateArcPath()`, VERTICAL_PROFILE → `calculateVerticalPath()`, FLY_OVER → `calculate_fly_over_path()`, PARALLEL_SIDE_SWEEP → `calculate_parallel_side_sweep_path()`, HOVER_POINT_LOCK → `calculate_hover_point_lock_path()`
6. Each pass produces ordered list of waypoints
7. Waypoints immediately validated before proceeding to next target

---

## Phase 3 — Waypoint Validation Loop

For every waypoint in an inspection pass:

1. **Check drone constraints**: altitude, speed, heading within limits from drone profile
   - Hard failure (e.g., exceeding max altitude) → TERMINATE entire generation
   - Soft violation → add warning, continue

2. **Check obstacles and safety zones**: SafetyValidator performs spatial intersection tests between waypoint position and all registered obstacle geometries + safety zone polygons
   - Uses PostGIS spatial functions
   - If obstruction detected → evaluate if waypoint can be rerouted (`reroutePath()`) while preserving measurement geometry
   - If rerouting possible → adjust waypoint
   - If obstruction cannot be avoided → TERMINATE generation

---

## Phase 4 — Post-Inspection Processing

After all waypoints for an inspection pass are validated:

1. **Assign camera actions** based on inspection method and waypoint position:
   - Waypoints in active measurement zone → `PHOTO_CAPTURE`
   - Waypoints in lead-in and lead-out segments → `NONE`

2. **Append waypoints** to flight plan

3. **Update running totals**: cumulative distance + estimated flight time

4. **Check battery**: cumulative consumption against drone capacity minus reserve margin
   - If estimated flight time exceeds available capacity → add soft warning
   - Check performed AFTER each inspection pass (not just at end) for early detection

---

## Phase 5 — Final Assembly and Transit Path Planning

Connect individual inspection segments into continuous flight plan.

### Visibility Graph Construction
- Graph nodes: takeoff position, landing position, start/end points of each inspection pass, vertices of all obstacle and safety zone polygons within operational geofence
- Edge between two nodes if straight-line segment does NOT intersect any obstacle or safety zone polygon
- Edge weights = geographic distance between nodes
- Constructed once per generation using PostGIS spatial intersection queries

### A* Pathfinding
- Compute shortest obstacle-free path between each pair of consecutive inspection endpoints
- Heuristic = geodesic distance to goal node
- Transit paths converted to waypoint sequences with TRANSIT waypoint type and no camera actions

### A* Pathfinding on Visibility Graph (REQUIRED — not optional)

The airport environment has 15+ obstacles and restricted zones that force non-obvious 
detours between inspection segments. Straight-line transit is NOT acceptable.

Implementation:
1. Construct visibility graph:
   - Nodes: takeoff pos, landing pos, start/end of each inspection pass, 
     vertices of all obstacle and safety zone polygons within geofence
   - For each node pair: use PostGIS ST_Intersects to check if the straight-line 
     segment between them crosses any obstacle geometry or safety zone polygon
   - Edge exists only if NO intersection detected
   - Edge weight = geodesic distance (use haversine)
2. Run A* from each transit start to transit end:
   - Heuristic = haversine distance to goal node
   - Returns shortest obstacle-free path
3. Convert A* result to waypoint sequence with TRANSIT type and NONE camera action
4. If no path found (completely blocked): terminate generation with error

PostGIS queries needed:
- ST_Intersects(ST_MakeLine(point_a, point_b), obstacle_geometry) for edge validation
- ST_Contains(geofence_polygon, waypoint_position) for geofence check
- ST_DWithin(waypoint_position, runway_geometry, buffer_distance) for runway buffer
### Compilation
1. Compile all inspection + transit waypoints into single ordered FlightPlan
2. Calculate total distance and estimated duration
3. Persist through FlightPlanRepository
4. Set mission status to PLANNED

---

## Constraint Types

All inherit from abstract Constraint class with `validate(waypoint)` interface and `isHardConstraint` flag.

### AltitudeConstraint (HARD)
- Enforces min/max flight altitude per waypoint
- Min: from inspection requirements (PAPI transition sector in camera FOV)
- Max: from EASA operational authorization and Control Zone upper boundary

### SpeedConstraint (HARD)
- Enforces max horizontal and vertical speed from drone profile
- Lower speed during inspection passes for sharp PAPI transition images

### BatteryConstraint (SOFT)
- Max allowable flight time with reserve margin
- Assessed GLOBALLY across entire flight plan during Phase 4 (not per-waypoint)
- Reserve margin for headwinds, emergency return-to-home

### RunwayBufferConstraint (HARD)
- Lateral and longitudinal buffer distances from runway centerline and threshold
- Derived from regulatory requirements
- PostGIS `ST_DWithin` for distance check

### GeofenceConstraint (HARD)
- Boundary polygon = maximum permitted operational area (airport Control Zone)
- PostGIS `ST_Contains` point-in-polygon test for each waypoint

---

## SafetyValidator Service

Integrates all 5 constraint types into unified validation pipeline:
1. Iterates every waypoint in flight plan
2. Evaluates against each active constraint
3. Performs spatial intersection tests (trajectory segments vs obstacle geometries + safety zone polygons) using PostGIS
4. Output: ValidationResult with individual violation records
   - Each record: violated constraint + offending waypoint + hard failure or soft warning
   - Any hard failure → entire flight plan rejected
   - Only soft warnings → plan accepted, warnings shown to operator

---

## TrajectoryGenerator Service Interface

Public methods (can be invoked independently for testing or composed by pipeline):

```
computeTrajectory(inspection, config, target) → List[Waypoint]
determineStartPosition(target, config, method) → Coordinate
determineEndPosition(target, config, method) → Coordinate
calculateArcPath(start, end, center, config) → List[Waypoint]
calculateVerticalPath(start, end, center, config) → List[Waypoint]
computeTransitPath(from, to, visibilityGraph) → List[Waypoint]
reroutePath(waypoint, obstacle) → Waypoint
applyConstraints(waypoints, constraints) → List[Waypoint]
```

## SafetyValidator Service Interface

```
checkDroneConstraints(waypoint, droneProfile) → bool
checkObstacles(waypoint, obstacles, safetyZones) → bool
checkBatteryPrediction(duration, distance, droneProfile) → bool
validateFlightPlan(flightPlan, constraints) → ValidationResult
```

---

## Inspection Configuration Parameters

Each inspection carries an InspectionConfiguration:

- **measurementDensity** (int): Number of waypoints along path. Angular sweep: determines Δθ. Vertical profile: determines altitude step. Higher = finer resolution, longer flight.
- **altitudeOffset** (float): Adjustment to nominal inspection altitude. Shifts measurement plane above/below default glide slope altitude.
- **speedOverride** (float): Overrides default drone speed during inspection pass. Lower = sharper images. `isSpeedCompatibleWithFrameRate()` verifies against camera frame rate.
- **customTolerances** (float): Overrides default angular tolerances (±2 arc minutes for PAPI transitions). Stored for analysis software, does NOT affect trajectory geometry.
- **hoverDuration** (float): Dwell time at HOVER waypoints at transition angle boundaries.

---

## Waypoint Model

Each waypoint stores:
- sequenceOrder (int)
- position (PointZ — lat, lon, alt in WGS84 SRID 4326)
- heading (float — direction drone faces)
- speed (float)
- hoverDuration (float)
- cameraAction (enum: NONE, PHOTO_CAPTURE, RECORDING_START, RECORDING_STOP)
- waypointType (enum: TAKEOFF, TRANSIT, MEASUREMENT, HOVER, LANDING)
- cameraTarget (PointZ — point camera looks at, for PAPI = LHA center)
- inspectionReference (FK to Inspection — nullable for TAKEOFF/TRANSIT/LANDING)

---

## FlightPlan Model

- mission (FK, unique — one flight plan per mission)
- airport_id (FK)
- waypoints (list, ordered by sequenceOrder)
- totalDistance (float — sum of segment distances)
- estimatedDuration (float — sum of segment times based on speeds)
- isValidated (bool)
- validationResult (FK to ValidationResult)
- generatedAt (timestamp)
- constraints (list of ConstraintRule applied)

---

## Existing Database Models and Services

The agent should read the existing codebase. The following already exist:
- All 19 SQLAlchemy models in `backend/app/models/`
- Airport CRUD in `backend/app/services/airport_service.py`
- Drone profile CRUD in `backend/app/services/drone_service.py`
- Inspection template CRUD in `backend/app/services/template_service.py`
- Mission CRUD + status transitions in `backend/app/services/mission_service.py`
- Inspection CRUD within missions in `backend/app/services/inspection_service.py`
- Seed data for LKPR airport with runways, obstacles, safety zones, PAPI + 4 LHAs, drone profile, inspection templates

New files to create:
- `backend/app/services/trajectory_generator.py`
- `backend/app/services/safety_validator.py`
- `backend/app/services/flight_plan_service.py`
- `backend/app/api/routes/flight_plans.py`
- `backend/app/schemas/flight_plan.py`
- `backend/app/utils/geo.py` (coordinate math: haversine, bearing, arc interpolation)
- `backend/tests/test_trajectory_generator.py`
- `backend/tests/test_safety_validator.py`
