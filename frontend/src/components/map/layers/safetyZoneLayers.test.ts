import { describe, it, expect } from "vitest";
import { buildInvertedPolygon } from "./safetyZoneLayers";

describe("buildInvertedPolygon", () => {
  it("produces a world-covering outer ring with the boundary as a hole", () => {
    const boundary = {
      type: "Polygon" as const,
      coordinates: [
        [
          [14.25, 50.09, 0],
          [14.27, 50.09, 0],
          [14.27, 50.11, 0],
          [14.25, 50.11, 0],
          [14.25, 50.09, 0],
        ] as [number, number, number][],
      ] as [number, number, number][][],
    };

    const feature = buildInvertedPolygon(boundary);

    expect(feature.type).toBe("Feature");
    expect(feature.properties.entityType).toBe("airport_boundary");
    expect(feature.properties.role).toBe("mask");
    expect(feature.geometry.type).toBe("Polygon");

    const [outer, hole] = feature.geometry.coordinates;
    // world ring spans [-180, -90] to [180, 90]
    expect(outer).toEqual([
      [-180, -90],
      [180, -90],
      [180, 90],
      [-180, 90],
      [-180, -90],
    ]);

    // hole should be stripped to 2D and reversed relative to the source ring
    expect(hole.length).toBe(boundary.coordinates[0].length);
    for (const [x, y] of hole) {
      expect(typeof x).toBe("number");
      expect(typeof y).toBe("number");
    }

    // reversed winding: first hole vertex should equal last source vertex
    const source2d = boundary.coordinates[0].map((c) => [c[0], c[1]]);
    const reversed = [...source2d].reverse();
    expect(hole).toEqual(reversed);
  });

  it("handles empty coordinates defensively", () => {
    const feature = buildInvertedPolygon({
      type: "Polygon" as const,
      coordinates: [] as [number, number, number][][],
    });

    const [outer, hole] = feature.geometry.coordinates;
    expect(outer.length).toBe(5);
    expect(hole).toEqual([]);
  });
});
