# Map Symbology

Visual conventions for airport features rendered on the coordinator / operator
MapLibre surface. Colors reference the design-system CSS variables where
applicable; hard-coded hex values are listed for layer paint expressions that
cannot reference CSS variables.

## Runways

- **Fill**: `#4a4a4a` at 0.5 opacity
- **Stroke**: `#6a6a6a` at 0.6 opacity, 1.5px
- **Centerline dashes**: `#ffffff` at 0.7 opacity, `[8, 8]` dash pattern
- **Label**: "RWY {identifier}", 13pt, white on black halo

## Taxiways

- **Fill**: `#c8a83c` at 0.35 opacity
- **Stroke**: `#b8a038` at 0.5 opacity, 1px
- **Centerline dashes**: `#1a1a1a` at 0.6 opacity, `[6, 6]` dash pattern
- **Label**: "TWY {identifier}", 11pt, amber on black halo

## Runway Touchpoint (TDP)

Rendered only when `touchpoint_latitude` and `touchpoint_longitude` are set on
the surface.

- **Marker**: yellow (`#ffd700`) filled circle, 8px radius, 1px black stroke
- **Label**: "TDP", 10pt yellow on black halo, offset above the marker
- **Purpose**: reference point used for future video post-processing (landing
  threshold crossing estimation). Does not affect trajectory generation.

## AGL Systems

### PAPI

- **Marker**: magenta square icon (`agl-square` sprite)
- **Label**: `{name}` (e.g. "PAPI RWY 06/24"), magenta on black halo
- **LHA units**: magenta filled circles, 6px radius. Labelled individually
  (`LHA {n} ({angle}°)`).

### Runway Edge Lights

- **Marker**: same magenta square icon as PAPI
- **Label**: `{name}` (e.g. "EDGE LIGHTS RWY 06/24")
- **LHA units**: magenta filled circles, 4px radius. Unit labels suppressed
  (a single row can contain 30+ lights — individual labels would clutter the
  map).
- **Connecting line**: magenta (`#e91e90`) line at 0.3 opacity, 1px,
  drawn between the first and last LHA of the row for quick orientation.

## Obstacles

See `obstacleLayers.ts` — color is driven by obstacle type. The touchpoint
marker intentionally uses a distinct yellow palette so it is not mistaken for
an obstacle.

## Safety Zones

See `safetyZoneLayers.ts` — each zone type has its own fill/stroke palette.

## Zoom-Level Visibility

- LHA circles and labels fade in between zoom 14 → 15 to avoid overwhelming
  the map at airport-overview scale.
- AGL icons fade out between zoom 14 → 15, yielding to the individual LHA
  markers as the user zooms in.
- Touchpoints are always visible — they are a single point per runway.

## Color Reference

| Purpose              | Hex       |
|----------------------|-----------|
| Runway fill          | `#4a4a4a` |
| Runway stroke        | `#6a6a6a` |
| Runway centerline    | `#ffffff` |
| Taxiway fill         | `#c8a83c` |
| Taxiway stroke       | `#b8a038` |
| Taxiway label        | `#d4b84a` |
| AGL / LHA magenta    | `#e91e90` |
| Touchpoint yellow    | `#ffd700` |
