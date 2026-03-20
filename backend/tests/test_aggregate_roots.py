from dataclasses import dataclass
from uuid import uuid4

import pytest

from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.flight_plan import FlightPlan
from app.models.inspection import Inspection, InspectionConfiguration
from app.models.mission import Mission

# mission aggregate root tests


class TestMissionTransitions:
    """tests for Mission.transition_to state machine."""

    def _make_mission(self, status="DRAFT"):
        """create a mission with given status."""
        m = Mission(id=uuid4(), name="test", status=status, airport_id=uuid4())
        m.inspections = []
        return m

    def test_draft_to_planned(self):
        """valid transition DRAFT -> PLANNED."""
        m = self._make_mission("DRAFT")
        m.transition_to("PLANNED")
        assert m.status == "PLANNED"

    def test_planned_to_validated(self):
        """valid transition PLANNED -> VALIDATED."""
        m = self._make_mission("PLANNED")
        m.transition_to("VALIDATED")
        assert m.status == "VALIDATED"

    def test_validated_to_exported(self):
        """valid transition VALIDATED -> EXPORTED."""
        m = self._make_mission("VALIDATED")
        m.transition_to("EXPORTED")
        assert m.status == "EXPORTED"

    def test_exported_to_completed(self):
        """valid transition EXPORTED -> COMPLETED."""
        m = self._make_mission("EXPORTED")
        m.transition_to("COMPLETED")
        assert m.status == "COMPLETED"

    def test_exported_to_cancelled(self):
        """valid transition EXPORTED -> CANCELLED."""
        m = self._make_mission("EXPORTED")
        m.transition_to("CANCELLED")
        assert m.status == "CANCELLED"

    def test_invalid_draft_to_validated(self):
        """invalid transition DRAFT -> VALIDATED raises ValueError."""
        m = self._make_mission("DRAFT")
        with pytest.raises(ValueError, match="cannot transition"):
            m.transition_to("VALIDATED")

    def test_invalid_completed_to_any(self):
        """COMPLETED is terminal - no transitions allowed."""
        m = self._make_mission("COMPLETED")
        with pytest.raises(ValueError, match="cannot transition"):
            m.transition_to("DRAFT")

    def test_invalid_cancelled_to_any(self):
        """CANCELLED is terminal - no transitions allowed."""
        m = self._make_mission("CANCELLED")
        with pytest.raises(ValueError, match="cannot transition"):
            m.transition_to("DRAFT")

    def test_invalid_backwards(self):
        """cannot go backwards PLANNED -> DRAFT."""
        m = self._make_mission("PLANNED")
        with pytest.raises(ValueError, match="cannot transition"):
            m.transition_to("DRAFT")


class TestMissionInvalidateTrajectory:
    """tests for Mission.invalidate_trajectory."""

    def _make_mission(self, status="DRAFT"):
        """create a mission with given status."""
        m = Mission(id=uuid4(), name="test", status=status, airport_id=uuid4())
        m.inspections = []
        m.flight_plan = None
        return m

    def test_validated_regresses_to_draft(self):
        """VALIDATED regresses to DRAFT."""
        m = self._make_mission("VALIDATED")
        m.invalidate_trajectory()
        assert m.status == "DRAFT"

    def test_planned_regresses_to_draft(self):
        """PLANNED regresses to DRAFT."""
        m = self._make_mission("PLANNED")
        m.invalidate_trajectory()
        assert m.status == "DRAFT"

    def test_draft_stays_draft(self):
        """DRAFT stays DRAFT (no-op)."""
        m = self._make_mission("DRAFT")
        m.invalidate_trajectory()
        assert m.status == "DRAFT"

    def test_exported_raises(self):
        """EXPORTED rejects modification."""
        m = self._make_mission("EXPORTED")
        with pytest.raises(ValueError, match="cannot modify"):
            m.invalidate_trajectory()

    def test_completed_raises(self):
        """COMPLETED rejects modification."""
        m = self._make_mission("COMPLETED")
        with pytest.raises(ValueError, match="cannot modify"):
            m.invalidate_trajectory()

    def test_cancelled_raises(self):
        """CANCELLED rejects modification."""
        m = self._make_mission("CANCELLED")
        with pytest.raises(ValueError, match="cannot modify"):
            m.invalidate_trajectory()


