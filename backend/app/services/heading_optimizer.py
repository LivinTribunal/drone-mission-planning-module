"""auto-heading optimizer for mission inspections.

picks direction_reversed per inspection to minimize total transit distance
(and, as tie-breaker, total heading change) across the mission's inspection set.

candidate set per inspection is binary: natural or reversed. pinned (manual)
inspections stay fixed; unpinned (direction_is_auto) inspections participate
in the brute-force solve. with k unpinned and k <= 10, we evaluate at most
2^k = 1024 assignments in sequence order.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import DomainError, NotFoundError
from app.models.agl import AGL
from app.models.airport import AirfieldSurface, Airport
from app.models.enums import InspectionMethod
from app.models.inspection import Inspection, InspectionConfiguration, InspectionTemplate
from app.models.mission import Mission
from app.schemas.mission import HeadingAssignment, HeadingAutoResponse
from app.services.trajectory.config_resolver import resolve_with_defaults
from app.services.trajectory.helpers import (
    determine_end_position,
    determine_start_position,
    get_lha_positions,
    get_lha_positions_from_surfaces,
    get_ordered_lha_positions,
    get_runway_heading,
)
from app.services.trajectory.types import Point3D
from app.utils.geo import bearing_between, distance_between
from app.utils.mission_helpers import delete_flight_plan_if_exists

# solver safety cap - brute force is fine for k <= MAX_AUTO_INSPECTIONS (2^10 = 1024)
MAX_AUTO_INSPECTIONS: int = 10

# heading-change term is a gentle tie-breaker, not a primary cost. total transit
# distance wins, and this nudges the solver toward smoother trajectories when
# distances tie.
TURN_PENALTY_WEIGHT: float = 0.5


@dataclass
class _Segment:
    """per-inspection geometry for the solver.

    entry/exit are the natural-direction endpoints as the drone enters/leaves
    the inspection pass. scan_distance and scan_heading describe the pass
    itself. when direction_reversed is applied, entry/exit swap and the
    scan heading flips by 180 degrees.

    direction_flips_geometry=False means this method's endpoints and scan
    heading are unchanged by direction_reversed (hover_point_lock, meht_check,
    vertical_profile). such segments are fixed - the solver treats them as
    pinned regardless of direction_is_auto.
    """

    inspection_id: UUID
    sequence_order: int
    entry: Point3D
    exit: Point3D
    scan_heading: float
    scan_distance: float
    direction_flips_geometry: bool
    is_auto: bool
    current_reversed: bool


@dataclass
class HeadingSolution:
    """solver output: per-inspection resolved direction_reversed plus metrics."""

    assignments: list[HeadingAssignment]
    total_distance_m: float
    total_turn_deg: float
    baseline_distance_m: float
    baseline_turn_deg: float
    improvement_pct: float
    auto_inspection_count: int
    pinned_inspection_count: int


def _heading_delta(a: float, b: float) -> float:
    """absolute heading change in degrees, wrapped to [0, 180]."""
    d = abs(a - b) % 360.0
    return d if d <= 180.0 else 360.0 - d


def _build_segment(
    inspection: Inspection,
    surfaces: list[AirfieldSurface],
) -> _Segment | None:
    """derive entry/exit geometry for a single inspection.

    returns None when the inspection has no resolvable geometry (e.g. missing
    LHAs). those inspections are skipped during solving but kept in the
    assignment list with their current direction_reversed.
    """
    template = inspection.template
    config = resolve_with_defaults(inspection, template)
    lha_ids = inspection.lha_ids

    current_reversed = bool(config.direction_reversed)
    is_auto = bool(config.direction_is_auto)

    # methods where direction_reversed does not affect geometry
    non_flipping = {
        InspectionMethod.HOVER_POINT_LOCK,
        InspectionMethod.MEHT_CHECK,
        InspectionMethod.VERTICAL_PROFILE,
    }
    try:
        method = InspectionMethod(inspection.method)
    except ValueError:
        return None

    # for fly-over and parallel-side-sweep the scan endpoints sit on the
    # first/last ordered LHA positions
    if method in (InspectionMethod.FLY_OVER, InspectionMethod.PARALLEL_SIDE_SWEEP):
        ordered = get_ordered_lha_positions(template, lha_ids)
        if len(ordered) < 2:
            return None

        entry = ordered[0]
        exit_ = ordered[-1]
        heading = bearing_between(entry.lon, entry.lat, exit_.lon, exit_.lat)
        distance = 0.0
        for k in range(1, len(ordered)):
            distance += distance_between(
                ordered[k - 1].lon, ordered[k - 1].lat, ordered[k].lon, ordered[k].lat
            )
        return _Segment(
            inspection_id=inspection.id,
            sequence_order=inspection.sequence_order,
            entry=entry,
            exit=exit_,
            scan_heading=heading,
            scan_distance=distance,
            direction_flips_geometry=True,
            is_auto=is_auto,
            current_reversed=current_reversed,
        )

    # horizontal_range / vertical_profile use the helper that computes the arc
    # or line endpoints. for vertical_profile this still yields a valid pair of
    # points, but direction_reversed does not swap them - the flag falls into
    # direction_flips_geometry=False.
    if method in (InspectionMethod.HORIZONTAL_RANGE, InspectionMethod.VERTICAL_PROFILE):
        positions = get_lha_positions(template, lha_ids)
        if not positions:
            return None
        center = Point3D.center(positions)
        rwy_heading = get_runway_heading(template, surfaces)
        try:
            start = determine_start_position(center, config, method, rwy_heading, 3.0)
            end = determine_end_position(center, config, method, rwy_heading, 3.0)
        except ValueError:
            return None

        heading = bearing_between(start.lon, start.lat, end.lon, end.lat)
        distance = distance_between(start.lon, start.lat, end.lon, end.lat)

        flips = method == InspectionMethod.HORIZONTAL_RANGE
        return _Segment(
            inspection_id=inspection.id,
            sequence_order=inspection.sequence_order,
            entry=start,
            exit=end,
            scan_heading=heading,
            scan_distance=distance,
            direction_flips_geometry=flips,
            is_auto=is_auto,
            current_reversed=current_reversed,
        )

    # hover_point_lock / meht_check collapse to a single point - treat entry
    # and exit as identical and mark geometry as non-flipping.
    if method in non_flipping:
        positions = get_lha_positions(template, lha_ids)
        if not positions and lha_ids:
            positions = get_lha_positions_from_surfaces(surfaces, lha_ids)
        if not positions:
            return None
        point = Point3D.center(positions)
        return _Segment(
            inspection_id=inspection.id,
            sequence_order=inspection.sequence_order,
            entry=point,
            exit=point,
            scan_heading=0.0,
            scan_distance=0.0,
            direction_flips_geometry=False,
            is_auto=is_auto,
            current_reversed=current_reversed,
        )

    return None


def _effective_endpoints(seg: _Segment, reversed_: bool) -> tuple[Point3D, Point3D, float]:
    """return (effective_entry, effective_exit, effective_heading) given a direction choice."""
    if not seg.direction_flips_geometry or not reversed_:
        return seg.entry, seg.exit, seg.scan_heading
    flipped_heading = (seg.scan_heading + 180.0) % 360.0
    return seg.exit, seg.entry, flipped_heading


def _score_assignment(
    segments: list[_Segment],
    choices: list[bool],
) -> tuple[float, float]:
    """sum transit distances + scan distances and total heading turn for a chosen assignment.

    returns (total_distance_m, total_turn_deg).
    """
    total_dist = 0.0
    total_turn = 0.0
    prev_exit: Point3D | None = None
    prev_heading: float | None = None
    for seg, rev in zip(segments, choices):
        entry, exit_, heading = _effective_endpoints(seg, rev)
        if prev_exit is not None:
            total_dist += distance_between(prev_exit.lon, prev_exit.lat, entry.lon, entry.lat)
            if prev_heading is not None and seg.scan_distance > 0:
                # heading change when entering a new scan pass, approximated by
                # the bearing from prev exit to new entry compared against the
                # next scan heading.
                approach_heading = bearing_between(
                    prev_exit.lon, prev_exit.lat, entry.lon, entry.lat
                )
                total_turn += _heading_delta(prev_heading, approach_heading)
                total_turn += _heading_delta(approach_heading, heading)
        total_dist += seg.scan_distance
        prev_exit = exit_
        prev_heading = heading

    return total_dist, total_turn


def _enumerate(
    segments: list[_Segment],
    auto_indices: list[int],
) -> tuple[list[bool], float, float]:
    """brute-force search best direction assignment over auto indices.

    pinned indices keep their current_reversed. returns (best_choices, best_dist,
    best_turn).
    """
    k = len(auto_indices)
    base = [seg.current_reversed for seg in segments]

    if k == 0:
        dist, turn = _score_assignment(segments, base)
        return base, dist, turn

    best_choices = list(base)
    best_dist, best_turn = _score_assignment(segments, best_choices)
    best_cost = best_dist + TURN_PENALTY_WEIGHT * best_turn

    for mask in range(1, 1 << k):
        choices = list(base)
        for bit, seg_idx in enumerate(auto_indices):
            choices[seg_idx] = bool((mask >> bit) & 1)
        dist, turn = _score_assignment(segments, choices)
        cost = dist + TURN_PENALTY_WEIGHT * turn
        if cost < best_cost - 1e-9:
            best_cost = cost
            best_dist = dist
            best_turn = turn
            best_choices = choices

    return best_choices, best_dist, best_turn


def solve_headings(
    inspections: Iterable[Inspection],
    surfaces: list[AirfieldSurface],
) -> HeadingSolution:
    """pure solver: build segments, brute-force over unpinned, return solution + metrics.

    baseline for comparison = every auto inspection direction_reversed=False.
    """
    ordered = sorted(inspections, key=lambda i: i.sequence_order)

    segments: list[_Segment] = []
    skipped: list[Inspection] = []
    for insp in ordered:
        seg = _build_segment(insp, surfaces)
        if seg is None:
            skipped.append(insp)
            continue
        segments.append(seg)

    # only flip-capable auto segments participate
    auto_indices = [
        i for i, seg in enumerate(segments) if seg.is_auto and seg.direction_flips_geometry
    ]
    if len(auto_indices) > MAX_AUTO_INSPECTIONS:
        raise DomainError(
            f"auto-heading solver supports up to {MAX_AUTO_INSPECTIONS} unpinned inspections "
            f"(got {len(auto_indices)})",
            status_code=422,
        )

    best_choices, best_dist, best_turn = _enumerate(segments, auto_indices)

    # baseline: auto-inspections fall back to direction_reversed=False
    baseline_choices = [
        False if (seg.is_auto and seg.direction_flips_geometry) else seg.current_reversed
        for seg in segments
    ]
    baseline_dist, baseline_turn = _score_assignment(segments, baseline_choices)

    assignments: list[HeadingAssignment] = []
    for seg, reversed_ in zip(segments, best_choices):
        assignments.append(
            HeadingAssignment(
                inspection_id=seg.inspection_id,
                sequence_order=seg.sequence_order,
                direction_reversed=reversed_,
                is_auto=seg.is_auto,
            )
        )
    for insp in skipped:
        # surface skipped inspections in the response so callers know they
        # were not considered
        cfg_rev = bool(getattr(insp.config, "direction_reversed", False)) if insp.config else False
        cfg_auto = bool(getattr(insp.config, "direction_is_auto", False)) if insp.config else False
        assignments.append(
            HeadingAssignment(
                inspection_id=insp.id,
                sequence_order=insp.sequence_order,
                direction_reversed=cfg_rev,
                is_auto=cfg_auto,
            )
        )

    assignments.sort(key=lambda a: a.sequence_order)

    improvement_pct = 0.0
    if baseline_dist > 0:
        improvement_pct = max(0.0, (baseline_dist - best_dist) / baseline_dist * 100.0)

    pinned_count = sum(1 for seg in segments if not (seg.is_auto and seg.direction_flips_geometry))

    return HeadingSolution(
        assignments=assignments,
        total_distance_m=round(best_dist, 2),
        total_turn_deg=round(best_turn, 2),
        baseline_distance_m=round(baseline_dist, 2),
        baseline_turn_deg=round(baseline_turn, 2),
        improvement_pct=round(improvement_pct, 2),
        auto_inspection_count=len(auto_indices),
        pinned_inspection_count=pinned_count,
    )


def _load_mission(db: Session, mission_id: UUID) -> tuple[Mission, list[AirfieldSurface]]:
    """load mission with inspections and airport surfaces eager."""
    mission = (
        db.query(Mission)
        .options(
            joinedload(Mission.flight_plan),
            joinedload(Mission.inspections)
            .joinedload(Inspection.template)
            .joinedload(InspectionTemplate.default_config),
            joinedload(Mission.inspections).joinedload(Inspection.config),
            joinedload(Mission.inspections)
            .joinedload(Inspection.template)
            .joinedload(InspectionTemplate.targets)
            .joinedload(AGL.lhas),
        )
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise NotFoundError("mission not found")

    airport = db.query(Airport).filter(Airport.id == mission.airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    surfaces = (
        db.query(AirfieldSurface)
        .options(joinedload(AirfieldSurface.agls).joinedload(AGL.lhas))
        .filter(AirfieldSurface.airport_id == airport.id)
        .all()
    )
    return mission, surfaces


def solve_and_persist(db: Session, mission_id: UUID) -> HeadingAutoResponse:
    """resolve auto headings, persist direction_reversed on auto inspections, and regress mission.

    writes the solver's choice into each direction_is_auto inspection's config.
    calls mission.invalidate_trajectory() and deletes the flight plan, since the
    heading resolution is a trajectory-affecting change.
    """
    mission, surfaces = _load_mission(db, mission_id)
    if not mission.inspections:
        raise DomainError("mission has no inspections to optimize", status_code=422)

    solution = solve_headings(mission.inspections, surfaces)

    # persist resolved direction_reversed on every auto inspection
    changed = False
    for insp in mission.inspections:
        assignment = next((a for a in solution.assignments if a.inspection_id == insp.id), None)
        if assignment is None or not assignment.is_auto:
            continue
        if insp.config is None:
            insp.config = InspectionConfiguration(
                direction_reversed=assignment.direction_reversed,
                direction_is_auto=True,
            )
            db.add(insp.config)
            db.flush()
            insp.config_id = insp.config.id
            changed = True
            continue
        if bool(insp.config.direction_reversed) != assignment.direction_reversed:
            insp.config.direction_reversed = assignment.direction_reversed
            changed = True

    if changed:
        delete_flight_plan_if_exists(db, mission)
        try:
            mission.invalidate_trajectory()
        except ValueError as e:
            raise DomainError(str(e), status_code=409)

    db.commit()

    return HeadingAutoResponse(
        mission_id=mission.id,
        assignments=solution.assignments,
        total_distance_m=solution.total_distance_m,
        total_turn_deg=solution.total_turn_deg,
        baseline_distance_m=solution.baseline_distance_m,
        baseline_turn_deg=solution.baseline_turn_deg,
        improvement_pct=solution.improvement_pct,
        auto_inspection_count=solution.auto_inspection_count,
        pinned_inspection_count=solution.pinned_inspection_count,
    )
