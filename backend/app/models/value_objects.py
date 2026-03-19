import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Coordinate:
    """immutable geographic coordinate with validation."""

    lat: float
    lon: float
    alt: float

    def __post_init__(self):
        """validate coordinate ranges."""
        if not -90 <= self.lat <= 90:
            raise ValueError(f"lat must be between -90 and 90, got {self.lat}")
        if not -180 <= self.lon <= 180:
            raise ValueError(f"lon must be between -180 and 180, got {self.lon}")

    def to_wkt(self) -> str:
        """convert to POINTZ WKT string."""
        return f"POINT Z ({self.lon} {self.lat} {self.alt})"


@dataclass(frozen=True)
class Speed:
    """non-negative speed value in m/s."""

    value: float

    def __post_init__(self):
        """validate speed is non-negative."""
        if self.value < 0:
            raise ValueError(f"speed must be non-negative, got {self.value}")


@dataclass(frozen=True)
class AltitudeRange:
    """altitude range with min <= max invariant."""

    min_alt: float
    max_alt: float

    def __post_init__(self):
        """validate min <= max."""
        if self.min_alt > self.max_alt:
            raise ValueError(f"min_alt ({self.min_alt}) must be <= max_alt ({self.max_alt})")

    def contains(self, alt: float) -> bool:
        """check if altitude falls within range."""
        return self.min_alt <= alt <= self.max_alt


_ICAO_PATTERN = re.compile(r"^[A-Z]{4}$")


@dataclass(frozen=True)
class IcaoCode:
    """exactly 4 uppercase alpha characters."""

    code: str

    def __post_init__(self):
        """validate ICAO code format."""
        if not _ICAO_PATTERN.match(self.code):
            raise ValueError(f"ICAO code must be exactly 4 uppercase letters, got '{self.code}'")
