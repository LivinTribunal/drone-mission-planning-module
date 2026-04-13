"""tests for method-AGL compatibility validation on InspectionTemplate."""

from dataclasses import dataclass

import pytest

from app.models.enums import InspectionMethod, is_method_compatible_with_agl
from app.models.inspection import InspectionTemplate


@dataclass
class FakeAGL:
    """minimal AGL stub for compatibility tests."""

    agl_type: str


class TestMethodAglHelper:
    """tests for is_method_compatible_with_agl helper."""

    def test_papi_compat(self):
        """PAPI compatible with VERTICAL_PROFILE, ANGULAR_SWEEP, HOVER_POINT_LOCK."""
        assert is_method_compatible_with_agl("VERTICAL_PROFILE", "PAPI")
        assert is_method_compatible_with_agl("ANGULAR_SWEEP", "PAPI")
        assert is_method_compatible_with_agl("HOVER_POINT_LOCK", "PAPI")

    def test_runway_compat(self):
        """RUNWAY_EDGE_LIGHTS compatible with FLY_OVER, PARALLEL_SIDE_SWEEP, HOVER_POINT_LOCK."""
        assert is_method_compatible_with_agl("FLY_OVER", "RUNWAY_EDGE_LIGHTS")
        assert is_method_compatible_with_agl("PARALLEL_SIDE_SWEEP", "RUNWAY_EDGE_LIGHTS")
        assert is_method_compatible_with_agl("HOVER_POINT_LOCK", "RUNWAY_EDGE_LIGHTS")

    def test_papi_incompat(self):
        """PAPI rejects FLY_OVER and PARALLEL_SIDE_SWEEP."""
        assert not is_method_compatible_with_agl("FLY_OVER", "PAPI")
        assert not is_method_compatible_with_agl("PARALLEL_SIDE_SWEEP", "PAPI")

    def test_runway_incompat(self):
        """RUNWAY_EDGE_LIGHTS rejects VERTICAL_PROFILE and ANGULAR_SWEEP."""
        assert not is_method_compatible_with_agl("VERTICAL_PROFILE", "RUNWAY_EDGE_LIGHTS")
        assert not is_method_compatible_with_agl("ANGULAR_SWEEP", "RUNWAY_EDGE_LIGHTS")

    def test_unknown_method(self):
        """unknown method returns False."""
        assert not is_method_compatible_with_agl("MADE_UP", "PAPI")


class TestTemplateValidator:
    """tests for InspectionTemplate.validate_method_agl_compat aggregate method."""

    def _make(self, agl_types: list[str]) -> InspectionTemplate:
        """build a template stub with given AGL target types."""
        t = InspectionTemplate()
        t.targets = [FakeAGL(agl_type=t) for t in agl_types]
        return t

    def test_valid_papi_vertical_profile(self):
        """VERTICAL_PROFILE + PAPI passes."""
        t = self._make(["PAPI"])
        t.validate_method_agl_compat(["VERTICAL_PROFILE"])

    def test_valid_runway_fly_over(self):
        """FLY_OVER + RUNWAY_EDGE_LIGHTS passes."""
        t = self._make(["RUNWAY_EDGE_LIGHTS"])
        t.validate_method_agl_compat(["FLY_OVER"])

    def test_hover_point_lock_matches_both(self):
        """HOVER_POINT_LOCK is valid for PAPI and RUNWAY_EDGE_LIGHTS."""
        t_papi = self._make(["PAPI"])
        t_runway = self._make(["RUNWAY_EDGE_LIGHTS"])
        t_papi.validate_method_agl_compat(["HOVER_POINT_LOCK"])
        t_runway.validate_method_agl_compat(["HOVER_POINT_LOCK"])

    def test_fly_over_on_papi_rejected(self):
        """FLY_OVER on PAPI raises."""
        t = self._make(["PAPI"])
        with pytest.raises(ValueError, match="FLY_OVER"):
            t.validate_method_agl_compat(["FLY_OVER"])

    def test_parallel_on_papi_rejected(self):
        """PARALLEL_SIDE_SWEEP on PAPI raises."""
        t = self._make(["PAPI"])
        with pytest.raises(ValueError, match="PARALLEL_SIDE_SWEEP"):
            t.validate_method_agl_compat(["PARALLEL_SIDE_SWEEP"])

    def test_vertical_profile_on_runway_rejected(self):
        """VERTICAL_PROFILE on RUNWAY_EDGE_LIGHTS raises."""
        t = self._make(["RUNWAY_EDGE_LIGHTS"])
        with pytest.raises(ValueError, match="VERTICAL_PROFILE"):
            t.validate_method_agl_compat(["VERTICAL_PROFILE"])

    def test_angular_sweep_on_runway_rejected(self):
        """ANGULAR_SWEEP on RUNWAY_EDGE_LIGHTS raises."""
        t = self._make(["RUNWAY_EDGE_LIGHTS"])
        with pytest.raises(ValueError, match="ANGULAR_SWEEP"):
            t.validate_method_agl_compat(["ANGULAR_SWEEP"])

    def test_unknown_method_rejected(self):
        """unknown method raises."""
        t = self._make(["PAPI"])
        with pytest.raises(ValueError, match="unknown"):
            t.validate_method_agl_compat(["MADE_UP_METHOD"])

    def test_mixed_targets_fails_if_any_incompat(self):
        """template with both PAPI and RUNWAY fails for FLY_OVER on PAPI target."""
        t = self._make(["PAPI", "RUNWAY_EDGE_LIGHTS"])
        with pytest.raises(ValueError):
            t.validate_method_agl_compat(["FLY_OVER"])

    def test_empty_methods_passes(self):
        """empty methods list is accepted."""
        t = self._make(["PAPI"])
        t.validate_method_agl_compat([])

    def test_empty_targets_passes(self):
        """empty targets list is accepted (nothing to check)."""
        t = self._make([])
        t.validate_method_agl_compat(["FLY_OVER"])

    def test_enum_values_present(self):
        """InspectionMethod enum includes all five methods."""
        names = {m.value for m in InspectionMethod}
        assert {
            "VERTICAL_PROFILE",
            "ANGULAR_SWEEP",
            "FLY_OVER",
            "PARALLEL_SIDE_SWEEP",
            "HOVER_POINT_LOCK",
        } <= names
