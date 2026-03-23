# Trajectory Audit: TarmacView vs ZEPHYR Measurement Procedures

**Date:** 2026-03-23
**Reference:** ZEPHYR_Prirucka_Meranie LPZ_v2.pdf (Section 3.2 - Meranie vizualnych LPZ na letiskach)
**Source code:** `backend/app/services/trajectory_computation.py`, `backend/app/services/trajectory_types.py`

---

## Overview

This audit compares the TarmacView trajectory generation algorithms against the ZEPHYR UAS measurement methodology for visual LPZ (PAPI/VGSI) inspection on airports.

---

## ZEPHYR Procedures vs TarmacView Implementation

### Procedure a) - Vertical Flight (PAPI Angle Check)

**ZEPHYR:** Vertical ascent for checking PAPI transition angles at MM level or min 350m from PAPI.

**TarmacView:** `VERTICAL_PROFILE` method - vertical path at configurable `horizontal_distance` (default 400m), elevation from 1.9 deg to 6.5 deg, with HOVER waypoints at LHA setting angle boundaries.

**Status: Correct**
- Default distance 400m exceeds the 350m minimum
- Elevation range 1.9-6.5 deg covers all PAPI transition angles (typically 2.5-3.5 deg) with margin
- HOVER at transition angles matches the manual's intent of checking angle transitions
- Drone positioned on approach side facing PAPI front

### Procedure b) - Horizontal Coverage (Angular Sweep)

**ZEPHYR:** Horizontal arc at +/-15 deg from runway axis, min 350m from PAPI, at glide slope height.

**TarmacView:** `ANGULAR_SWEEP` method - arc at configurable `sweep_angle` (default +/-15 deg), at `horizontal_distance` (default 350m), at glide slope altitude.

**Status: Correct**
- Sweep angle default +/-15 deg matches exactly
- Distance default 350m matches the minimum
- Altitude computed as `center.alt + radius * tan(glide_slope)` - correct geometry
- Arc centered on approach heading facing PAPI front

### Procedure c) - Dimming Level Verification

**ZEPHYR:** Verify dimming steps of light intensity.

**TarmacView:** Not implemented as a trajectory - operational check requiring manual verification.

**Status: N/A** - Not a flight path procedure, handled during operational measurement.

### Procedure d) - ALS Horizontal Coverage

**ZEPHYR:** +/-15 deg from runway axis at 300m from ALS end, 60m above threshold.

**TarmacView:** Not implemented.

**Status: Missing** - Would require a separate inspection type targeting ALS rather than PAPI. Could be added as a future inspection method.

### Procedure e) - Approach Descent

**ZEPHYR:** Nominal glide angle approach from 1km from ALS end.

**TarmacView:** Not implemented as a dedicated trajectory.

**Status: Missing** - Simulates pilot's view during approach. Not critical for PAPI angle verification but provides additional validation of the complete visual picture.

### Procedure f) - MEHT Check

**ZEPHYR:** Verify Minimum Eye Height over Threshold at published value.

**TarmacView:** Not implemented as a trajectory - single-point verification.

**Status: N/A** - Single measurement point, not a flight path.

### Procedure g) - Runway Overfly

**ZEPHYR:** Fly over entire runway at 10m AGL for obstacle/pattern check.

**TarmacView:** Not implemented.

**Status: Missing** - Operational check for obstacle clearance and light pattern visibility.

---

## Parameter Comparison

| Parameter | ZEPHYR Specification | TarmacView Value | Match |
|---|---|---|---|
| Min distance from PAPI | 350m | 350m (MIN_ARC_RADIUS) / 400m (DEFAULT_HORIZONTAL_DISTANCE) | Yes |
| Horizontal sweep angle | +/-15 deg | +/-15 deg (DEFAULT_SWEEP_ANGLE) | Yes |
| Vertical elevation range | Covers all transition angles | 1.9-6.5 deg (MIN/MAX_ELEVATION_ANGLE) | Yes |
| Glide slope altitude | At glide slope height | `center.alt + radius * tan(glide_slope)` | Yes |
| Approach side positioning | From approach direction | `(runway_heading + 180) % 360` | Yes |
| Camera orientation | Directed at LPZ | `camera_target` set to LHA center point | Yes |

## Tolerance Comparison

| Parameter | ZEPHYR Tolerance | TarmacView Handling |
|---|---|---|
| Glide slope angle | +/-0.15 deg | HOVER_ANGLE_TOLERANCE for transition detection |
| Color transition angle | 3'/0.05 deg | Camera resolution dependent, not trajectory parameter |
| Transition angles | +/-0.10 deg | HOVER_ANGLE_TOLERANCE controls waypoint placement |
| Horizontal coverage (VGSI) | min +/-12 deg | DEFAULT_SWEEP_ANGLE = 15 deg (exceeds minimum) |
| Horizontal coverage (ALS) | min +/-15 deg | Not separately implemented |

---

## Conclusion

The two core PAPI inspection methods implemented in TarmacView - **Vertical Profile** and **Angular Sweep** - correctly implement ZEPHYR procedures (a) and (b). The geometry calculations, distances, angles, and altitude computations are sound and align with both the ZEPHYR manual and ICAO Doc 9157 requirements.

### What is correct:
- Vertical profile geometry and elevation range
- Angular sweep arc path and sweep angles
- Distance from PAPI (meets or exceeds minimums)
- Glide slope altitude calculation
- Camera target orientation toward LHA center
- HOVER waypoints at PAPI transition angle boundaries
- Approach-side drone positioning

### What is missing (non-critical for PAPI verification):
- ALS horizontal coverage inspection (procedure d)
- Approach descent trajectory (procedure e)
- Runway overfly at 10m AGL (procedure g)

These missing procedures are supplementary operational checks. They could be added as future inspection methods but are not required for the primary PAPI angle verification use case.
