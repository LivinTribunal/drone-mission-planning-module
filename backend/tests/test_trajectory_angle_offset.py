"""tests for papi observation angle derivation from lha setting angles."""

import math
from dataclasses import dataclass
from uuid import uuid4

import pytest

from app.models.enums import WaypointType
from app.services.trajectory.helpers import (
    check_missing_setting_angles,
    derive_observation_angle,
)
from app.services.trajectory.methods.papi_horizontal_range import calculate_arc_path
from app.services.trajectory.types import (
    DEFAULT_ANGLE_OFFSET,
    DEFAULT_GLIDE_SLOPE,
    MIN_ARC_RADIUS,
    Point3D,
    ResolvedConfig,
)

# test helpers


@dataclass
class FakeLHA:
    """minimal lha stub."""

    id: object = None
    unit_designator: str = "A"
    setting_angle: float | None = None

    def __post_init__(self):
        """set default id."""
        if self.id is None:
            self.id = uuid4()


@dataclass
class FakeAGL:
    """minimal agl stub."""

    lhas: list = None

    def __post_init__(self):
        """set default lhas."""
        if self.lhas is None:
            self.lhas = []


@dataclass
class FakeTemplate:
    """minimal template stub."""

    targets: list = None

    def __post_init__(self):
        """set default targets."""
        if self.targets is None:
            self.targets = []


class TestDeriveObservationAngle:
    """tests for derive_observation_angle."""

    def test_max_angle_plus_offset(self):
        """returns max setting angle plus the offset."""
        angles = [2.5, 3.0, 3.5]
        result = derive_observation_angle(angles, 0.5)
        assert result == 4.0

    def test_single_angle(self):
        """works with a single setting angle."""
        result = derive_observation_angle([3.0], 0.5)
        assert result == 3.5

    def test_zero_offset(self):
        """zero offset returns the max angle directly."""
        result = derive_observation_angle([2.0, 3.0, 4.0], 0.0)
        assert result == 4.0

    def test_custom_offset(self):
        """custom offset is applied correctly."""
        result = derive_observation_angle([3.0], 1.0)
        assert result == 4.0

    def test_default_offset_value(self):
        """default offset constant is 0.5 degrees."""
        assert DEFAULT_ANGLE_OFFSET == 0.5

    def test_empty_angles_raises(self):
        """empty list raises ValueError from max()."""
        with pytest.raises(ValueError):
            derive_observation_angle([], 0.5)


class TestCheckMissingSettingAngles:
    """tests for check_missing_setting_angles."""

    def test_no_missing(self):
        """returns empty list when all lhas have setting angles."""
        lhas = [
            FakeLHA(unit_designator="A", setting_angle=3.5),
            FakeLHA(unit_designator="B", setting_angle=3.0),
        ]
        template = FakeTemplate(targets=[FakeAGL(lhas=lhas)])
        result = check_missing_setting_angles(template)
        assert result == []

    def test_some_missing(self):
        """returns unit designators of lhas with missing setting angles."""
        lhas = [
            FakeLHA(unit_designator="A", setting_angle=3.5),
            FakeLHA(unit_designator="B", setting_angle=None),
            FakeLHA(unit_designator="C", setting_angle=None),
        ]
        template = FakeTemplate(targets=[FakeAGL(lhas=lhas)])
        result = check_missing_setting_angles(template)
        assert result == ["B", "C"]

    def test_all_missing(self):
        """returns all unit designators when all are missing."""
        lhas = [
            FakeLHA(unit_designator="A", setting_angle=None),
            FakeLHA(unit_designator="B", setting_angle=None),
        ]
        template = FakeTemplate(targets=[FakeAGL(lhas=lhas)])
        result = check_missing_setting_angles(template)
        assert result == ["A", "B"]

    def test_filtered_by_lha_ids(self):
        """only checks lhas matching provided lha_ids."""
        lha_a = FakeLHA(unit_designator="A", setting_angle=3.5)
        lha_b = FakeLHA(unit_designator="B", setting_angle=None)
        template = FakeTemplate(targets=[FakeAGL(lhas=[lha_a, lha_b])])
        # only check lha_a - should find no missing
        result = check_missing_setting_angles(template, lha_ids=[lha_a.id])
        assert result == []

    def test_sorted_output(self):
        """output is sorted by unit designator."""
        lhas = [
            FakeLHA(unit_designator="D", setting_angle=None),
            FakeLHA(unit_designator="A", setting_angle=None),
            FakeLHA(unit_designator="C", setting_angle=None),
        ]
        template = FakeTemplate(targets=[FakeAGL(lhas=lhas)])
        result = check_missing_setting_angles(template)
        assert result == ["A", "C", "D"]


class TestPapiArcPathWithDerivedAngle:
    """tests that arc path altitude uses the derived observation angle."""

    def test_arc_altitude_uses_derived_angle(self):
        """arc path altitude matches derived observation angle calculation."""
        center = Point3D(lon=17.0, lat=48.0, alt=200.0)
        config = ResolvedConfig(measurement_density=5)
        setting_angles = [2.5, 3.0, 3.5]
        derived = derive_observation_angle(setting_angles, DEFAULT_ANGLE_OFFSET)

        waypoints = calculate_arc_path(center, 270.0, derived, config, uuid4(), 5.0)

        radius = MIN_ARC_RADIUS
        expected_alt = (
            center.alt + radius * math.tan(math.radians(derived)) + config.altitude_offset
        )
        for wp in waypoints:
            assert wp.alt == pytest.approx(expected_alt, abs=0.01)

    def test_derived_angle_higher_than_glide_slope(self):
        """derived angle places drone higher than raw glide slope would."""
        center = Point3D(lon=17.0, lat=48.0, alt=200.0)
        config = ResolvedConfig(measurement_density=3)
        setting_angles = [2.5, 3.0, 3.5]
        derived = derive_observation_angle(setting_angles, DEFAULT_ANGLE_OFFSET)

        wps_derived = calculate_arc_path(center, 270.0, derived, config, uuid4(), 5.0)
        wps_glide = calculate_arc_path(center, 270.0, DEFAULT_GLIDE_SLOPE, config, uuid4(), 5.0)

        # derived angle (4.0) > default glide slope (3.0)
        assert derived > DEFAULT_GLIDE_SLOPE
        assert wps_derived[0].alt > wps_glide[0].alt

    def test_altitude_offset_still_applied(self):
        """existing altitude_offset (meters) is additive on top of derived angle."""
        center = Point3D(lon=17.0, lat=48.0, alt=200.0)
        config_no_offset = ResolvedConfig(measurement_density=3, altitude_offset=0.0)
        config_with_offset = ResolvedConfig(measurement_density=3, altitude_offset=5.0)
        derived = derive_observation_angle([3.0], 0.5)

        wps_no = calculate_arc_path(center, 270.0, derived, config_no_offset, uuid4(), 5.0)
        wps_with = calculate_arc_path(center, 270.0, derived, config_with_offset, uuid4(), 5.0)

        # altitude_offset adds exactly 5m
        assert wps_with[0].alt == pytest.approx(wps_no[0].alt + 5.0, abs=0.01)

    def test_all_waypoints_are_measurement(self):
        """all generated waypoints are MEASUREMENT type."""
        center = Point3D(lon=17.0, lat=48.0, alt=200.0)
        config = ResolvedConfig(measurement_density=5)
        derived = derive_observation_angle([3.0], 0.5)

        waypoints = calculate_arc_path(center, 270.0, derived, config, uuid4(), 5.0)

        assert len(waypoints) == 5
        for wp in waypoints:
            assert wp.waypoint_type == WaypointType.MEASUREMENT
