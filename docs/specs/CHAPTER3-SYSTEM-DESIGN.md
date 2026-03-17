# Chapter 3 — System Design (Complete Thesis Text)

This chapter presents the architectural design of the proposed drone mission planning module. The design uses standard Unified Modeling Language (UML) diagrams and Entity-Relationship Diagrams (ERDs) as the primary modeling notation. A design-first methodology was chosen to enable early identification of structural flaws and ensure the resulting system remains modular and extensible.

## 3.1 System Architecture

The system architecture employs a layered web application model guided by SOLID object-oriented principles. Where appropriate, the design uses abstract classes to decouple layers and enable extension with new functionality.

To achieve this separation of concerns, the system is divided into three primary tiers:

- Presentation Layer: The user-facing frontend, responsible for map visualization, mission configuration, and flight plan export.
- Application Layer: The computational core, containing all mission planning logic, trajectory generation, and safety validation services.
- Data Layer: The persistence backend, managing spatial and relational data through dedicated repository components.

```
Presentation Layer — User-facing frontend
  Map Visualization | Mission Dashboard | Inspection Configurator | Export Panel
                              REST API
Application Layer — Core business logic and domain services
  Mission Manager | Trajectory Generator | Safety Validator | Export Service
                            Interfaces
Data Layer — Persistence and spatial queries
  Airport Repo | Mission Repo | Inspection Repo | FlightPlan Repo | PostGIS
```

A RESTful API facilitates all communication between the frontend and the backend. Because storage and processing of spatial objects are critical to this domain, the architecture uses PostgreSQL with the PostGIS extension, providing native support for the geometric calculations required for mapping drone trajectories within an airport environment.

### 3.1.1 Functional Overview

The system's functional scope is modeled as a UML use case diagram. The system recognizes three distinct actors. The Drone Operator is the primary user, responsible for the entire mission lifecycle from configuration through flight plan generation, review, and export. The Coordinator manages the foundational reference data, including airport definitions, safety zones, obstacles, inspection targets, and drone profiles. The Airport Database is a system actor representing the external data source that provides airport infrastructure and supports safety validation.

All use cases operate within the Mission Planning Module boundary. The detailed interaction workflows for each actor are described in Section 3.6.

### 3.1.2 Architectural Overview

This subsection presents the internal component architecture that realizes the functional requirements defined above. The system follows a strict top-down dependency flow across its three tiers, where each layer communicates exclusively with the layer directly beneath it.

A typical interaction begins when the Drone Operator initiates flight plan generation. The frontend dispatches an HTTP request through the APIClient, which serves as the sole communication bridge between the presentation and application layers. The request is received by the RESTController, which handles endpoint routing, input validation, and mapping of data transfer objects.

The RESTController delegates the request to the appropriate service within the application layer. For flight plan generation, the MissionManager orchestrates the process by invoking the TrajectoryGenerator, which computes the waypoint sequence based on the inspection configuration and drone profile. The resulting trajectory is then passed to the SafetyValidator, which checks every waypoint against the active constraint set, including altitude limits, speed limits, runway buffer zones, geofence boundaries, and battery reserves. If the Operator later requests an export, the MissionManager delegates to the ExportService, which serializes the flight plan into the requested format.

All services access persistent data exclusively through repository interfaces in the data layer. The AirportRepository provides access to airport infrastructure, surfaces, obstacles, and safety zones. The MissionRepository handles mission records and drone profiles. The InspectionRepository manages inspection configurations and templates. The FlightPlanRepository persists generated flight plans and their waypoints. Each repository abstracts the underlying PostgreSQL database with PostGIS, ensuring that the application layer remains decoupled from the specifics of spatial query execution.

### 3.1.3 Component Breakdown

This subsection summarizes the responsibilities of each component within the system, organized by architectural layer.

