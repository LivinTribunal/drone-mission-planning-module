# Map Symbology

## Airport Boundary

The airport boundary defines the operational perimeter of the airport. The drone
must remain inside this polygon. Visually it renders as the **inverse** of a
safety zone: the region outside the polygon is shaded, the inside is transparent.

### Data model

- Stored in the `safety_zone` table with `type = 'AIRPORT_BOUNDARY'`.
- One boundary per airport. The `Airport` aggregate-root invariant rejects a
  second boundary with HTTP 409.
- `altitude_floor` / `altitude_ceiling` are ignored for this type.

### MapLibre rendering

Use a `Polygon` feature whose outer ring covers the whole world and whose inner
ring (reversed winding) is the airport boundary, producing a "donut" where the
boundary is a hole:

```ts
{
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [
      [[-180,-90],[180,-90],[180,90],[-180,90],[-180,-90]], // outer
      reverseRing(boundaryOuterRing)                         // hole
    ]
  }
}
```

Two map layers are stacked on the resulting source:

| Layer                         | Type | Paint                                                          |
|-------------------------------|------|----------------------------------------------------------------|
| `airport-boundary-fill`       | fill | `fill-color: #000`, `fill-opacity: 0.4`, `fill-antialias: false` |
| `airport-boundary-line`       | line | `line-color: #fff`, `line-width: 2`, `line-dasharray: [4, 4]`    |

The fill layer filters on `role == "mask"` (the inverted polygon feature). The
line layer filters on `role == "outline"` (the original boundary geometry, no
hole), so the dashed border tracks the boundary edges only.

### 3D view (CesiumJS)

Not wired yet in this repo. When Cesium integration lands, mirror the concept:
either a polygon-with-hole over the terrain, or Cesium clipping planes to darken
everything outside the boundary footprint.

### Layer panel / legend

The existing "Safety Zones" toggle also controls the airport boundary. The label
becomes "Safety Zones & Boundary" (`layers.safetyZonesAndBoundary`). The legend
adds a dashed-rectangle swatch with the "Airport Boundary" label.

### Validation

`GeofenceConstraint` / `_batch_check_zones` treat `AIRPORT_BOUNDARY` with
inverted `ST_Contains` semantics - a waypoint **not** contained in the boundary
polygon is a hard `geofence` violation. Regular safety zones keep their existing
containment-is-violation behaviour.
