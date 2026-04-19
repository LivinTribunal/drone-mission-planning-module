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

    def test_invalidate_clears_flight_plan_reference(self):
        """invalidate_trajectory sets flight_plan to None."""
        m = self._make_mission("PLANNED")
        m.flight_plan = FlightPlan(id=uuid4(), mission_id=m.id, airport_id=m.airport_id)
        m.invalidate_trajectory()
        assert m.flight_plan is None
        assert m.status == "DRAFT"

    def test_draft_stays_draft(self):
        """DRAFT stays DRAFT (no-op)."""
        m = self._make_mission("DRAFT")
        m.invalidate_trajectory()
        assert m.status == "DRAFT"

    def test_exported_allows_modification(self):
        """EXPORTED allows modification - regresses to DRAFT."""
        m = self._make_mission("EXPORTED")
        m.invalidate_trajectory()
        assert m.status == "DRAFT"

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


class TestMissionValidateTransitAltitude:
    """tests for Mission.validate_transit_altitude business rules."""

    @dataclass
    class _Drone:
        max_altitude: float | None = None

    def _make_mission(self, value):
        """create a mission with given transit_agl."""
        m = Mission(id=uuid4(), name="test", status="DRAFT", airport_id=uuid4())
        m.transit_agl = value
        return m

    def test_none_is_noop(self):
        """unset field passes validation."""
        m = self._make_mission(None)
        m.validate_transit_altitude(None)

    def test_rejects_zero(self):
        """zero altitude is rejected."""
        m = self._make_mission(0.0)
        with pytest.raises(ValueError, match="greater than 0"):
            m.validate_transit_altitude(None)

    def test_rejects_below_minimum_agl(self):
        """below 5m AGL is rejected."""
        m = self._make_mission(3.0)
        with pytest.raises(ValueError, match="at least 5m AGL"):
            m.validate_transit_altitude(None)

    def test_accepts_exactly_minimum(self):
        """exactly 5m AGL is accepted."""
        m = self._make_mission(5.0)
        m.validate_transit_altitude(None)

    def test_rejects_above_drone_max(self):
        """value above drone.max_altitude is rejected."""
        m = self._make_mission(150.0)
        with pytest.raises(ValueError, match="exceeds drone max altitude"):
            m.validate_transit_altitude(self._Drone(max_altitude=100.0))

    def test_accepts_within_drone_max(self):
        """value within drone.max_altitude is accepted."""
        m = self._make_mission(80.0)
        m.validate_transit_altitude(self._Drone(max_altitude=100.0))

    def test_ignores_drone_without_max_altitude(self):
        """drone without max_altitude does not cap cruise altitude."""
        m = self._make_mission(200.0)
        m.validate_transit_altitude(self._Drone(max_altitude=None))


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

    def test_add_inspection_exported_regresses_to_draft(self):
        """adding inspection to EXPORTED mission regresses to DRAFT."""
        m = self._make_mission("EXPORTED")
        insp = self._make_inspection()
        m.add_inspection(insp)
        assert m.status == "DRAFT"
        assert len(m.inspections) == 1

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

    def test_remove_inspection_exported_regresses_to_draft(self):
        """removing inspection from EXPORTED mission regresses to DRAFT."""
        insp = self._make_inspection()
        m = self._make_mission("EXPORTED", inspections=[insp])
        m.remove_inspection(insp.id)
        assert len(m.inspections) == 0
        assert m.status == "DRAFT"

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

    def test_change_drone_profile_exported_regresses_to_draft(self):
        """changing drone profile in EXPORTED regresses to DRAFT."""
        m = self._make_mission("EXPORTED")
        new_id = uuid4()
        m.change_drone_profile(new_id)
        assert m.drone_profile_id == new_id
        assert m.status == "DRAFT"


class TestInspectionLhaIds:
    """tests for Inspection.lha_ids property."""

    def test_lha_ids_returns_uuids(self):
        """string values in config.lha_ids are returned as UUID objects."""
        uid1 = uuid4()
        uid2 = uuid4()
        config = InspectionConfiguration(lha_ids=[str(uid1), str(uid2)])
        insp = Inspection(
            id=uuid4(),
            template_id=uuid4(),
            method="HORIZONTAL_RANGE",
            sequence_order=1,
        )
        insp.config = config

        result = insp.lha_ids

        assert result is not None
        assert len(result) == 2
        assert result[0] == uid1
        assert result[1] == uid2

    def test_lha_ids_none_when_no_config(self):
        """returns None when config is missing."""
        insp = Inspection(
            id=uuid4(),
            template_id=uuid4(),
            method="HORIZONTAL_RANGE",
            sequence_order=1,
        )
        insp.config = None

        assert insp.lha_ids is None

    def test_lha_ids_none_when_config_has_no_lha_ids(self):
        """returns None when config.lha_ids is None."""
        config = InspectionConfiguration(lha_ids=None)
        insp = Inspection(
            id=uuid4(),
            template_id=uuid4(),
            method="HORIZONTAL_RANGE",
            sequence_order=1,
        )
        insp.config = config

        assert insp.lha_ids is None


