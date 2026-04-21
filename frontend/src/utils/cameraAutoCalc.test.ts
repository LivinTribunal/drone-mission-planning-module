import { describe, it, expect } from "vitest";
import {
  computeOpticalZoom,
  distanceBetween,
  isZoomOverOptical,
  maxPairwiseDistanceM,
} from "./cameraAutoCalc";

describe("distanceBetween", () => {
  it("computes planar meters for close-by points", () => {
    // ~1 degree longitude at equator ~= 111 km
    const d = distanceBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it("includes altitude delta", () => {
    const d = distanceBetween({ lat: 0, lng: 0, alt: 0 }, { lat: 0, lng: 0, alt: 10 });
    expect(d).toBe(10);
  });
});

describe("maxPairwiseDistanceM", () => {
  it("returns 0 for a single position", () => {
    expect(maxPairwiseDistanceM([{ lat: 0, lng: 0 }])).toBe(0);
  });

  it("picks the largest pair in the set", () => {
    const positions = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.0001 },
      { lat: 0, lng: 0.0003 },
    ];
    const d = maxPairwiseDistanceM(positions);
    expect(d).toBeGreaterThan(30);
    expect(d).toBeLessThan(40);
  });
});

describe("computeOpticalZoom", () => {
  it("zooms to max when span is zero (single light)", () => {
    expect(computeOpticalZoom(50, 0, 84, 7)).toBe(7);
    expect(computeOpticalZoom(50, null, 84, 7)).toBe(7);
  });

  it("computes zoom that fits the lha span in frame", () => {
    // fov 60 deg, D=100 m: frameWidth@1x = 2*100*tan(30°) ~= 115.5 m.
    // span 10 m -> zoom = 115.5 / 10 ~= 11.5 (rounded to 0.5).
    const zoom = computeOpticalZoom(100, 10, 60, 15);
    expect(zoom).toBe(11.5);
  });

  it("clamps to max_optical_zoom", () => {
    // large distance + tiny span -> zoom would be huge, must clamp to 7
    expect(computeOpticalZoom(500, 1, 84, 7)).toBe(7);
  });

  it("clamps to OPTICAL_ZOOM_MIN when span is almost the full fov", () => {
    // span much larger than fov can fit
    expect(computeOpticalZoom(1, 100, 84, 7)).toBe(1);
  });

  it("returns null when inputs missing", () => {
    expect(computeOpticalZoom(null, 10, 84, 7)).toBeNull();
    expect(computeOpticalZoom(50, 10, null, 7)).toBeNull();
  });
});

describe("isZoomOverOptical", () => {
  it("true when zoom exceeds max", () => {
    expect(isZoomOverOptical(10, 7)).toBe(true);
  });
  it("false within limit", () => {
    expect(isZoomOverOptical(5, 7)).toBe(false);
    expect(isZoomOverOptical(7, 7)).toBe(false);
  });
  it("false when max is null", () => {
    expect(isZoomOverOptical(10, null)).toBe(false);
  });
});
