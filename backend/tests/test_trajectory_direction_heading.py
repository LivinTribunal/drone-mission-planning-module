"""tests for direction heading waypoint resorting logic."""

import pytest

from app.services.trajectory.helpers import sort_positions_along_heading
from app.services.trajectory.types import Point3D

# base positions forming a rough grid around (14.26, 50.10)
# NW, NE, SW, SE corners
POSITIONS = [
    Point3D(lon=14.259, lat=50.101, alt=300.0),  # NW
    Point3D(lon=14.261, lat=50.101, alt=300.0),  # NE
    Point3D(lon=14.259, lat=50.099, alt=300.0),  # SW
    Point3D(lon=14.261, lat=50.099, alt=300.0),  # SE
]


def test_sort_positions_along_heading_0_degrees():
    """heading 0 (north) - positions sorted south to north (ascending lat)."""
    result = sort_positions_along_heading(POSITIONS, 0.0)
    lats = [p.lat for p in result]
    assert lats == sorted(lats)


def test_sort_positions_along_heading_180_degrees():
    """heading 180 (south) - positions sorted north to south (descending lat)."""
    result = sort_positions_along_heading(POSITIONS, 180.0)
    lats = [p.lat for p in result]
    assert lats == sorted(lats, reverse=True)


def test_sort_positions_along_heading_90_degrees():
    """heading 90 (east) - positions sorted west to east (ascending lon)."""
    result = sort_positions_along_heading(POSITIONS, 90.0)
    lons = [p.lon for p in result]
    assert lons == sorted(lons)


def test_sort_positions_along_heading_270_degrees():
    """heading 270 (west) - positions sorted east to west (descending lon)."""
    result = sort_positions_along_heading(POSITIONS, 270.0)
    lons = [p.lon for p in result]
    assert lons == sorted(lons, reverse=True)


def test_sort_positions_along_heading_45_degrees():
    """heading 45 (NE) - SW corner first, NE corner last."""
    result = sort_positions_along_heading(POSITIONS, 45.0)
    # SW has smallest projection onto NE vector, NE has largest
    assert result[0].lat == pytest.approx(50.099) and result[0].lon == pytest.approx(14.259)
    assert result[-1].lat == pytest.approx(50.101) and result[-1].lon == pytest.approx(14.261)


def test_sort_positions_along_heading_135_degrees():
    """heading 135 (SE) - NW corner first, SE corner last."""
    result = sort_positions_along_heading(POSITIONS, 135.0)
    assert result[0].lat == pytest.approx(50.101) and result[0].lon == pytest.approx(14.259)
    assert result[-1].lat == pytest.approx(50.099) and result[-1].lon == pytest.approx(14.261)


def test_sort_positions_along_heading_225_degrees():
    """heading 225 (SW) - NE corner first, SW corner last."""
    result = sort_positions_along_heading(POSITIONS, 225.0)
    assert result[0].lat == pytest.approx(50.101) and result[0].lon == pytest.approx(14.261)
    assert result[-1].lat == pytest.approx(50.099) and result[-1].lon == pytest.approx(14.259)


def test_sort_positions_along_heading_315_degrees():
    """heading 315 (NW) - SE corner first, NW corner last."""
    result = sort_positions_along_heading(POSITIONS, 315.0)
    assert result[0].lat == pytest.approx(50.099) and result[0].lon == pytest.approx(14.261)
    assert result[-1].lat == pytest.approx(50.101) and result[-1].lon == pytest.approx(14.259)


def test_sort_positions_along_heading_single_point():
    """single position returns unchanged."""
    single = [Point3D(lon=14.26, lat=50.10, alt=300.0)]
    result = sort_positions_along_heading(single, 90.0)
    assert result == single


def test_sort_positions_along_heading_empty_list():
    """empty list returns empty."""
    result = sort_positions_along_heading([], 45.0)
    assert result == []


def test_sort_positions_along_heading_collinear():
    """positions already along the heading remain in order."""
    # three points along a north-south line
    collinear = [
        Point3D(lon=14.26, lat=50.098, alt=300.0),
        Point3D(lon=14.26, lat=50.100, alt=300.0),
        Point3D(lon=14.26, lat=50.102, alt=300.0),
    ]
    result = sort_positions_along_heading(collinear, 0.0)
    lats = [p.lat for p in result]
    assert lats == sorted(lats)


def test_sort_preserves_all_positions():
    """sorting preserves all input positions without duplication or loss."""
    result = sort_positions_along_heading(POSITIONS, 123.0)
    assert len(result) == len(POSITIONS)
    for p in POSITIONS:
        assert p in result