**Presentation Layer.** The presentation layer consists of five components. The MapVisualization component renders the interactive map environment, overlaying runway geometries, safety zones, obstacles, and the generated flight trajectory. The MissionDashboard provides the central management interface for creating, viewing, and managing missions. The InspectionConfigurator allows the Operator to select inspection templates, pick AGL targets, and adjust method-specific parameters. The ExportPanel handles the output phase, presenting available export formats and the validation report. The APIClient encapsulates all HTTP communication with the backend, serving as the single point of integration.

**Application Layer.** The application layer contains four service components and one controller. The RESTController exposes the backend as RESTful API endpoints and contains no business logic. The MissionManager orchestrates the mission lifecycle, coordinating trajectory computation, safety validation, and state transitions. The TrajectoryGenerator is the computational core, producing ordered waypoint sequences from inspection configurations and drone profiles. The SafetyValidator verifies that every waypoint complies with the active constraint set and produces a ValidationResult with hard failures or soft warnings. The ExportService serializes validated flight plans into KML, KMZ, JSON, and MAVLink formats.

**Data Layer.** The data layer consists of four repository components that abstract the underlying PostgreSQL database with PostGIS. The AirportRepository handles airport infrastructure, surfaces, obstacles, and safety zones. The MissionRepository manages mission records and drone profiles. The InspectionRepository handles inspection records, configurations, and templates. The FlightPlanRepository persists flight plans and their waypoint sequences. All spatial queries, including polygon intersection tests and distance calculations, are confined to this layer.

### 3.1.4 Inter-Component Dependencies

The system enforces a strict unidirectional dependency rule: each component may only depend on components within its own layer or the layer directly beneath it. Within the presentation layer, all user-facing components depend exclusively on the APIClient, which communicates with the RESTController as the sole entry point to the application layer. Within the application layer, the MissionManager acts as the central orchestrator and holds dependencies on the TrajectoryGenerator, SafetyValidator, and ExportService. These three services are independent of each other and can evolve separately.

All application services access persistent data exclusively through repository interfaces. No service communicates directly with the PostgreSQL database, confining spatial query logic to the data layer. The resulting dependency graph forms a directed acyclic structure with no circular references, enabling each component to be tested in isolation by substituting its dependencies with mock implementations.

## 3.2 Mission Data Model

This section defines the domain model that underpins all system operations, from the physical airport infrastructure through inspection configurations to the generated flight plans. The design is presented first as a class diagram capturing logical relationships, and then as an entity-relationship diagram mapping these abstractions to the physical database schema.

### 3.2.1 Domain Model Overview

The domain model is organized into five cohesive groups: Airport Infrastructure, Lighting and Inspection Targets, Mission and Inspection, Drone and Constraints, and Flight Plan Outputs. Standard UML notation is used throughout the class diagram.

### 3.2.2 Airport Infrastructure Domain

The Airport entity serves as the top-level aggregate root, holding the ICAO code, name, elevation, and geographic coordinates. Each Airport owns one AirportInfrastructure instance through composition, which aggregates all physical elements of the aerodrome: one or more AirfieldSurface entities, zero or more Obstacle entities, and zero or more SafetyZone entities.

AirfieldSurface is modeled as an abstract class with two concrete subclasses, Runway and Taxiway, allowing the system to treat all surfaces uniformly when computing trajectory clearances while preserving their distinct attributes. SafetyZone entities are classified by the SafetyZoneType enumeration (CTR, RESTRICTED, PROHIBITED, TEMPORARY_NO_FLY) and stored as geographic polygons for use by the SafetyValidator.

### 3.2.3 Lighting and Inspection Target Domain

Aeronautical Ground Lighting is modeled through the AGL entity, associated with airfield surfaces via one-to-many aggregation. The PAPISystem entity extends AGL through inheritance, adding PAPI-specific attributes such as the installation side, glide slope angle, and offset from the centerline. Each PAPISystem composes exactly four LHA (Light Housing Assembly) instances, each recording its setting angle, transition sector width, and geographic position. The PAPISystem exposes a calculateLHACenterPoint() method that computes the geometric center of the four-unit array, serving as the reference point for trajectory computation.

