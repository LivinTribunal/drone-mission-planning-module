import { describe, it, expect } from "vitest";
import { recomputeLockedDimension, solveTriangle } from "./angleLock";

describe("recomputeLockedDimension", () => {
  it("derives angle from height and distance (45° isosceles)", () => {
    const result = recomputeLockedDimension({
      inputs: { height: 10, distance: 10, angle: 0 },
      changed: "height",
      lockedOut: "angle",
    });
    expect(result.angle).toBeCloseTo(-45, 3);
    expect(result.height).toBe(10);
    expect(result.distance).toBe(10);
  });

  it("derives height from distance + angle", () => {
    const result = recomputeLockedDimension({
      inputs: { height: 0, distance: 20, angle: -45 },
      changed: "angle",
      lockedOut: "height",
    });
    expect(result.height).toBeCloseTo(20, 3);
    expect(result.distance).toBe(20);
    expect(result.angle).toBe(-45);
  });

  it("derives distance from height + angle", () => {
    const result = recomputeLockedDimension({
      inputs: { height: 10, distance: 0, angle: -45 },
      changed: "height",
      lockedOut: "distance",
    });
    expect(result.distance).toBeCloseTo(10, 3);
    expect(result.height).toBe(10);
    expect(result.angle).toBe(-45);
  });

  it("is a no-op when changed === lockedOut", () => {
    const inputs = { height: 5, distance: 15, angle: -18 };
    const result = recomputeLockedDimension({
      inputs,
      changed: "height",
      lockedOut: "height",
    });
    expect(result).toEqual(inputs);
  });

  it("guards divide-by-zero on distance", () => {
    const result = recomputeLockedDimension({
      inputs: { height: 10, distance: 0, angle: 0 },
      changed: "height",
      lockedOut: "angle",
    });
    expect(result.angle).toBe(0);
  });

  it("guards divide-by-zero on near-horizontal angle", () => {
    const result = recomputeLockedDimension({
      inputs: { height: 10, distance: 50, angle: 0 },
      changed: "angle",
      lockedOut: "distance",
    });
    // angle === 0 means tan() === 0, returned unchanged
    expect(result.distance).toBe(50);
  });
});

describe("solveTriangle", () => {
  it("derives angle from height and distance", () => {
    const out = solveTriangle({ height: 10, distance: 10 });
    expect(out.angle).toBeCloseTo(-45, 3);
  });

  it("derives height from distance and angle", () => {
    const out = solveTriangle({ distance: 20, angle: -30 });
    expect(out.height).toBeCloseTo(20 * Math.tan((30 * Math.PI) / 180), 3);
  });

  it("derives distance from height and angle", () => {
    const out = solveTriangle({ height: 10, angle: -45 });
    expect(out.distance).toBeCloseTo(10, 3);
  });
});
