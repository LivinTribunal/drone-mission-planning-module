# ADR: Embedding geozones in mission exports

- Status: Accepted
- Date: 2026-04-22
- Related: issue #205

## Context

Up until this change, every export format in TarmacView (KMZ, WPML, KML, JSON, MAVLINK, UGCS, GPX, CSV, LITCHI, DRONEDEPLOY) emitted waypoints only. The server validates the trajectory against the airport's obstacles and safety zones (see `backend/app/models/flight_plan.py::GeofenceConstraint` and `RunwayBufferConstraint`), but that context was dropped at the file boundary. A drone receiving only measurement waypoints had no way to honor the airport's keep-outs at flight time.

Issue #205 asks for an opt-in "include geozones in export" option. Not every target platform supports this, so the option has to be gated by **both** format and drone capability.

## Decision

1. **Per-format handling**: formats that can natively carry keep-out polygons embed them; formats that cannot are rejected when the flag is set.
   - `MAVLINK` — when the flag is on, we switch from WPL 110 text to QGC `.plan` JSON and populate `geoFence.polygons[]` with `inclusion: false` entries for every blocking safety zone and obstacle. Runway buffers ship as `inclusion: true` entries only when the operator also ticks "include runway buffers" (opt-in within opt-in, since an over-constraining inclusion polygon bricks takeoff).
   - `JSON` — adds a top-level `geozones` object with `safety_zones`, `obstacles`, and `runway_buffers`. Downstream tooling consumes it.
   - `UGCS` — adds `route.noFlyZones` (and `inclusionZones` for runway buffers) and sets `checkCustomNfz: true` so UgCS enforces them.
   - `KMZ` — adds a `wpmz/geozones.kml` sibling inside the WPMZ archive. The main `template.kml`/`waylines.wpml` files stay exactly as before. DJI Pilot 2 renders the sidecar as an overlay but does **not** enforce it; the description line on every polygon says so.
   - `KML` — adds a `<Folder name="Keep-out zones">` with a clear `ADVISORY ONLY` description.
   - `WPML`, `GPX`, `LITCHI`, `CSV`, `DRONEDEPLOY` — no native fence concept. The gate rejects `include_geozones=True` for these with a 400.

2. **Drone capability gate**: a new `DroneProfile.supports_geozone_upload` boolean controls whether the UI and backend gate allow embedding at all. Seeded True for ArduPilot/PX4/Holybro/CubePilot/Pixhawk families by the migration; everything else (consumer DJI, Litchi-only platforms, photogrammetry-oriented airframes) stays False.

3. **Runway buffers are a secondary opt-in**. The acceptance criteria call out that runway/taxiway buffers must not auto-ship, because an inclusion polygon that excludes the transit path prevents takeoff entirely. We gate them behind `include_runway_buffers=True`, which requires `include_geozones=True`.

## Why WPML cannot carry fences

DJI's WPML 1.0.6 schema has no `fence`, `geoFence`, `noFly`, or equivalent element. The DJI Cloud API documentation covers the executable wayline format (actions, payload, heading/gimbal params, turn params) and nothing else. Enterprise fleets that need fences push them to the aircraft out-of-band via FlightHub 2's **Custom Flight Area** feature, which is a separate server-to-server API:

- OpenAPI: `POST /flighthub2/v1/flight-areas` with a polygon and altitude band
- The aircraft receives the area via the FlightHub 2 / FlySafe channel at the airport gate, not via the mission file

Embedding a fake fence element in WPML would not be honored at flight time and would give the operator a false sense of safety. So WPML is explicitly unsupported and the UI disables the checkbox when WPML is the only selected format.

## Why KML/KMZ are advisory only

DJI Pilot 2 reads KML overlays and renders their polygons, but it does not treat them as keep-outs. Operators viewing the mission pre-flight can see where the exclusions are, but the aircraft will cross them if the waypoint route does. This matches Google Earth's behavior for KML: visualization, not enforcement.

We emit the polygons anyway because:
- Operators benefit from seeing keep-outs on the pre-flight overlay
- The advisory text in every polygon description makes the enforcement boundary clear
- The main WPMZ archive (`template.kml` + `waylines.wpml`) is untouched, so the file remains compatible with existing fh2 imports — the sidecar is an additional file rather than a replacement

## Alternatives considered

- **Always embed zones, regardless of format**: rejected. Emitting polygons into GPX or Litchi CSV produces files that downstream tools silently ignore, which is worse than an explicit rejection.
- **Hardcode drone capability by manufacturer/model string**: rejected. We need an explicit per-profile boolean so custom profiles (and airframes we add later) can be toggled without a migration.
- **Drive FlightHub 2 Custom Flight Area creation from TarmacView**: out of scope. That integration needs FlightHub 2 OpenAPI credentials and tenant onboarding. Left as a follow-up (#202 audit can track it).
- **Switch `MAVLINK` unconditionally to `.plan` JSON**: rejected. That would break operators currently consuming WPL 110 in QGroundControl Classic / APM Planner. We only switch format when the caller actually asks for embedded fences.

## Consequences

- Operators see a new "Include geozones in export" checkbox on Page 08 (Validation & Export). When the current selection supports it, the checkbox is enabled; otherwise a tooltip lists the supported format/drone combinations.
- `DroneProfile` gains `supports_geozone_upload` (migration `d2e5f7a9c1b3`). Seed values follow the research matrix; custom profiles default to False and must be flipped explicitly.
- The MAVLINK export file extension changes from `.waypoints` to `.plan` when `include_geozones=True`, and content-type switches from `text/plain` to `application/json`.
- KMZ archives gain an optional `wpmz/geozones.kml` entry alongside the existing `template.kml` and `waylines.wpml`. The archive remains a valid DJI WPMZ bundle.
- The gate is enforced server-side (`export_service.export_mission`) so any client hitting the API directly still has to satisfy it.