The InspectionTargets entity groups specific AGL targets for a particular inspection, linking the lighting domain to the mission domain.

### 3.2.4 Mission and Inspection Domain

The Mission entity is the central orchestrating object, with its status tracked through the MissionStatus enumeration (DRAFT, PLANNED, VALIDATED, EXPORTED, COMPLETED, CANCELLED). Each Mission composes one MissionConfiguration and one or more Inspection entities.

The MissionConfiguration also stores the designated takeoff and landing coordinates, which serve as the origin and destination of the flight plan and are used by the TrajectoryGenerator to compute the initial and final transit segments.

Each Inspection references an InspectionTemplate, a reusable recipe defining targets and methods, linked through the junction entities InspectionTargets and InspectionMethods. Each Inspection also holds an InspectionConfiguration storing method-specific parameters (altitude offset, speed override, measurement density, custom tolerances). Two key methods support the design: resolveWithDefaults() merges operator overrides with template defaults, and isSpeedCompatibleWithFrameRate() verifies camera sampling compatibility.

### 3.2.5 Drone and Constraint Domain

The DroneProfile entity models the UAV's performance characteristics, including speed limits, altitude limits, battery capacity, and camera specifications. These parameters directly influence the constraint values applied during trajectory generation.

The constraint system uses a polymorphic hierarchy rooted in the abstract Constraint class, which defines a validate(waypoint) method and an isHardConstraint flag distinguishing plan-rejecting failures from soft warnings. Five concrete subclasses implement this interface:

- AltitudeConstraint: enforces minimum and maximum flight altitude.
- SpeedConstraint: enforces maximum horizontal and vertical speed.
- BatteryConstraint: enforces maximum flight time with a reserve margin.
- RunwayBufferConstraint: enforces buffer distances from the runway centerline and threshold.
- GeofenceConstraint: enforces a boundary polygon defining the permitted operational area.

### 3.2.6 Flight Plan and Output Domain

The FlightPlan entity represents the generated output, associated one-to-one with its parent Mission and composing one or more Waypoint entities. Each Waypoint records a geographic coordinate, altitude, speed, heading, camera action (CameraAction enumeration), and waypoint type (WaypointType enumeration). Waypoints carry an association back to their originating Inspection for traceability.

The FlightPlan holds an optional ValidationResult capturing the safety validation outcome, with individual violation records linked to specific constraints. The ExportResult entity stores metadata of exported files, including format, file path, and timestamp.

### 3.2.7 Enumeration Types

The domain model defines nine enumeration types that enforce type safety and restrict attribute values to valid domain-specific options.

| Enum | Values |
|------|--------|
| PAPISide | LEFT, RIGHT |
| LampType | HALOGEN, LED |
| InspectionMethod | VERTICAL_PROFILE, ANGULAR_SWEEP |
| SafetyZoneType | CTR, RESTRICTED, PROHIBITED, TEMPORARY_NO_FLY |
| ExportFormat | MAVLINK, KML, KMZ, JSON |
| CameraAction | NONE, PHOTO_CAPTURE, RECORDING_START, RECORDING_STOP |
| WaypointType | TAKEOFF, TRANSIT, MEASUREMENT, HOVER, LANDING |
| MissionStatus | DRAFT, PLANNED, VALIDATED, EXPORTED, COMPLETED, CANCELLED |
| ObstacleType | BUILDING, TOWER, ANTENNA, VEGETATION, OTHER |

### 3.2.8 Entity-Relationship Design

The entity-relationship diagram maps the logical domain model to the physical database schema implemented in PostgreSQL with PostGIS.

The physical schema introduces several structural differences from the class diagram. The abstract AirfieldSurface hierarchy is flattened into a single airfield_surface table with a discriminator column, a standard approach for single-table inheritance. Similarly, the abstract Constraint hierarchy is represented by a unified constraint_rule table with a type discriminator. Many-to-many relationships are realized through dedicated junction tables (insp_template_targets and insp_template_methods).