class TestMissionInspections:
    """tests for Mission.add_inspection and remove_inspection."""

    def _make_mission(self, status="DRAFT", inspections=None):
        """create a mission with given status and inspections."""
        m = Mission(id=uuid4(), name="test", status=status, airport_id=uuid4())
        m.inspections = inspections or []
        return m

    def _make_inspection(self):
        """create a minimal inspection."""
        return Inspection(
            id=uuid4(),
            template_id=uuid4(),
            method="VERTICAL_PROFILE",
            sequence_order=1,
        )

    def test_add_inspection_draft(self):
        """can add inspection in DRAFT status."""
        m = self._make_mission()
        insp = self._make_inspection()
        m.add_inspection(insp)
        assert len(m.inspections) == 1
        assert insp.mission_id == m.id

    def test_add_inspection_planned_regresses_to_draft(self):
        """adding inspection in PLANNED status auto-regresses to DRAFT."""
        m = self._make_mission("PLANNED")
        insp = self._make_inspection()
        m.add_inspection(insp)
        assert len(m.inspections) == 1
        assert m.status == "DRAFT"

    def test_add_inspection_validated_regresses_to_draft(self):
        """adding inspection in VALIDATED status auto-regresses to DRAFT."""
        m = self._make_mission("VALIDATED")
        insp = self._make_inspection()
        m.add_inspection(insp)
        assert m.status == "DRAFT"

    def test_add_inspection_blocked_after_exported(self):
        """cannot add inspection after mission is exported."""
        m = self._make_mission("EXPORTED")
        insp = self._make_inspection()
        with pytest.raises(ValueError, match="cannot modify"):
            m.add_inspection(insp)

    def test_add_inspection_max_limit(self):
        """cannot exceed max 10 inspections."""
        existing = [self._make_inspection() for _ in range(10)]
        m = self._make_mission(inspections=existing)
        insp = self._make_inspection()
        with pytest.raises(ValueError, match="max limit"):
            m.add_inspection(insp)

    def test_remove_inspection_draft(self):
        """can remove inspection in DRAFT status."""
        insp = self._make_inspection()
        m = self._make_mission(inspections=[insp])
        removed = m.remove_inspection(insp.id)
        assert removed is insp
        assert len(m.inspections) == 0

    def test_remove_inspection_planned_regresses_to_draft(self):
        """removing inspection in PLANNED status auto-regresses to DRAFT."""
        insp = self._make_inspection()
        m = self._make_mission("PLANNED", inspections=[insp])
        m.remove_inspection(insp.id)
        assert len(m.inspections) == 0
        assert m.status == "DRAFT"

    def test_remove_inspection_blocked_after_exported(self):
        """cannot remove inspection after mission is exported."""
        insp = self._make_inspection()
        m = self._make_mission("EXPORTED", inspections=[insp])
        with pytest.raises(ValueError, match="cannot modify"):
            m.remove_inspection(insp.id)

    def test_remove_inspection_not_found(self):
        """removing nonexistent inspection raises ValueError."""
        m = self._make_mission()
        with pytest.raises(ValueError, match="not found"):
            m.remove_inspection(uuid4())


class TestMissionChangeDroneProfile:
    """tests for Mission.change_drone_profile."""

    def _make_mission(self, status="DRAFT"):
        """create a mission with given status."""
        m = Mission(id=uuid4(), name="test", status=status, airport_id=uuid4())
        m.inspections = []
        m.flight_plan = None
        return m

    def test_change_drone_profile_validated_to_draft(self):
        """changing drone profile regresses VALIDATED -> DRAFT."""
        m = self._make_mission("VALIDATED")
        new_id = uuid4()
        m.change_drone_profile(new_id)
        assert m.drone_profile_id == new_id
        assert m.status == "DRAFT"

    def test_change_drone_profile_no_regress_draft(self):
        """changing drone profile in DRAFT stays DRAFT."""
        m = self._make_mission("DRAFT")
        new_id = uuid4()
        m.change_drone_profile(new_id)
        assert m.drone_profile_id == new_id
        assert m.status == "DRAFT"

    def test_change_drone_profile_planned_to_draft(self):
        """changing drone profile in PLANNED regresses to DRAFT."""
        m = self._make_mission("PLANNED")
        new_id = uuid4()
        m.change_drone_profile(new_id)
        assert m.drone_profile_id == new_id
        assert m.status == "DRAFT"

    def test_change_drone_profile_blocked_after_exported(self):
        """cannot change drone profile after mission is exported."""
        m = self._make_mission("EXPORTED")
        with pytest.raises(ValueError, match="cannot modify"):
            m.change_drone_profile(uuid4())


