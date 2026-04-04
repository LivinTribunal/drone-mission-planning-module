import { describe, it, expect } from "vitest";
import { bufferLineString } from "./surfaceLayers";

describe("bufferLineString", () => {
  it("returns empty array for fewer than 2 points", () => {
    expect(bufferLineString([[0, 0]], 30)).toEqual([]);
    expect(bufferLineString([], 30)).toEqual([]);
  });

  it("buffers a straight north-south linestring", () => {
    // two points along the same longitude (north-south line)
    const coords = [
      [14.0, 50.0],
      [14.0, 50.001],
    ];
    const result = bufferLineString(coords, 60);

    // should produce a closed polygon ring (5 points for 2-segment buffer)
    expect(result.length).toBe(5);
    expect(result[0]).toEqual(result[result.length - 1]);

    // all left-side points should have lng > 14.0, right-side lng < 14.0
    // for a N-S line, perpendicular offset is east-west
    const leftPoints = result.slice(0, 2);
    const rightPoints = result.slice(2, 4);
    for (const p of leftPoints) {
      expect(p[0]).not.toBe(14.0);
    }
    for (const p of rightPoints) {
      expect(p[0]).not.toBe(14.0);
    }
  });

  it("buffers a diagonal linestring", () => {
    const coords = [
      [14.0, 50.0],
      [14.001, 50.001],
    ];
    const result = bufferLineString(coords, 40);

    expect(result.length).toBe(5);
    expect(result[0]).toEqual(result[result.length - 1]);

    // polygon should have area - left and right offsets should differ
    const lats = result.map((p) => p[1]);
    const lngs = result.map((p) => p[0]);
    expect(Math.max(...lats) - Math.min(...lats)).toBeGreaterThan(0);
    expect(Math.max(...lngs) - Math.min(...lngs)).toBeGreaterThan(0);
  });

  it("produces a polygon with reasonable width", () => {
    // east-west line at equator for easy math
    const coords = [
      [0.0, 0.0],
      [0.001, 0.0],
    ];
    const widthMeters = 100;
    const result = bufferLineString(coords, widthMeters);

    // the perpendicular offset should be roughly 50m in lat degrees
    // 1 degree lat ~ 111320m, so 50m ~ 0.000449 degrees
    const expectedOffset = 50 / 111320;
    const topLat = Math.max(...result.map((p) => p[1]));
    const bottomLat = Math.min(...result.map((p) => p[1]));
    const actualHalfWidth = (topLat - bottomLat) / 2;

    expect(actualHalfWidth).toBeCloseTo(expectedOffset, 5);
  });
});