All entities use UUID primary keys for global uniqueness. Coordinate data is stored using PostGIS native geographic types, enabling spatial indexing and efficient geometric queries. The database contains nineteen tables in total.

**Tables:** airport, airfield_surface, obstacle, safety_zone, agl, lha, drone_profile, inspection_template, insp_template_targets, insp_template_methods, inspection_configuration, mission, inspection, flight_plan, waypoint, validation_result, validation_violation, export_result, constraint_rule.

## 3.3 Trajectory Generation Algorithm

This section details the core computational pipeline that transforms a mission configuration into a concrete flight plan. The algorithm is presented as a five-phase process, corresponding to the swim lanes of the accompanying activity diagram.

### 3.3.1 Inspection Methods and Trajectory Geometry

The trajectory geometry is determined by the inspection method assigned to each target. The system supports two methods, corresponding to the two primary flight maneuvers defined in the inspection methodology used by ZEPHYR UAS for verifying visual airport ground lighting. Each method produces a geometrically distinct waypoint sequence.

**Angular Sweep (ANGULAR_SWEEP).** This method verifies the horizontal coverage of the PAPI signal by flying the drone through an arc at a fixed distance from the PAPI installation. The arc is centered on the LHA center point, which is the geometric centroid of the four Light Housing Assembly positions computed by the calculateLHACenterPoint() method of the PAPISystem entity. The sweep extends from -alpha to +alpha relative to the extended runway centerline, where alpha is derived from the required horizontal coverage angle (typically +/-10 degrees for PAPI, with additional margin). The drone maintains a constant altitude within the glide slope sector throughout the sweep. The radius of the arc is determined by the configured inspection distance, which must be at least 350 m from the PAPI position to ensure accurate optical measurement.

The calculateArcPath() method generates this trajectory by computing waypoint positions along the arc at angular increments determined by the measurement density parameter. For each waypoint, the geographic coordinates are calculated as:

```
xi = xc + r * sin(theta_i)
yi = yc + r * cos(theta_i)
```

where (xc, yc) is the LHA center point, r is the inspection distance, and theta_i ranges from -alpha to +alpha in steps of delta_theta = 2*alpha/n, with n being the number of measurement points specified by the measurement density. The altitude is held constant at the elevation corresponding to the glide slope angle at distance r.

**Vertical Profile (VERTICAL_PROFILE).** This method verifies the setting angles of each individual PAPI light unit by flying the drone along the extended runway centerline while changing altitude. The drone ascends (or descends) through the vertical sector of the PAPI signal, sweeping from below the lowest transition angle to above the highest. For a standard 3 degree glide slope PAPI, the vertical sweep covers the range from approximately 1.9 degrees to 6.5 degrees elevation, which corresponds to the full sector from all-red to all-white indication.

The calculateVerticalPath() method generates this trajectory as a series of waypoints at a fixed horizontal distance from the PAPI (at the Middle Marker position or a configured distance), with altitudes increasing linearly between the start and end elevations. The start and end altitudes are computed from the angular boundaries and the horizontal distance:

```
hi = d * tan(phi_i)
```

where d is the horizontal distance from the LHA center point to the drone position and phi_i ranges from the lower boundary angle to the upper boundary angle in steps determined by the measurement density. At critical measurement positions, particularly at each transition angle boundary, the system inserts a HOVER waypoint with a configurable dwell time specified by the hoverDuration parameter. This allows the camera to capture a stabilized image of the light transition. As the drone passes through each transition sector, the camera captures the color change of each light unit, enabling post-processing software to determine the precise transition angle.

Both methods share a common preprocessing step: the system first computes the LHA center point and then determines the start and end positions based on the method type and configuration parameters. The camera heading is oriented toward the PAPI installation throughout both maneuvers. The required gimbal pitch angle at each waypoint is computed as the elevation angle from the drone position to the LHA center point and stored alongside the waypoint heading, enabling the ground control station to orient the camera automatically during flight.

