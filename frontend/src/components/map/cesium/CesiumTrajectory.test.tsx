import { describe, it, expect, vi } from "vitest";

// minimal cesium mock - jsdom lacks WebGL, and we only need shape/constants
// for the pure buildPolylineOptions helper under test.
vi.mock("cesium", () => {
  class Color {
    constructor(public r = 1, public g = 1, public b = 1, public a = 1) {}
    withAlpha(a: number) {
      return new Color(this.r, this.g, this.b, a);
    }
    static fromCssColorString(s: string) {
      void s;
      return new Color();
    }
    static WHITE = new Color();
    static BLACK = new Color();
    static CYAN = new Color();
    static TRANSPARENT = new Color(0, 0, 0, 0);
  }
  class PolylineDashMaterialProperty {
    constructor(public options?: { color?: Color; dashLength?: number }) {}
  }
  const Cartesian3 = {
    fromDegrees: (lng: number, lat: number, alt: number) => ({ lng, lat, alt }),
  };
  const Cartesian2 = class {
    constructor(public x = 0, public y = 0) {}
  };
  const NearFarScalar = class {
    constructor(public n = 0, public nv = 0, public f = 0, public fv = 0) {}
  };
  const PropertyBag = class {
    addProperty = vi.fn();
  };
  const CustomDataSource = class {
    entities = { add: vi.fn(), removeAll: vi.fn() };
    constructor(public name?: string) {}
  };
  return {
    ArcType: { NONE: 0, GEODESIC: 1, RHUMB: 2 },
    HeightReference: { NONE: 0, CLAMP_TO_GROUND: 1, RELATIVE_TO_GROUND: 2 },
    Cartesian3,
    Cartesian2,
    Color,
    LabelStyle: { FILL: 0, FILL_AND_OUTLINE: 1 },
    VerticalOrigin: { CENTER: 0, BOTTOM: 1 },
    NearFarScalar,
    CustomDataSource,
    PropertyBag,
    PolylineDashMaterialProperty,
  };
});

vi.mock("resium", () => ({
  useCesium: () => ({ viewer: null }),
}));

import { ArcType, Cartesian3, Color, PolylineDashMaterialProperty } from "cesium";
import { buildPolylineOptions } from "./CesiumTrajectory";

describe("buildPolylineOptions", () => {
  it("always sets clampToGround to false", () => {
    const positions = [
      Cartesian3.fromDegrees(0, 0, 100),
      Cartesian3.fromDegrees(1, 1, 200),
    ];
    const color = new Color();
    const opts = buildPolylineOptions(positions, 3, color, color);
    expect(opts.polyline).toBeDefined();
    // deliberately loose type cast - polyline options in cesium accept
    // a plain object with these fields at runtime
    const polyline = opts.polyline as { clampToGround: boolean; arcType: unknown };
    expect(polyline.clampToGround).toBe(false);
  });

  it("uses ArcType.NONE so lines do not follow the earth curvature onto terrain", () => {
    const positions = [
      Cartesian3.fromDegrees(10, 20, 500),
      Cartesian3.fromDegrees(10.5, 20.5, 600),
    ];
    const color = new Color();
    const opts = buildPolylineOptions(positions, 2, color, color);
    const polyline = opts.polyline as { arcType: number };
    expect(polyline.arcType).toBe(ArcType.NONE);
    expect(polyline.arcType).not.toBe(ArcType.GEODESIC);
  });

  it("preserves positions, width, material, and depthFailMaterial", () => {
    const positions = [
      Cartesian3.fromDegrees(0, 0, 0),
      Cartesian3.fromDegrees(1, 1, 1),
    ];
    const material = new Color();
    const depthFailMaterial = new PolylineDashMaterialProperty({
      color: material,
      dashLength: 8,
    });
    const opts = buildPolylineOptions(positions, 5, material, depthFailMaterial);
    const polyline = opts.polyline as {
      positions: unknown;
      width: number;
      material: unknown;
      depthFailMaterial: unknown;
    };
    expect(polyline.positions).toBe(positions);
    expect(polyline.width).toBe(5);
    expect(polyline.material).toBe(material);
    expect(polyline.depthFailMaterial).toBe(depthFailMaterial);
  });

  it("does not flatten altitude - Cartesian3 positions retain their z component", () => {
    // simulate a waypoint 50m above terrain
    const airportElevation = 381;
    const waypointMsl = airportElevation + 50;
    const positions = [
      Cartesian3.fromDegrees(-0.4543, 51.47, airportElevation),
      Cartesian3.fromDegrees(-0.4543, 51.47, waypointMsl),
    ] as unknown as Array<{ alt: number }>;
    const color = new Color();
    const opts = buildPolylineOptions(
      positions as unknown as Cartesian3[],
      2,
      color,
      color,
    );
    const polyline = opts.polyline as unknown as { positions: Array<{ alt: number }> };
    expect(polyline.positions[0].alt).toBe(airportElevation);
    expect(polyline.positions[1].alt).toBe(waypointMsl);
    expect(polyline.positions[1].alt).toBeGreaterThan(polyline.positions[0].alt);
  });
});
