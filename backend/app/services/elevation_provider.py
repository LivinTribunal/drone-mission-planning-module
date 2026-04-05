"""pluggable elevation provider abstraction for terrain-following altitude."""

from __future__ import annotations

import logging
import math
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
        import rasterio

        self.fallback_elevation = fallback_elevation
        self.file_path = file_path
        self._dataset = rasterio.open(file_path)

    def get_elevation(self, lat: float, lon: float) -> float:
        """sample raster at (lon, lat) - rasterio uses x=lon, y=lat."""
        try:
            values = list(self._dataset.sample([(lon, lat)]))
            if values and len(values[0]) > 0:
                val = float(values[0][0])
                # check for nodata or NaN
                nodata = self._dataset.nodata
                if nodata is not None and val == nodata:
                    return self.fallback_elevation
                if math.isnan(val):
                    return self.fallback_elevation
                return val
        except Exception as e:
            logger.warning(
                "DEM sample failed at lat=%.6f lon=%.6f: %s, using fallback", lat, lon, e
            )

        return self.fallback_elevation

    def get_elevations_batch(self, points: list[tuple[float, float]]) -> list[float]:
        """batch sample - points are (lat, lon) tuples."""
        if not points:
            return []

        # rasterio.sample expects (x, y) = (lon, lat)
        coords = [(lon, lat) for lat, lon in points]
        results: list[float] = []

        try:
            nodata = self._dataset.nodata
            for val_array in self._dataset.sample(coords):
                val = float(val_array[0])
                if (nodata is not None and val == nodata) or math.isnan(val):
                    results.append(self.fallback_elevation)
                else:
                    results.append(val)
        except Exception as e:
            # keep successful reads, fallback only for remaining points
            remaining = len(points) - len(results)
            logger.warning(
                "DEM batch sample failed after %d/%d points: %s, using fallback for rest",
                len(results),
                len(points),
                e,
            )
            results.extend([self.fallback_elevation] * remaining)

        return results

    def close(self):
        """close the raster dataset."""
        if hasattr(self, "_dataset") and self._dataset:
            self._dataset.close()
            self._dataset = None

    def __enter__(self):
        """support use as context manager."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """close dataset on context exit."""
        self.close()
        return False


def create_elevation_provider(airport) -> ElevationProvider:
    """select provider based on airport terrain source config."""
    terrain_source = getattr(airport, "terrain_source", "FLAT") or "FLAT"

    if terrain_source in ("DEM", "DEM_UPLOAD", "DEM_API"):
        dem_path = getattr(airport, "dem_file_path", None)
        if dem_path:
            try:
                return DEMElevationProvider(dem_path, airport.elevation)
            except ImportError:
                logger.warning("rasterio not installed, falling back to flat elevation")
            except Exception as e:
                logger.warning("failed to create DEM provider: %s, falling back to flat", e)

    return FlatElevationProvider(airport.elevation)