### 3.3.2 Algorithm Overview

The trajectory generation algorithm operates as a sequential pipeline composed of five phases:

1. Mission Data Loading: Retrieves and resolves all input data required for computation.
2. Inspection Loop: Iterates over each inspection target and method to compute the raw waypoint sequences.
3. Waypoint Validation Loop: Validates each waypoint against drone constraints, obstacles, and safety zones.
4. Post-Inspection Processing: Assigns camera actions, appends waypoints to the flight plan, and verifies battery feasibility.
5. Final Assembly: Computes transit paths between inspection segments, compiles the flight plan, and updates the mission status.

Each phase either advances the pipeline to the next stage or terminates generation with an error if an unrecoverable constraint violation is detected.

### 3.3.3 Phase 1 -- Mission Data Loading

The pipeline begins by loading all data required for trajectory computation. The system retrieves the airport infrastructure from the AirportRepository, including runway geometries, obstacle positions, and safety zone polygons. It loads the selected drone profile from the MissionRepository, which provides the physical performance parameters that define the constraint boundaries. Finally, it resolves the inspection configurations by expanding each inspection template into its concrete targets and methods via the InspectionRepository. For each inspection, the resolveWithDefaults() method merges operator-specified overrides with the template's default configuration, producing the final parameter set used during computation.

At the end of this phase, the algorithm holds a complete, self-contained data context that requires no further database access during computation.

### 3.3.4 Phase 2 -- Inspection Loop

The algorithm iterates over each inspection defined in the mission, processing them in the order specified by the sequenceOrder attribute of the Inspection entity. This ordering is set by the Operator during mission configuration and determines the physical sequence of flight segments.

For every inspection, the system first resolves the configuration and verifies speed compatibility with the camera frame rate using the isSpeedCompatibleWithFrameRate() method. If the configured speed is too high for the camera to capture usable frames at the required measurement density, a warning is added.

The system then loads the inspection targets and computes the LHA center point for each PAPI target. Before proceeding with trajectory computation, the system verifies that the drone's sensor field of view is sufficient to capture all four LHA units in a single frame at the configured inspection distance. If the angular span of the LHA array exceeds the camera's sensorFOV at the planned distance, a warning is added to the validation result. Based on the inspection method (ANGULAR_SWEEP or VERTICAL_PROFILE), the algorithm branches into the corresponding trajectory computation path. For each method, the TrajectoryGenerator determines the start and end positions of the inspection pass using the target location, the configured inspection distance, and the angular boundaries. The system then generates the waypoint sequence using either calculateArcPath() or calculateVerticalPath().

Each inspection pass produces an ordered list of waypoints. These waypoints are immediately validated within the inspection loop before proceeding to the next target.

### 3.3.5 Phase 3 -- Waypoint Validation Loop

Once the raw waypoints for an inspection pass are computed, the algorithm enters a validation loop that evaluates each waypoint individually. For every waypoint, the system first checks drone constraints, verifying that the point's altitude, speed, and heading fall within the limits defined by the drone profile. A hard failure, such as exceeding the drone's maximum altitude, terminates the entire generation process immediately. A soft violation adds a warning to the validation result and allows the pipeline to continue.

After passing the drone constraint check, the waypoint undergoes obstacle and safety zone verification. The SafetyValidator performs spatial intersection tests between the waypoint's position and all registered obstacle geometries and safety zone polygons. If an obstruction is detected, the algorithm evaluates whether the waypoint can be rerouted around the obstacle by adjusting its coordinates while preserving the measurement geometry. If rerouting is possible, the waypoint is adjusted accordingly. If the obstruction cannot be avoided, generation is terminated.

### 3.3.6 Phase 4 -- Post-Inspection Processing

