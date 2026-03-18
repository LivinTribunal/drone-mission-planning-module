import pytest

from app.models.value_objects import AltitudeRange, Coordinate, IcaoCode, Speed


class TestCoordinate:
    """tests for Coordinate value object."""

    def test_valid_coordinate(self):
        """valid coordinate construction."""
        c = Coordinate(lat=48.1, lon=16.5, alt=200.0)
        assert c.lat == 48.1
        assert c.lon == 16.5
        assert c.alt == 200.0

    def test_boundary_values(self):
        """coordinate at boundary values."""
        c = Coordinate(lat=90, lon=180, alt=0)
        assert c.lat == 90
        c = Coordinate(lat=-90, lon=-180, alt=-100)
        assert c.lon == -180

    def test_invalid_lat_high(self):
        """lat above 90 raises ValueError."""
        with pytest.raises(ValueError, match="lat"):
            Coordinate(lat=91, lon=0, alt=0)

    def test_invalid_lat_low(self):
        """lat below -90 raises ValueError."""
        with pytest.raises(ValueError, match="lat"):
            Coordinate(lat=-91, lon=0, alt=0)

    def test_invalid_lon_high(self):
        """lon above 180 raises ValueError."""
        with pytest.raises(ValueError, match="lon"):
            Coordinate(lat=0, lon=181, alt=0)

    def test_invalid_lon_low(self):
        """lon below -180 raises ValueError."""
        with pytest.raises(ValueError, match="lon"):
            Coordinate(lat=0, lon=-181, alt=0)

    def test_to_wkt(self):
        """to_wkt produces valid POINTZ WKT."""
        c = Coordinate(lat=48.1, lon=16.5, alt=200.0)
        assert c.to_wkt() == "POINT Z (16.5 48.1 200.0)"

    def test_immutable(self):
        """coordinate is frozen."""
        c = Coordinate(lat=48.1, lon=16.5, alt=200.0)
        with pytest.raises(AttributeError):
            c.lat = 0


class TestSpeed:
    """tests for Speed value object."""

    def test_valid_speed(self):
        """valid speed construction."""
        s = Speed(value=5.0)
        assert s.value == 5.0

    def test_zero_speed(self):
        """zero speed is valid."""
        s = Speed(value=0.0)
        assert s.value == 0.0

    def test_negative_speed(self):
        """negative speed raises ValueError."""
        with pytest.raises(ValueError, match="non-negative"):
            Speed(value=-1.0)

    def test_immutable(self):
        """speed is frozen."""
        s = Speed(value=5.0)
        with pytest.raises(AttributeError):
            s.value = 10.0


class TestAltitudeRange:
    """tests for AltitudeRange value object."""

    def test_valid_range(self):
        """valid altitude range construction."""
        r = AltitudeRange(min_alt=100, max_alt=500)
        assert r.min_alt == 100
        assert r.max_alt == 500

    def test_equal_min_max(self):
        """equal min and max is valid."""
        r = AltitudeRange(min_alt=300, max_alt=300)
        assert r.min_alt == r.max_alt

    def test_invalid_range(self):
        """min > max raises ValueError."""
        with pytest.raises(ValueError, match="min_alt"):
            AltitudeRange(min_alt=500, max_alt=100)

    def test_contains_inside(self):
        """altitude inside range returns True."""
        r = AltitudeRange(min_alt=100, max_alt=500)
        assert r.contains(300) is True

    def test_contains_boundary(self):
        """altitude at boundary returns True."""
        r = AltitudeRange(min_alt=100, max_alt=500)
        assert r.contains(100) is True
        assert r.contains(500) is True

    def test_contains_outside(self):
        """altitude outside range returns False."""
        r = AltitudeRange(min_alt=100, max_alt=500)
        assert r.contains(50) is False
        assert r.contains(600) is False

    def test_immutable(self):
        """frozen dataclass prevents attribute assignment."""
        r = AltitudeRange(min_alt=100, max_alt=500)
        with pytest.raises(AttributeError):
            r.min_alt = 200


class TestIcaoCode:
    """tests for IcaoCode value object."""

    def test_valid_code(self):
        """valid ICAO code construction."""
        code = IcaoCode(code="LKPR")
        assert code.code == "LKPR"

    def test_too_short(self):
        """code shorter than 4 chars raises ValueError."""
        with pytest.raises(ValueError, match="ICAO"):
            IcaoCode(code="LKP")

    def test_too_long(self):
        """code longer than 4 chars raises ValueError."""
        with pytest.raises(ValueError, match="ICAO"):
            IcaoCode(code="LKPRX")

    def test_lowercase(self):
        """lowercase code raises ValueError."""
        with pytest.raises(ValueError, match="ICAO"):
            IcaoCode(code="lkpr")

    def test_with_digits(self):
        """code with digits raises ValueError."""
        with pytest.raises(ValueError, match="ICAO"):
            IcaoCode(code="LK1R")

    def test_empty(self):
        """empty code raises ValueError."""
        with pytest.raises(ValueError, match="ICAO"):
            IcaoCode(code="")

    def test_immutable(self):
        """ICAO code is frozen."""
        code = IcaoCode(code="LKPR")
        with pytest.raises(AttributeError):
            code.code = "EGLL"
