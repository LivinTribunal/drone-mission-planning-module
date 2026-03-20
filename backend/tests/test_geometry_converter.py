from types import SimpleNamespace
from typing import Optional

import pytest
from pydantic import BaseModel

from app.services.geometry_converter import (
    apply_dict_update,
    apply_schema_update,
    geojson_to_ewkt,
    schema_to_model_data,
)

# helper schemas for testing


class FakeSchema(BaseModel):
    """pydantic schema with a geometry field and a plain field."""

    name: str
    location: Optional[dict] = None


class FakeUpdateSchema(BaseModel):
    """pydantic schema used for partial updates."""

    name: Optional[str] = None
    location: Optional[dict] = None


class TestGeojsonToEwkt:
    """tests for geojson_to_ewkt conversion."""

    def test_point(self):
        """point geojson converts to POINTZ EWKT."""
        geojson = {"type": "Point", "coordinates": [16.5, 48.1, 300.0]}
        result = geojson_to_ewkt(geojson)
        assert result == "SRID=4326;POINTZ(16.5 48.1 300.0)"

    def test_linestring(self):
        """linestring geojson converts to LINESTRINGZ EWKT."""
        geojson = {
            "type": "LineString",
            "coordinates": [[16.5, 48.1, 300.0], [16.6, 48.2, 310.0]],
        }
        result = geojson_to_ewkt(geojson)
        assert result == "SRID=4326;LINESTRINGZ(16.5 48.1 300.0, 16.6 48.2 310.0)"

    def test_polygon(self):
        """polygon geojson converts to POLYGONZ EWKT."""
        geojson = {
            "type": "Polygon",
            "coordinates": [
                [[16.5, 48.1, 0], [16.6, 48.1, 0], [16.6, 48.2, 0], [16.5, 48.1, 0]],
            ],
        }
        result = geojson_to_ewkt(geojson)
        assert result == (
            "SRID=4326;POLYGONZ((16.5 48.1 0, 16.6 48.1 0, 16.6 48.2 0, 16.5 48.1 0))"
        )

    def test_polygon_with_hole(self):
        """polygon with interior ring converts both rings."""
        outer = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 0, 0]]
        inner = [[2, 2, 0], [8, 2, 0], [8, 8, 0], [2, 2, 0]]
        geojson = {"type": "Polygon", "coordinates": [outer, inner]}
        result = geojson_to_ewkt(geojson)
        assert "POLYGONZ(" in result
        assert result.count("(") == 3  # outer parens + two rings

    def test_unsupported_type_raises(self):
        """unsupported geometry type raises ValueError."""
        geojson = {"type": "MultiPoint", "coordinates": [[0, 0, 0]]}
        with pytest.raises(ValueError, match="unsupported geometry type"):
            geojson_to_ewkt(geojson)


class TestSchemaToModelData:
    """tests for schema_to_model_data conversion."""

    def test_converts_geometry_fields(self):
        """geometry field is converted to EWKT, plain fields pass through."""
        schema = FakeSchema(
            name="test",
            location={"type": "Point", "coordinates": [16.5, 48.1, 300.0]},
        )
        data = schema_to_model_data(schema)
        assert data["name"] == "test"
        assert data["location"] == "SRID=4326;POINTZ(16.5 48.1 300.0)"

    def test_none_geometry_left_as_none(self):
        """None geometry fields are not converted."""
        schema = FakeSchema(name="test", location=None)
        data = schema_to_model_data(schema)
        assert data["location"] is None
        assert data["name"] == "test"


class TestApplyDictUpdate:
    """tests for apply_dict_update."""

    def test_sets_attributes_with_geometry_conversion(self):
        """geometry fields are converted to EWKT when set on object."""
        obj = SimpleNamespace()
        data = {
            "name": "mission-1",
            "location": {"type": "Point", "coordinates": [16.5, 48.1, 300.0]},
        }
        apply_dict_update(obj, data)
        assert obj.name == "mission-1"
        assert obj.location == "SRID=4326;POINTZ(16.5 48.1 300.0)"

    def test_none_geometry_stays_none(self):
        """None geometry fields are set as None, not converted."""
        obj = SimpleNamespace()
        apply_dict_update(obj, {"location": None})
        assert obj.location is None

    def test_non_geometry_field_set_directly(self):
        """non-geometry fields are set without conversion."""
        obj = SimpleNamespace()
        apply_dict_update(obj, {"status": "DRAFT", "priority": 5})
        assert obj.status == "DRAFT"
        assert obj.priority == 5


class TestApplySchemaUpdate:
    """tests for apply_schema_update."""

    def test_delegates_to_apply_dict_update(self):
        """schema update converts and applies geometry fields to object."""
        obj = SimpleNamespace(name="old", location="old-ewkt")
        schema = FakeUpdateSchema(
            name="new",
            location={"type": "Point", "coordinates": [1.0, 2.0, 3.0]},
        )
        apply_schema_update(obj, schema)
        assert obj.name == "new"
        assert obj.location == "SRID=4326;POINTZ(1.0 2.0 3.0)"

    def test_excludes_unset_fields(self):
        """only explicitly set fields are applied."""
        obj = SimpleNamespace(name="original", location="keep-this")
        schema = FakeUpdateSchema(name="updated")
        apply_schema_update(obj, schema)
        assert obj.name == "updated"
        assert obj.location == "keep-this"
