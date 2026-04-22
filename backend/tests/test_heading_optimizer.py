"""unit tests for the auto-heading optimizer.

tests use lightweight test doubles for Inspection / Template / AGL / LHA so
the solver can be exercised without standing up a full postgis mission.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.models.enums import InspectionMethod
from app.services import heading_optimizer
from app.services.heading_optimizer import (
    MAX_AUTO_INSPECTIONS,
    _effective_endpoints,
    _heading_delta,
    _score_assignment,
    _Segment,
    solve_headings,
)
from app.services.trajectory.types import Point3D


@dataclass
class _FakeLHA:
    """minimal lha stand-in exposing only the fields the optimizer reads."""

    id: UUID
    position_coords: tuple[float, float, float]
    unit_designator: str | None = None
    setting_angle: float | None = None

    @property
    def position(self):
        """return a ewkb-shaped namespace matching what parse_ewkb expects."""
        return SimpleNamespace(data=_make_ewkb_point(self.position_coords))


@dataclass
class _FakeAGL:
    """minimal agl with an ordered list of lhas."""

    id: UUID
    surface_id: UUID
    lhas: list[_FakeLHA]
    agl_type: str = "PAPI"
    glide_slope_angle: float | None = None
    distance_from_threshold: float | None = None


@dataclass
class _FakeTemplate:
    """minimal template with targets and a name."""

    name: str = "T"
    default_config: object | None = None
    targets: list[_FakeAGL] = field(default_factory=list)


@dataclass
class _FakeConfig:
    """minimal InspectionConfiguration-like object.

    mirrors fields the optimizer touches via resolve_with_defaults/overlay_config.
    """

    direction_reversed: bool = False
    direction_is_auto: bool = False
    altitude_offset: float | None = None
    lha_ids: list | None = None
    selected_lha_id: UUID | None = None
    measurement_density: int = 8
    capture_mode: str = "PHOTO_CAPTURE"
    # null-valued fields that ResolvedConfig allows
    angle_offset: float | None = None
    measurement_speed_override: float | None = None
    custom_tolerances: dict | None = None
    hover_duration: float | None = None
    horizontal_distance: float | None = None
    sweep_angle: float | None = None
    vertical_profile_height: float | None = None
    recording_setup_duration: float | None = None
    buffer_distance: float | None = None
    height_above_lights: float | None = None
    lateral_offset: float | None = None
    distance_from_lha: float | None = None
    height_above_lha: float | None = None
    camera_gimbal_angle: float | None = None
    lha_setting_angle_override_id: UUID | None = None
    hover_bearing: float | None = None
    hover_bearing_reference: str | None = None
    white_balance: str | None = None
    iso: int | None = None
    shutter_speed: str | None = None
    focus_mode: str | None = None
    optical_zoom: float | None = None

    def resolve_with_defaults(self, template_config):
        """mirror InspectionConfiguration.resolve_with_defaults for test doubles."""
        from app.models.inspection import InspectionConfiguration

        merged = {}
        for key in InspectionConfiguration._MERGE_FIELDS:
            template_val = getattr(template_config, key, None) if template_config else None
            override_val = getattr(self, key, None)
            merged[key] = override_val if override_val is not None else template_val
        return merged


@dataclass
class _FakeInspection:
    """minimal Inspection-like object that the optimizer reads."""

    id: UUID
    template: _FakeTemplate
    method: str
    sequence_order: int
    config: _FakeConfig | None

    @property
    def lha_ids(self):
        """mirror the ORM lha_ids property."""
        if self.config and self.config.lha_ids:
            return list(self.config.lha_ids)
        if self.config and self.config.selected_lha_id:
            return [self.config.selected_lha_id]
        return None


def _make_ewkb_point(coords: tuple[float, float, float]) -> bytes:
    """build a WKB POINT Z little-endian for the given (lon, lat, alt) tuple.

    kept minimal - mirrors the format parse_ewkb consumes in tests.
    """
    import struct

    lon, lat, alt = coords
    # byte order little-endian (01), type POINTZ (0x80000001 | srid flag not needed)
    return struct.pack("<BI3d", 1, 0x80000001, lon, lat, alt)


def _row(start_lon: float, start_lat: float, n: int, spacing_m: float = 10.0) -> list[_FakeLHA]:
    """build n LHAs spaced eastward from a start point."""
    from app.utils.geo import point_at_distance

    lhas = []
    for i in range(n):
        if i == 0:
            lon, lat = start_lon, start_lat
        else:
            lon, lat = point_at_distance(start_lon, start_lat, 90.0, spacing_m * i)
        lhas.append(_FakeLHA(id=uuid4(), position_coords=(lon, lat, 380.0)))
    return lhas


def _fly_over(
    seq: int,
    lhas: list[_FakeLHA],
    is_auto: bool,
    direction_reversed: bool = False,
) -> _FakeInspection:
    """construct a fly-over inspection over the given LHA row."""
    surface_id = uuid4()
    agl = _FakeAGL(id=uuid4(), surface_id=surface_id, lhas=lhas, agl_type="CENTERLINE")
    template = _FakeTemplate(targets=[agl])
    cfg = _FakeConfig(
        direction_reversed=direction_reversed,
        direction_is_auto=is_auto,
        lha_ids=[lha.id for lha in lhas],
    )
    return _FakeInspection(
        id=uuid4(),
        template=template,
        method=InspectionMethod.FLY_OVER.value,
        sequence_order=seq,
        config=cfg,
    )


# solver math


class TestHeadingDelta:
    """absolute heading change wraps correctly into [0, 180]."""

    def test_zero(self):
        """same heading yields zero delta."""
        assert _heading_delta(42.0, 42.0) == pytest.approx(0.0)

    def test_small(self):
        """45 vs 90 = 45."""
        assert _heading_delta(45.0, 90.0) == pytest.approx(45.0)

    def test_wraps(self):
        """10 vs 350 wraps to 20, not 340."""
        assert _heading_delta(10.0, 350.0) == pytest.approx(20.0)

    def test_opposite(self):
        """opposite headings are 180 apart."""
        assert _heading_delta(0.0, 180.0) == pytest.approx(180.0)


class TestEffectiveEndpoints:
    """reversing a flip-capable segment swaps entry/exit and rotates heading 180."""

    def test_non_flipping_segment_never_flips(self):
        """hover-like segments ignore the reversed flag."""
        a = Point3D(lon=0.0, lat=0.0, alt=0.0)
        b = Point3D(lon=1.0, lat=0.0, alt=0.0)
        seg = _Segment(
            inspection_id=uuid4(),
            sequence_order=1,
            entry=a,
            exit=b,
            scan_heading=90.0,
            scan_distance=0.0,
            direction_flips_geometry=False,
            is_auto=True,
            current_reversed=False,
        )
        entry, exit_, heading = _effective_endpoints(seg, reversed_=True)
        assert (entry, exit_, heading) == (a, b, 90.0)

    def test_flipping_segment_swaps(self):
        """flip-capable segments swap entry/exit and rotate heading by 180."""
        a = Point3D(lon=0.0, lat=0.0, alt=0.0)
        b = Point3D(lon=1.0, lat=0.0, alt=0.0)
        seg = _Segment(
            inspection_id=uuid4(),
            sequence_order=1,
            entry=a,
            exit=b,
            scan_heading=90.0,
            scan_distance=10.0,
            direction_flips_geometry=True,
            is_auto=True,
            current_reversed=False,
        )
        entry, exit_, heading = _effective_endpoints(seg, reversed_=True)
        assert entry == b
        assert exit_ == a
        assert heading == pytest.approx(270.0)


class TestScoreAssignment:
    """scoring accumulates transit + scan distances across ordered segments."""

    def test_two_segments_transit_plus_scans(self):
        """sum = transit(exit0 -> entry1) + scan0 + scan1."""
        from app.utils.geo import distance_between

        p0 = Point3D(lon=0.0, lat=0.0, alt=0.0)
        p1 = Point3D(lon=0.001, lat=0.0, alt=0.0)
        p2 = Point3D(lon=0.01, lat=0.0, alt=0.0)
        p3 = Point3D(lon=0.011, lat=0.0, alt=0.0)
        seg0 = _Segment(
            inspection_id=uuid4(),
            sequence_order=1,
            entry=p0,
            exit=p1,
            scan_heading=90.0,
            scan_distance=distance_between(p0.lon, p0.lat, p1.lon, p1.lat),
            direction_flips_geometry=True,
            is_auto=True,
            current_reversed=False,
        )
        seg1 = _Segment(
            inspection_id=uuid4(),
            sequence_order=2,
            entry=p2,
            exit=p3,
            scan_heading=90.0,
            scan_distance=distance_between(p2.lon, p2.lat, p3.lon, p3.lat),
            direction_flips_geometry=True,
            is_auto=True,
            current_reversed=False,
        )
        dist, turn = _score_assignment([seg0, seg1], [False, False])
        expected_transit = distance_between(p1.lon, p1.lat, p2.lon, p2.lat)
        expected_total = expected_transit + seg0.scan_distance + seg1.scan_distance
        assert dist == pytest.approx(expected_total)
        # no prior segment for seg0, prev_heading set after - but seg0 has
        # scan_distance > 0, so transition into seg1 accumulates turn > 0
        # when the second segment's approach-heading differs from the first's
        # scan heading. for collinear rows heading difference is ~0.
        assert turn == pytest.approx(0.0, abs=1e-3)


# end-to-end solver tests over the public surface


class TestSolveHeadings:
    """solver picks direction that minimizes total transit."""

    def test_two_offset_rows_reverse_beats_natural(self):
        """two parallel rows: reversed second row shortens the transit."""
        # row A sits at (0, 0) pointing east.
        # row B sits offset north of A's END, also pointing east.
        # natural choice: traverse A east, jump back west to start of B - long transit.
        # reversed choice for B (traverse west->east for reversed): would start
        # near A's end and shorten transit.
        # easiest: make B's LHAs laid out east but at a location that forces a
        # long natural jump. We build B so its first LHA is far from A's exit
        # and its last LHA is near A's exit -> reversing B wins.
        from app.utils.geo import point_at_distance

        # row A: eastward 4 LHAs at 10m spacing, starting at (0, 0).
        row_a = _row(0.0, 0.0, 4, spacing_m=10.0)

        # row B: eastward 4 LHAs, but starting 500m EAST of row A's exit.
        # so row A exit = a[-1]; row B first = 500m east of a[-1].
        # reversed row B: drone would arrive near a[-1] and walk east.
        # but that's still far - we want row B's first LHA to sit FAR from
        # a[-1], and row B's last LHA NEAR a[-1]. a[-1] is ~30m east of origin.
        # place row B's first LHA 500m WEST of origin, last LHA 60m WEST.
        # spacing row B eastward means row B's LHAs go from -500m to -500m+3*10 = -470m.
        # no - we want last LHA near a[-1]. Put row B first LHA at +500m east of
        # a[-1], running eastward. Then reversed B lands near +500m from a[-1].
        # still long. Instead flip direction:
        # place row B first LHA FAR east, last LHA near a[-1]. To keep eastward
        # order with last LHA near a[-1], reverse coords manually - build row B
        # spacing in the eastward direction but starting from +30m (a[-1]) and
        # spacing going WEST, then reverse the list so first is far LHA.
        # simpler: build list start = 500m east of a[-1], spacing eastward; then
        # reverse the list; yields first=far, last=near.
        a_exit_lon, a_exit_lat, _ = row_a[-1].position_coords
        start_lon, start_lat = point_at_distance(a_exit_lon, a_exit_lat, 90.0, 30.0)
        row_b = _row(start_lon, start_lat, 4, spacing_m=10.0)
        row_b = list(reversed(row_b))

        # two fly-over inspections: B is auto, A is pinned natural
        insp_a = _fly_over(1, row_a, is_auto=False, direction_reversed=False)
        insp_b = _fly_over(2, row_b, is_auto=True, direction_reversed=False)

        sol = solve_headings([insp_a, insp_b], surfaces=[])
        assert sol.auto_inspection_count == 1
        assignments = {a.sequence_order: a for a in sol.assignments}
        # the solver should reverse B because B's natural first LHA is far from
        # A's exit and B's natural last LHA is near A's exit.
        assert assignments[2].direction_reversed is True
        # baseline (all natural) should be strictly worse
        assert sol.baseline_distance_m > sol.total_distance_m
        assert sol.improvement_pct > 0.0

    def test_deterministic_same_input_same_output(self):
        """solver output is deterministic for a fixed input."""
        row_a = _row(0.0, 0.0, 4)
        insp_a = _fly_over(1, row_a, is_auto=True)
        first = solve_headings([insp_a], surfaces=[])
        second = solve_headings([insp_a], surfaces=[])
        assert first.assignments[0].direction_reversed == second.assignments[0].direction_reversed
        assert first.total_distance_m == pytest.approx(second.total_distance_m)

    def test_pinned_inspection_keeps_current_reversed(self):
        """pinned (is_auto=False) inspections stay at their configured reversed value."""
        row = _row(0.0, 0.0, 3)
        # pinned reversed=True - solver must not touch it
        insp = _fly_over(1, row, is_auto=False, direction_reversed=True)
        sol = solve_headings([insp], surfaces=[])
        assignments = {a.sequence_order: a for a in sol.assignments}
        assert assignments[1].direction_reversed is True
        assert assignments[1].is_auto is False

    def test_no_auto_inspections_returns_zero_auto_count(self):
        """solver runs with zero auto inspections (still returns metrics)."""
        row = _row(0.0, 0.0, 3)
        insp = _fly_over(1, row, is_auto=False)
        sol = solve_headings([insp], surfaces=[])
        assert sol.auto_inspection_count == 0
        assert sol.pinned_inspection_count == 1

    def test_over_cap_raises(self):
        """brute-force cap is enforced via DomainError (422)."""
        from app.core.exceptions import DomainError

        inspections = []
        for i in range(MAX_AUTO_INSPECTIONS + 1):
            row = _row(float(i) * 0.01, 0.0, 3)
            inspections.append(_fly_over(i + 1, row, is_auto=True))

        with pytest.raises(DomainError):
            solve_headings(inspections, surfaces=[])


class TestHeadingOptimizerModuleSurface:
    """MAX_AUTO_INSPECTIONS and public symbols stay stable."""

    def test_cap_is_ten(self):
        """brute-force cap matches documented 2^10."""
        assert heading_optimizer.MAX_AUTO_INSPECTIONS == 10

    def test_solve_and_persist_exported(self):
        """solve_and_persist is exposed for the route layer."""
        assert hasattr(heading_optimizer, "solve_and_persist")


# integration tests - exercise solve_and_persist through the route against real postgis


@pytest.fixture
def auto_headings_airport(client):
    """create a unique airport per test for the auto-headings integration tests."""
    import random
    import string

    # 4-char alpha ICAO codes - random alpha suffix keeps each test isolated
    suffix = "".join(random.choices(string.ascii_uppercase, k=2))
    icao = f"LK{suffix}"
    payload = {
        "icao_code": icao,
        "name": f"Auto Headings Test {suffix}",
        "elevation": 300.0,
        "location": {"type": "Point", "coordinates": [15.0, 50.0, 300.0]},
    }
    r = client.post("/api/v1/airports", json=payload)
    assert r.status_code == 201
    return r.json()["id"]


def _make_mission_with_inspection(
    client,
    airport_id: str,
    config: dict | None,
) -> tuple[str, str]:
    """create a mission + one HORIZONTAL_RANGE inspection. returns (mission_id, inspection_id)."""
    template = client.post(
        "/api/v1/inspection-templates",
        json={"name": "Auto Headings Template", "methods": ["HORIZONTAL_RANGE"]},
    ).json()

    mission = client.post(
        "/api/v1/missions",
        json={"name": "Auto Headings Mission", "airport_id": airport_id},
    ).json()

    body = {"template_id": template["id"], "method": "HORIZONTAL_RANGE"}
    if config is not None:
        body["config"] = config
    insp = client.post(
        f"/api/v1/missions/{mission['id']}/inspections",
        json=body,
    ).json()
    return mission["id"], insp["id"]


class TestSolveAndPersistIntegration:
    """round-trip POST /headings/auto through FastAPI + postgis."""

    def test_persists_new_config_when_inspection_has_none(
        self, client, auto_headings_airport, monkeypatch
    ):
        """inspection with no config gets a new InspectionConfiguration written."""
        from app.schemas.mission import HeadingAssignment
        from app.services import heading_optimizer as opt

        mission_id, inspection_id = _make_mission_with_inspection(
            client, auto_headings_airport, config=None
        )

        # stub the pure solver - return an auto assignment requesting reversed=True
        def fake_solve(inspections, surfaces):
            """deterministic solution: the single inspection is auto + reversed."""
            assignments = [
                HeadingAssignment(
                    inspection_id=insp.id,
                    sequence_order=insp.sequence_order,
                    direction_reversed=True,
                    is_auto=True,
                )
                for insp in inspections
            ]
            return opt.HeadingSolution(
                assignments=assignments,
                total_distance_m=100.0,
                total_turn_deg=0.0,
                baseline_distance_m=200.0,
                baseline_turn_deg=0.0,
                improvement_pct=50.0,
                auto_inspection_count=1,
                pinned_inspection_count=0,
            )

        monkeypatch.setattr(opt, "solve_headings", fake_solve)

        r = client.post(f"/api/v1/missions/{mission_id}/headings/auto")
        assert r.status_code == 200
        body = r.json()
        assert body["auto_inspection_count"] == 1
        assert body["improvement_pct"] == 50.0

        # verify the config now exists and was written with direction_reversed=True
        detail = client.get(f"/api/v1/missions/{mission_id}").json()
        insp_cfg = detail["inspections"][0].get("config")
        assert insp_cfg is not None
        assert insp_cfg["direction_reversed"] is True
        assert insp_cfg["direction_is_auto"] is True

    def test_regresses_mission_and_deletes_flight_plan(
        self, client, auto_headings_airport, db_engine, monkeypatch
    ):
        """persisting a new direction invalidates trajectory and removes flight plan."""
        from sqlalchemy.orm import sessionmaker

        from app.models.flight_plan import FlightPlan
        from app.models.mission import Mission, MissionStatus
        from app.schemas.mission import HeadingAssignment
        from app.services import heading_optimizer as opt

        mission_id, inspection_id = _make_mission_with_inspection(
            client,
            auto_headings_airport,
            config={"direction_is_auto": True, "direction_reversed": False},
        )

        # seed mission into PLANNED with a flight plan so we can observe regression
        Session = sessionmaker(bind=db_engine)
        session = Session()
        try:
            mission = session.query(Mission).filter(Mission.id == mission_id).first()
            mission.status = MissionStatus.PLANNED
            flight_plan = FlightPlan(
                mission_id=mission.id,
                airport_id=mission.airport_id,
                total_distance=1000.0,
                estimated_duration=300.0,
            )
            session.add(flight_plan)
            session.commit()
            flight_plan_id = flight_plan.id
        finally:
            session.close()

        # stub the solver to request a direction_reversed flip
        def fake_solve(inspections, surfaces):
            """return a solution that flips direction_reversed for the lone inspection."""
            assignments = [
                HeadingAssignment(
                    inspection_id=insp.id,
                    sequence_order=insp.sequence_order,
                    direction_reversed=True,
                    is_auto=True,
                )
                for insp in inspections
            ]
            return opt.HeadingSolution(
                assignments=assignments,
                total_distance_m=90.0,
                total_turn_deg=0.0,
                baseline_distance_m=180.0,
                baseline_turn_deg=0.0,
                improvement_pct=50.0,
                auto_inspection_count=1,
                pinned_inspection_count=0,
            )

        monkeypatch.setattr(opt, "solve_headings", fake_solve)

        r = client.post(f"/api/v1/missions/{mission_id}/headings/auto")
        assert r.status_code == 200

        # mission regressed from PLANNED -> DRAFT, flight plan is gone
        session = Session()
        try:
            refreshed = session.query(Mission).filter(Mission.id == mission_id).first()
            assert refreshed.status == MissionStatus.DRAFT
            assert refreshed.flight_plan is None
            assert session.query(FlightPlan).filter(FlightPlan.id == flight_plan_id).first() is None
        finally:
            session.close()

    def test_no_change_leaves_mission_status_alone(
        self, client, auto_headings_airport, db_engine, monkeypatch
    ):
        """when the solver picks the already-configured direction, no regression happens."""
        from sqlalchemy.orm import sessionmaker

        from app.models.mission import Mission, MissionStatus
        from app.schemas.mission import HeadingAssignment
        from app.services import heading_optimizer as opt

        mission_id, inspection_id = _make_mission_with_inspection(
            client,
            auto_headings_airport,
            config={"direction_is_auto": True, "direction_reversed": False},
        )

        Session = sessionmaker(bind=db_engine)
        session = Session()
        try:
            mission = session.query(Mission).filter(Mission.id == mission_id).first()
            mission.status = MissionStatus.PLANNED
            session.commit()
        finally:
            session.close()

        # stub the solver to return the same direction_reversed already configured
        def fake_solve_noop(inspections, surfaces):
            """return a solution matching the current (False) direction_reversed."""
            assignments = [
                HeadingAssignment(
                    inspection_id=insp.id,
                    sequence_order=insp.sequence_order,
                    direction_reversed=False,
                    is_auto=True,
                )
                for insp in inspections
            ]
            return opt.HeadingSolution(
                assignments=assignments,
                total_distance_m=0.0,
                total_turn_deg=0.0,
                baseline_distance_m=0.0,
                baseline_turn_deg=0.0,
                improvement_pct=0.0,
                auto_inspection_count=1,
                pinned_inspection_count=0,
            )

        monkeypatch.setattr(opt, "solve_headings", fake_solve_noop)

        r = client.post(f"/api/v1/missions/{mission_id}/headings/auto")
        assert r.status_code == 200

        session = Session()
        try:
            refreshed = session.query(Mission).filter(Mission.id == mission_id).first()
            assert refreshed.status == MissionStatus.PLANNED
        finally:
            session.close()

    def test_audit_log_entry_written(self, client, auto_headings_airport, db_engine, monkeypatch):
        """route emits an audit log entry for the auto-resolve action."""
        from sqlalchemy.orm import sessionmaker

        from app.models.audit_log import AuditLog
        from app.schemas.mission import HeadingAssignment
        from app.services import heading_optimizer as opt

        mission_id, inspection_id = _make_mission_with_inspection(
            client,
            auto_headings_airport,
            config={"direction_is_auto": True},
        )

        def fake_solve(inspections, surfaces):
            """return a trivial solution so the persist path completes."""
            assignments = [
                HeadingAssignment(
                    inspection_id=insp.id,
                    sequence_order=insp.sequence_order,
                    direction_reversed=False,
                    is_auto=True,
                )
                for insp in inspections
            ]
            return opt.HeadingSolution(
                assignments=assignments,
                total_distance_m=0.0,
                total_turn_deg=0.0,
                baseline_distance_m=0.0,
                baseline_turn_deg=0.0,
                improvement_pct=0.0,
                auto_inspection_count=1,
                pinned_inspection_count=0,
            )

        monkeypatch.setattr(opt, "solve_headings", fake_solve)

        r = client.post(f"/api/v1/missions/{mission_id}/headings/auto")
        assert r.status_code == 200

        Session = sessionmaker(bind=db_engine)
        session = Session()
        try:
            entries = (
                session.query(AuditLog)
                .filter(AuditLog.entity_id == UUID(mission_id))
                .filter(AuditLog.action == "UPDATE")
                .all()
            )
            matched = [
                e
                for e in entries
                if e.details and e.details.get("action") == "auto_resolve_headings"
            ]
            assert matched, "expected an auto_resolve_headings audit entry"
            assert matched[-1].details.get("auto_inspection_count") == 1
        finally:
            session.close()
