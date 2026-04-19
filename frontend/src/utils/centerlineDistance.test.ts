import { describe, it, expect } from "vitest";
import { distanceFromCenterline } from "./centerlineDistance";

describe("distanceFromCenterline", () => {
  const centerline: number[][] = [
    [17.0, 48.0, 0],
    [17.001, 48.0, 0],
  ];

  it("returns infinity for a single-point centerline", () => {
    expect(distanceFromCenterline([17.0, 48.0], [[17.0, 48.0, 0]])).toBe(Infinity);
  });

  it("returns infinity for an empty centerline", () => {
    expect(distanceFromCenterline([17.0, 48.0], [])).toBe(Infinity);
  });

  it("returns ~0 for a point on the segment", () => {
    const dist = distanceFromCenterline([17.0005, 48.0], centerline);
    expect(dist).toBeLessThan(1);
  });

  it("returns correct distance for a point perpendicular to segment midpoint", () => {
    const dist = distanceFromCenterline([17.0005, 48.001], centerline);
    expect(dist).toBeGreaterThan(50);
    expect(dist).toBeLessThan(200);
  });

  it("returns distance to nearest endpoint when point is past segment end", () => {
    const dist = distanceFromCenterline([17.002, 48.0], centerline);
    expect(dist).toBeGreaterThan(50);
  });

  it("handles zero-length segment", () => {
    const zeroLen: number[][] = [
      [17.0, 48.0, 0],
      [17.0, 48.0, 0],
    ];
    const dist = distanceFromCenterline([17.001, 48.0], zeroLen);
    expect(dist).toBeGreaterThan(0);
    expect(Number.isFinite(dist)).toBe(true);
  });

  it("handles multi-segment centerline", () => {
    const multiSeg: number[][] = [
      [17.0, 48.0, 0],
      [17.001, 48.0, 0],
      [17.002, 48.001, 0],
    ];
    const dist = distanceFromCenterline([17.001, 48.0], multiSeg);
    expect(dist).toBeLessThan(1);
  });
});