class TestCoerceLhaIdsValidator:
    """tests for InspectionConfigOverride.coerce_lha_ids_to_strings validator."""

    def test_uuids_accepted(self):
        """UUID objects passed as lha_ids are accepted and stored as UUIDs."""
        from app.schemas.mission import InspectionConfigOverride

        uid1 = uuid4()
        uid2 = uuid4()
        schema = InspectionConfigOverride(lha_ids=[uid1, uid2])

        assert schema.lha_ids is not None
        assert len(schema.lha_ids) == 2
        # field type is list[UUID] so final values are UUIDs
        assert schema.lha_ids[0] == uid1
        assert schema.lha_ids[1] == uid2

    def test_none_passes_through(self):
        """None lha_ids passes through unchanged."""
        from app.schemas.mission import InspectionConfigOverride

        schema = InspectionConfigOverride(lha_ids=None)

        assert schema.lha_ids is None

    def test_strings_accepted(self):
        """string lha_ids are accepted and parsed to UUIDs."""
        from uuid import UUID as PyUUID

        from app.schemas.mission import InspectionConfigOverride

        uid = uuid4()
        schema = InspectionConfigOverride(lha_ids=[str(uid)])

        assert schema.lha_ids is not None
        assert isinstance(schema.lha_ids[0], PyUUID)
        assert schema.lha_ids[0] == uid

    def test_json_dump_produces_strings(self):
        """model_dump(mode='json') produces string lha_ids for JSONB storage."""
        from app.schemas.mission import InspectionConfigOverride

        uid = uuid4()
        schema = InspectionConfigOverride(lha_ids=[uid])
        dumped = schema.model_dump(mode="json")

        assert dumped["lha_ids"] == [str(uid)]


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
        obstacle = Obstacle(
            id=uuid4(), name="tower", height=30.0, buffer_distance=5.0, type="TOWER"
        )
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
            measurement_speed_override=3.0,
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
        assert merged["measurement_speed_override"] == 3.0
        assert merged["measurement_density"] == 12
        assert merged["hover_duration"] == 2.0
        assert merged["horizontal_distance"] == 400.0

    def test_no_template_config(self):
        """works when template config is None."""
        config = InspectionConfiguration(altitude_offset=5.0)

        merged = config.resolve_with_defaults(None)
        assert merged["altitude_offset"] == 5.0
        assert merged["measurement_speed_override"] is None


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


class TestMergeFieldsIncludesLhaIds:
    """tests that _MERGE_FIELDS includes lha_ids so duplication preserves them."""

    def test_lha_ids_in_merge_fields(self):
        """lha_ids must be in _MERGE_FIELDS for duplicate_mission to copy them."""
        assert "lha_ids" in InspectionConfiguration._MERGE_FIELDS

    def test_resolve_with_defaults_carries_lha_ids(self):
        """resolve_with_defaults includes lha_ids from override config."""
        uid1 = uuid4()
        uid2 = uuid4()
        config = InspectionConfiguration(lha_ids=[str(uid1), str(uid2)])
        template = InspectionConfiguration(lha_ids=None)

        merged = config.resolve_with_defaults(template)
        assert merged["lha_ids"] == [str(uid1), str(uid2)]

    def test_resolve_with_defaults_falls_back_to_template_lha_ids(self):
        """resolve_with_defaults falls back to template lha_ids when override is None."""
        uid = uuid4()
        config = InspectionConfiguration(lha_ids=None)
        template = InspectionConfiguration(lha_ids=[str(uid)])

        merged = config.resolve_with_defaults(template)
        assert merged["lha_ids"] == [str(uid)]


class TestMeasurementDensityValidation:
    """tests that measurement_density=0 is rejected by schema validation."""

    def test_zero_density_rejected(self):
        """measurement_density=0 must be rejected."""
        import pytest

        from app.schemas.mission import InspectionConfigOverride

        with pytest.raises(Exception):
            InspectionConfigOverride(measurement_density=0)

    def test_negative_density_rejected(self):
        """negative measurement_density must be rejected."""
        import pytest

        from app.schemas.mission import InspectionConfigOverride

        with pytest.raises(Exception):
            InspectionConfigOverride(measurement_density=-5)

    def test_valid_density_accepted(self):
        """positive measurement_density is accepted."""
        from app.schemas.mission import InspectionConfigOverride

        schema = InspectionConfigOverride(measurement_density=10)
        assert schema.measurement_density == 10

    def test_none_density_accepted(self):
        """None measurement_density is accepted."""
        from app.schemas.mission import InspectionConfigOverride

        schema = InspectionConfigOverride(measurement_density=None)
        assert schema.measurement_density is None


class TestTrajectoryFieldsCompleteness:
    """tests that TRAJECTORY_FIELDS includes all fields that affect trajectory generation."""

    def test_capture_mode_in_trajectory_fields(self):
        """default_capture_mode is a trajectory-affecting field."""
        from app.models.mission import TRAJECTORY_FIELDS

        assert "default_capture_mode" in TRAJECTORY_FIELDS

    def test_buffer_distance_in_trajectory_fields(self):
        """default_buffer_distance is a trajectory-affecting field."""
        from app.models.mission import TRAJECTORY_FIELDS

        assert "default_buffer_distance" in TRAJECTORY_FIELDS

    def test_transit_agl_in_trajectory_fields(self):
        """transit_agl is a trajectory-affecting field."""
        from app.models.mission import TRAJECTORY_FIELDS

        assert "transit_agl" in TRAJECTORY_FIELDS

    def test_require_perpendicular_in_trajectory_fields(self):
        """require_perpendicular_runway_crossing is a trajectory-affecting field."""
        from app.models.mission import TRAJECTORY_FIELDS

        assert "require_perpendicular_runway_crossing" in TRAJECTORY_FIELDS
