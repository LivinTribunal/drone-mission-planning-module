"""tests for flight plan schema computed fields and classification helpers."""

from uuid import uuid4

from app.schemas.flight_plan import (
    ValidationViolationResponse,
    _classify_violation,
    _extract_waypoint_ref,
)


class TestClassifyViolation:
    """tests for _classify_violation keyword matching."""

    def test_altitude(self):
        """match altitude keyword."""
        assert _classify_violation("altitude exceeds limit") == "altitude"

    def test_speed(self):
        """match speed but not framerate."""
        assert _classify_violation("speed is too high") == "speed"

    def test_speed_framerate_framerate(self):
        """match framerate keyword."""
        assert _classify_violation("framerate incompatible") == "speed_framerate"

    def test_speed_framerate_frame_rate(self):
        """match 'frame rate' two-word variant."""
        assert _classify_violation("frame rate too low") == "speed_framerate"

    def test_speed_excludes_framerate(self):
        """speed rule excluded when framerate present."""
        assert _classify_violation("speed limited by framerate") == "speed_framerate"

    def test_geofence(self):
        """match geofence keyword."""
        assert _classify_violation("outside geofence boundary") == "geofence"

    def test_battery(self):
        """match battery keyword."""
        assert _classify_violation("battery insufficient") == "battery"

    def test_runway_buffer(self):
        """match runway keyword."""
        assert _classify_violation("runway buffer exceeded") == "runway_buffer"

    def test_obstacle(self):
        """match obstacle keyword."""
        assert _classify_violation("obstacle clearance violated") == "obstacle"

    def test_camera_obstruction(self):
        """match obstructed keyword."""
        assert _classify_violation("camera view obstructed by tower") == "camera_obstruction"

    def test_safety_zone(self):
        """match safety zone keyword."""
        assert _classify_violation("entered safety zone perimeter") == "safety_zone"

    def test_safety_zone_no_false_positive(self):
        """'zone' alone does not match - avoids 'landing zone' etc."""
        assert _classify_violation("outside landing zone") is None

    def test_measurement_density(self):
        """match density keyword."""
        assert _classify_violation("auto-set density to 5 pts") == "measurement_density"

    def test_no_match(self):
        """return None when no keyword matches."""
        assert _classify_violation("something unknown happened") is None

    def test_case_insensitive(self):
        """matching is case-insensitive."""
        assert _classify_violation("ALTITUDE limit exceeded") == "altitude"


class TestExtractWaypointRef:
    """tests for _extract_waypoint_ref regex extraction."""

    def test_single_wp(self):
        """extract single waypoint number."""
        assert _extract_waypoint_ref("problem at wp 3") == "3"

    def test_wp_range(self):
        """extract waypoint range."""
        assert _extract_waypoint_ref("issue at wp 1-5") == "1-5"

    def test_wp_list(self):
        """extract waypoint list."""
        assert _extract_waypoint_ref("problems at wp 2, 4") == "2, 4"

    def test_no_match(self):
        """return None when no wp reference found."""
        assert _extract_waypoint_ref("no waypoint here") is None

    def test_case_insensitive(self):
        """WP matching is case-insensitive."""
        assert _extract_waypoint_ref("issue at WP 7") == "7"


class TestValidationViolationResponse:
    """tests for computed fields on the response schema."""

    def _make(
        self, category: str = "violation", message: str = "test"
    ) -> ValidationViolationResponse:
        """helper to build a response instance."""
        return ValidationViolationResponse(
            id=uuid4(),
            category=category,
            message=message,
        )

    def test_severity_returns_category(self):
        """severity is now just the category value."""
        assert self._make(category="violation").severity == "violation"
        assert self._make(category="warning").severity == "warning"
        assert self._make(category="suggestion").severity == "suggestion"

    def test_is_warning_computed(self):
        """is_warning is True for warning and suggestion, False for violation."""
        assert self._make(category="violation").is_warning is False
        assert self._make(category="warning").is_warning is True
        assert self._make(category="suggestion").is_warning is True

    def test_constraint_name_uses_violation_kind(self):
        """constraint_name uses cached violation_kind, not double classification."""
        v = self._make(message="altitude exceeds limit")
        assert v.constraint_name == "Altitude"
        assert v.violation_kind == "altitude"

    def test_constraint_name_none_for_unknown(self):
        """constraint_name is None when violation_kind is None."""
        v = self._make(message="unknown issue")
        assert v.constraint_name is None

    def test_waypoint_ref_extracted(self):
        """waypoint_ref extracted from message."""
        v = self._make(message="problem at wp 3-5")
        assert v.waypoint_ref == "3-5"

    def test_density_constraint_name(self):
        """density messages get measurement_density constraint name."""
        v = self._make(message="auto-set density to 5 pts")
        assert v.constraint_name == "Measurement Density"