After all waypoints for an inspection pass are validated, the system assigns camera actions to each waypoint based on the inspection method and the waypoint's position within the pass. Waypoints within the active measurement zone receive the PHOTO_CAPTURE action, while waypoints in the lead-in and lead-out segments receive NONE. The validated and annotated waypoints are then appended to the flight plan, and the running totals (cumulative distance and estimated flight time) are updated.

The system then checks the cumulative battery consumption against the drone's capacity reduced by the configured reserve margin. If the estimated flight time exceeds the available capacity, a soft warning is added. This check is performed after each inspection pass rather than only at the end, enabling early detection of infeasible plans.

### 3.3.7 Phase 5 -- Final Assembly and Transit Path Planning

The final phase connects the individual inspection segments into a continuous flight plan. The system must compute safe transit paths between consecutive inspection passes, from the takeoff point to the first pass, and from the last pass to the landing point. Because the airport environment may contain obstacles and restricted safety zones between these points, direct straight-line connections are not always feasible.

The system constructs a spatial visibility graph to solve this problem. The graph nodes consist of the takeoff and landing positions, the start and end points of each inspection pass, and the vertices of all obstacle and safety zone polygons that lie within the operational geofence. An edge is created between two nodes if the straight-line segment between them does not intersect any obstacle or safety zone polygon. Edge weights are set to the geographic distance between the connected nodes. The graph is constructed once per flight plan generation using PostGIS spatial intersection queries.

With the visibility graph in place, the system applies the A* pathfinding algorithm to compute the shortest obstacle-free path between each pair of consecutive inspection endpoints. The heuristic function uses the geodesic distance to the goal node. The resulting transit paths are converted into waypoint sequences annotated with the TRANSIT waypoint type and no camera actions.

The algorithm then compiles all inspection and transit waypoints into a single ordered FlightPlan entity, calculates the total distance and estimated duration, and persists the result through the FlightPlanRepository. The mission status is updated to PLANNED, signaling that the flight plan is ready for operator review.

### 3.3.8 Inspection Configuration Parameters

Each inspection carries an InspectionConfiguration that controls the trajectory computation. The following parameters are available:

- measurementDensity: The number of waypoints generated along the inspection path. For an angular sweep, this determines the angular step between consecutive measurements. For a vertical profile, it determines the altitude step between consecutive waypoints. Higher density produces finer angular resolution at the cost of longer flight time.
- altitudeOffset: An adjustment applied to the nominal inspection altitude, allowing the operator to shift the measurement plane above or below the default glide slope altitude. This is used when verifying PAPI alignment at non-standard approach angles.
- speedOverride: Overrides the default drone speed during the inspection pass. Lower speeds allow the camera to capture sharper images and increase the effective sampling rate. The isSpeedCompatibleWithFrameRate() method verifies that the configured speed does not exceed the maximum at which the camera can still capture usable frames at the specified measurement density.
- customTolerances: Overrides the default angular tolerances (typically +/-2 minutes of arc for PAPI transition angles) used during post-processing evaluation. This does not affect the trajectory geometry but is stored alongside the flight plan for use by the analysis software.
- hoverDuration: Dwell time at HOVER waypoints inserted at transition angle boundaries for stabilized image capture.

### 3.3.9 TrajectoryGenerator Service Interface

The TrajectoryGenerator service exposes the following public methods, which can be invoked independently for testing or composed by the MissionManager during the full generation pipeline:

- computeTrajectory(inspection, config, target) -> List[Waypoint]: Executes the complete trajectory computation for a single inspection target, selecting the appropriate method based on the inspection configuration.
- determineStartPosition(target, config, method) -> Coordinate: Computes the geographic starting point of an inspection pass.
- determineEndPosition(target, config, method) -> Coordinate: Computes the geographic ending point of an inspection pass.
- calculateArcPath(start, end, center, config) -> List[Waypoint]: Generates the curved sweep path for the ANGULAR_SWEEP method.
- calculateVerticalPath(start, end, center, config) -> List[Waypoint]: Generates the vertical ascent path for the VERTICAL_PROFILE method.
- computeTransitPath(from, to, visibilityGraph) -> List[Waypoint]: Computes the shortest obstacle-free path between two points using A* on the visibility graph.
- reroutePath(waypoint, obstacle) -> Waypoint: Adjusts a waypoint's coordinates to avoid an obstacle while preserving the measurement geometry.
- applyConstraints(waypoints, constraints) -> List[Waypoint]: Adjusts waypoint parameters to satisfy the active constraint set.