# airport aggregate root tests


class TestAirportAggregate:
    """tests for Airport aggregate root methods."""

    def _make_airport(self):
        """create an airport instance."""
        a = Airport(id=uuid4(), icao_code="LKPR", name="test", elevation=380.0)
        a.surfaces = []
        a.obstacles = []
        a.safety_zones = []
        return a

    def test_add_surface(self):
        """add_surface sets airport_id and appends."""
        airport = self._make_airport()
        surface = AirfieldSurface(id=uuid4(), identifier="06R", surface_type="RUNWAY")
        airport.add_surface(surface)
        assert surface.airport_id == airport.id
        assert len(airport.surfaces) == 1

    def test_add_obstacle(self):
        """add_obstacle sets airport_id and appends."""
        airport = self._make_airport()
        obstacle = Obstacle(id=uuid4(), name="tower", height=30.0, radius=5.0, type="TOWER")
        airport.add_obstacle(obstacle)
        assert obstacle.airport_id == airport.id
        assert len(airport.obstacles) == 1

    def test_add_safety_zone(self):
        """add_safety_zone sets airport_id and appends."""
        airport = self._make_airport()
        zone = SafetyZone(id=uuid4(), name="ctr", type="CTR")
        airport.add_safety_zone(zone)
        assert zone.airport_id == airport.id
        assert len(airport.safety_zones) == 1


# entity business method tests


class TestInspectionConfigurationResolve:
    """tests for InspectionConfiguration.resolve_with_defaults."""

    def test_override_over_template(self):
        """operator override takes precedence over template default."""
        config = InspectionConfiguration(
            altitude_offset=5.0,
            speed_override=3.0,
            measurement_density=12,
        )

        template_config = InspectionConfiguration(
            altitude_offset=2.0,
            measurement_density=8,
            hover_duration=2.0,
            horizontal_distance=400.0,
        )

        merged = config.resolve_with_defaults(template_config)
        assert merged["altitude_offset"] == 5.0
        assert merged["speed_override"] == 3.0
        assert merged["measurement_density"] == 12
        assert merged["hover_duration"] == 2.0
        assert merged["horizontal_distance"] == 400.0

    def test_no_template_config(self):
        """works when template config is None."""
        config = InspectionConfiguration(altitude_offset=5.0)

        merged = config.resolve_with_defaults(None)
        assert merged["altitude_offset"] == 5.0
        assert merged["speed_override"] is None


class TestFlightPlanCompile:
    """tests for FlightPlan.compile."""

    def test_compile_sets_fields(self):
        """compile sets distance, duration, and generated_at."""
        fp = FlightPlan(id=uuid4(), mission_id=uuid4(), airport_id=uuid4())

        fp.compile(1500.0, 300.0)
        assert fp.total_distance == 1500.0
        assert fp.estimated_duration == 300.0
        assert fp.generated_at is not None


class TestInspectionSpeedCompatibility:
    """tests for Inspection.is_speed_compatible_with_frame_rate."""

    def test_compatible_speed(self):
        """speed within drone limits is compatible."""
        insp = Inspection(
            id=uuid4(),
            template_id=uuid4(),
            method="VERTICAL_PROFILE",
            sequence_order=1,
        )
        config = InspectionConfiguration(measurement_density=8)
        insp.config = config

        @dataclass
        class FakeDrone:
            """fake drone for testing."""

            camera_frame_rate: int = 30
            max_speed: float = 10.0

        assert insp.is_speed_compatible_with_frame_rate(FakeDrone(), 5.0) is True

    def test_incompatible_speed(self):
        """speed exceeding drone max is incompatible."""
        insp = Inspection(
            id=uuid4(),
            template_id=uuid4(),
            method="VERTICAL_PROFILE",
            sequence_order=1,
        )
        config = InspectionConfiguration(measurement_density=8)
        insp.config = config

        @dataclass
        class FakeDrone:
            """fake drone for testing."""

            camera_frame_rate: int = 30
            max_speed: float = 10.0

        assert insp.is_speed_compatible_with_frame_rate(FakeDrone(), 15.0) is False

    def test_no_drone(self):
        """no drone profile is always compatible."""
        insp = Inspection(
            id=uuid4(),
            template_id=uuid4(),
            method="VERTICAL_PROFILE",
            sequence_order=1,
        )
        insp.config = None
        assert insp.is_speed_compatible_with_frame_rate(None, 5.0) is True
