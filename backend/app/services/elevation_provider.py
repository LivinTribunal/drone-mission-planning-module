"""pluggable elevation provider abstraction for terrain-following altitude."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class ElevationProvider(ABC):
    """base class for terrain elevation data sources."""

    @abstractmethod
    def get_elevation(self, lat: float, lon: float) -> float:
        """return ground elevation in meters MSL at given point."""

    @abstractmethod
    def get_elevations_batch(self, points: list[tuple[float, float]]) -> list[float]:
        """return ground elevations for a batch of (lat, lon) points."""


class FlatElevationProvider(ElevationProvider):
    """returns constant airport elevation for all queries - current behavior."""

    def __init__(self, airport_elevation: float):
        """initialize with airport elevation."""
        self.elevation = airport_elevation

    def get_elevation(self, lat: float, lon: float) -> float:
        """return airport elevation for any point."""
        return self.elevation

    def get_elevations_batch(self, points: list[tuple[float, float]]) -> list[float]:
        """return airport elevation for all points."""
        return [self.elevation] * len(points)


class DEMElevationProvider(ElevationProvider):
    """reads terrain elevation from a GeoTIFF file via rasterio."""

    def __init__(self, file_path: str, fallback_elevation: float):
        """open raster dataset and cache handle."""
        try:
            import rasterio  # noqa: F401
        except ImportError as e:
            raise ImportError(
                "rasterio is required for DEM elevation provider - "
                "install it with: pip install rasterio"
            ) from e

        self.fallback_elevation = fallback_elevation
        self.file_path = file_path
        self._dataset = rasterio.open(file_path)

    def get_elevation(self, lat: float, lon: float) -> float:
        """sample raster at (lon, lat) - rasterio uses x=lon, y=lat."""
        try:
            values = list(self._dataset.sample([(lon, lat)]))
            if values and len(values[0]) > 0:
                val = float(values[0][0])
                # check for nodata
                nodata = self._dataset.nodata
                if nodata is not None and val == nodata:
                    return self.fallback_elevation
                return val
        except Exception:
            logger.warning("DEM sample failed at lat=%.6f lon=%.6f, using fallback", lat, lon)

        return self.fallback_elevation

    def get_elevations_batch(self, points: list[tuple[float, float]]) -> list[float]:
        """batch sample - points are (lat, lon) tuples."""
        if not points:
            return []

        # rasterio.sample expects (x, y) = (lon, lat)
        coords = [(lon, lat) for lat, lon in points]
        results = []

        try:
            nodata = self._dataset.nodata
            for val_array in self._dataset.sample(coords):
                val = float(val_array[0])
                if nodata is not None and val == nodata:
                    results.append(self.fallback_elevation)
                else:
                    results.append(val)
        except Exception:
            logger.warning("DEM batch sample failed, using fallback for all points")
            return [self.fallback_elevation] * len(points)

        return results

    def close(self):
        """close the raster dataset."""
        if hasattr(self, "_dataset") and self._dataset:
            self._dataset.close()

    def __del__(self):
        """cleanup on garbage collection."""
        self.close()


def create_elevation_provider(airport) -> ElevationProvider:
    """select provider based on airport terrain source config."""
    terrain_source = getattr(airport, "terrain_source", "FLAT") or "FLAT"

    if terrain_source == "DEM":
        dem_path = getattr(airport, "dem_file_path", None)
        if dem_path:
            try:
                return DEMElevationProvider(dem_path, airport.elevation)
            except (ImportError, Exception) as e:
                logger.warning("failed to create DEM provider: %s, falling back to flat", e)

    return FlatElevationProvider(airport.elevation)