## 3.4 Operational Constraints

This section formalizes the safety and operational constraints that the system enforces during trajectory generation and validation. Each constraint type maps directly to a real-world regulatory or physical limitation.

### 3.4.1 Constraint Types

All constraints inherit from the abstract Constraint class, which defines a common validate(waypoint) interface. The isHardConstraint flag determines the system's response to a violation: hard constraints terminate flight plan generation, while soft constraints produce warnings attached to the ValidationResult for operator review.

- AltitudeConstraint (hard): Enforces minimum and maximum flight altitude for every waypoint. The minimum is derived from inspection requirements (ensuring the PAPI transition sector is within the camera's field of view), and the maximum is dictated by the EASA operational authorization and the Control Zone upper boundary.
- SpeedConstraint (hard): Enforces horizontal and vertical speed limits derived from the drone profile. During inspection passes, a lower speed may be required to ensure the camera can capture sufficiently sharp images of the PAPI light transitions.
- BatteryConstraint (soft): Defines the maximum allowable flight time with a reserve margin for unexpected conditions such as headwinds or emergency return-to-home. Unlike other constraints, the battery constraint is assessed globally across the entire flight plan during Phase 4 rather than per-waypoint.
- RunwayBufferConstraint (hard): Enforces lateral and longitudinal buffer distances from the runway centerline and threshold, ensuring safe separation from the active runway surface. Buffer dimensions are derived from regulatory requirements.
- GeofenceConstraint (hard): Defines a boundary polygon representing the maximum permitted operational area, typically derived from the airport's Control Zone. The SafetyValidator performs a point-in-polygon test for each waypoint.

### 3.4.2 SafetyValidator Service

The SafetyValidator service integrates all five constraint types into a unified validation pipeline. When invoked, it iterates over every waypoint in the flight plan and evaluates it against each active constraint. It also performs spatial intersection tests between the trajectory segments and all registered obstacle geometries and safety zone polygons using PostGIS spatial functions.

The output is a ValidationResult entity containing individual violation records. Each record identifies the violated constraint, the offending waypoint, and whether the violation is a hard failure or soft warning. If any hard failure is present, the entire flight plan is rejected. If only soft warnings exist, the plan is accepted, and the warnings are made visible to the Operator for review before export.

## 3.5 Integration with Airport Operations

### 3.5.1 Data Ingestion

The system requires accurate airport data to compute valid trajectories. Airport geometry, including runway coordinates, surface boundaries, obstacle positions, and safety zone polygons, is ingested by the Coordinator through the administrative use cases. All geographic data is stored using the WGS 84 coordinate reference system (EPSG:4326), mandated by ICAO as the standard geodetic datum for all published aeronautical coordinates. This ensures that the coordinates in the flight plan are directly compatible with the drone's onboard navigation system without requiring coordinate transformation at export time.

### 3.5.2 Drone Profile Management

The system supports multiple drone platforms through the DroneProfile entity. The Coordinator registers each available UAV by specifying its performance parameters: maximum altitude, speed limits, battery capacity, camera specifications, and physical dimensions. When the Operator creates a mission, the selected drone profile determines the constraint values applied during trajectory generation. This decoupling between the mission logic and the drone hardware ensures that the same inspection plan can be executed on different platforms by simply switching the drone profile.

### 3.5.3 Mission Lifecycle

The mission progresses through a well-defined state machine with six states:

1. DRAFT: The mission has been created and the Operator is configuring inspection parameters, targets, and the drone profile.
2. PLANNED: The trajectory generation algorithm has completed successfully and a flight plan with validated waypoints has been persisted.
3. VALIDATED: The Operator has reviewed the flight plan, examined any warnings, and explicitly approved it for export.
4. EXPORTED: The flight plan has been serialized into one or more output formats and is ready for deployment to the drone's ground control station.
5. COMPLETED: The mission has been marked as finished after the physical inspection flight.
6. CANCELLED: The mission has been abandoned. This is a terminal state.

Transitions are unidirectional, with the exception of the loop between PLANNED and DRAFT, which occurs when the Operator modifies flight parameters and triggers a trajectory regeneration. The MissionManager enforces these transition rules, preventing invalid state changes such as exporting an unvalidated plan.

## 3.6 User Interface

### 3.6.1 Operator Workflow

The Operator's interaction with the system follows a sequential workflow that mirrors the mission lifecycle. The Operator begins by selecting the target airport and runway, which triggers the automatic loading of the associated airport data. The Operator then defines the mission by selecting a drone profile, choosing one or more inspection templates, and configuring the inspection parameters for each target. With the mission fully configured, the Operator initiates flight plan generation. The system computes the trajectory, validates it against all constraints, and presents the result along with any warnings.

The Operator reviews the generated plan through the 3D map visualization and examines the validation report. If modifications are needed, the Operator adjusts the flight parameters and regenerates the trajectory. Once satisfied, the Operator approves the plan, selects the desired export formats, and downloads the flight plan files. The mission is then marked as completed or cancelled.

### 3.6.2 Coordinator Workflow

The Coordinator manages the system's reference data through a set of administrative interfaces. This includes defining airports with their runway geometries, specifying safety zones and obstacle positions, creating inspection targets linked to specific AGL installations, building reusable inspection plans that combine targets with methods and default parameters, and registering drone profiles with their hardware specifications. This data forms the foundation upon which all operator missions are built.

### 3.6.3 Flight Plan Review Process

The flight plan review is a critical step that bridges trajectory generation and export.

Upon entering the review phase, the system presents three elements simultaneously: the flight plan summary (total distance, estimated duration, number of waypoints), any warnings produced during validation, and the 3D visualization of the trajectory overlaid on the airport map. The Operator then has three options: modify the flight parameters and regenerate the trajectory, delete the flight plan entirely, or approve the plan (advancing the mission status to VALIDATED).

Once validated, the Operator may select one or more export formats compatible with common ground control stations and trigger the export. The system supports four export formats. KML and KMZ are used for visual review in Google Earth and similar geographic viewers. JSON provides a structured machine-readable representation for programmatic integration with custom ground control software. MAVLink waypoint format enables direct deployment to MAVLink-compatible autopilots such as ArduPilot and PX4 through ground control stations like QGroundControl. All formats encode the complete waypoint sequence with coordinates, altitudes, speeds, headings, and camera actions, ensuring that the exported flight plan can be loaded directly into the drone's ground control station without manual conversion.

The mission status advances to EXPORTED after successful file generation. From this state, the Operator can mark the mission as COMPLETED after the physical flight or CANCELLED if the mission is abandoned.

## 3.7 Summary

This chapter presented the architectural design of the drone mission planning module. The system follows a layered model with strict separation of concerns, supported by a domain model capturing five entity groups realized in a nineteen-table relational schema. Two inspection methods were defined to address the primary PAPI verification procedures: an angular sweep for horizontal coverage verification and a vertical profile for setting angle determination, each producing geometrically distinct waypoint sequences grounded in the ICAO inspection methodology. The trajectory generation algorithm operates as a five-phase pipeline that transforms a mission configuration into a validated flight plan, using a spatial visibility graph with A* pathfinding to compute obstacle-free transit paths between inspection segments. Five constraint types enforce the regulatory and physical limits, with the SafetyValidator providing a unified validation pipeline that distinguishes hard failures from soft warnings. The user interface supports two actor roles through distinct workflows, with the flight plan review process providing an explicit approval gate between generation and export.
