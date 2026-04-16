import { describe, it, expect } from "vitest";
import {
  computePlacementUpdates,
  computeMirrorLandingUpdate,
  placementKeysFromUpdates,
} from "./takeoffLandingPlacement";
import { MapTool } from "@/hooks/useMapTools";
import type { PointZ } from "@/types/common";

function pointZ(lon: number, lat: number, alt: number): PointZ {
  return { type: "Point", coordinates: [lon, lat, alt] };
}

describe("computePlacementUpdates", () => {
  it("returns null for non-placement tools", () => {
    const result = computePlacementUpdates(
      MapTool.SELECT,
      { lng: 17.21, lat: 48.17 },
      { takeoff_coordinate: null, landing_coordinate: null },
      100,
      false,
    );
    expect(result).toBeNull();
  });

  it("writes takeoff_coordinate for PLACE_TAKEOFF", () => {
    const result = computePlacementUpdates(
      MapTool.PLACE_TAKEOFF,
      { lng: 17.21, lat: 48.17 },
      { takeoff_coordinate: null, landing_coordinate: null },
      100,
      false,
    );
    expect(result).toEqual({
      takeoff_coordinate: pointZ(17.21, 48.17, 100),
    });
    expect(result).not.toHaveProperty("landing_coordinate");
  });

  it("writes landing_coordinate for PLACE_LANDING", () => {
    const result = computePlacementUpdates(
      MapTool.PLACE_LANDING,
      { lng: 17.21, lat: 48.17 },
      { takeoff_coordinate: null, landing_coordinate: null },
      100,
      false,
    );
    expect(result).toEqual({
      landing_coordinate: pointZ(17.21, 48.17, 100),
    });
    expect(result).not.toHaveProperty("takeoff_coordinate");
  });

  it("preserves the existing marker altitude instead of using airport elevation", () => {
    const result = computePlacementUpdates(
      MapTool.PLACE_TAKEOFF,
      { lng: 17.21, lat: 48.17 },
      {
        takeoff_coordinate: pointZ(20, 50, 420),
        landing_coordinate: null,
      },
      100,
      false,
    );
    expect(result?.takeoff_coordinate?.coordinates[2]).toBe(420);
  });

  it("falls back to 0 when no existing marker and no airport elevation", () => {
    const result = computePlacementUpdates(
      MapTool.PLACE_LANDING,
      { lng: 0, lat: 0 },
      { takeoff_coordinate: null, landing_coordinate: null },
      null,
      false,
    );
    expect(result?.landing_coordinate?.coordinates[2]).toBe(0);
  });

  it("falls back to 0 when airport elevation is undefined", () => {
    const result = computePlacementUpdates(
      MapTool.PLACE_LANDING,
      { lng: 0, lat: 0 },
      { takeoff_coordinate: null, landing_coordinate: null },
      undefined,
      false,
    );
    expect(result?.landing_coordinate?.coordinates[2]).toBe(0);
  });

  it("mirrors takeoff into landing when useTakeoffAsLanding is true", () => {
    const result = computePlacementUpdates(
      MapTool.PLACE_TAKEOFF,
      { lng: 17.21, lat: 48.17 },
      { takeoff_coordinate: null, landing_coordinate: null },
      100,
      true,
    );
    expect(result?.takeoff_coordinate).toEqual(pointZ(17.21, 48.17, 100));
    expect(result?.landing_coordinate).toEqual(pointZ(17.21, 48.17, 100));
    // same value object reference is fine - both keys write the same coord
    expect(result?.takeoff_coordinate).toBe(result?.landing_coordinate);
  });

  it("does NOT mirror into takeoff when PLACE_LANDING is clicked with useTakeoffAsLanding on", () => {
    const result = computePlacementUpdates(
      MapTool.PLACE_LANDING,
      { lng: 17.21, lat: 48.17 },
      { takeoff_coordinate: pointZ(5, 5, 5), landing_coordinate: null },
      100,
      true,
    );
    expect(result).not.toHaveProperty("takeoff_coordinate");
    expect(result?.landing_coordinate).toEqual(pointZ(17.21, 48.17, 100));
  });
});

describe("computeMirrorLandingUpdate", () => {
  it("returns null when no takeoff coordinate is set", () => {
    expect(computeMirrorLandingUpdate(null)).toBeNull();
    expect(computeMirrorLandingUpdate(undefined)).toBeNull();
  });

  it("clones the takeoff coordinates into a fresh landing payload", () => {
    const takeoff = pointZ(17.21, 48.17, 133);
    const result = computeMirrorLandingUpdate(takeoff);
    expect(result).toEqual({ landing_coordinate: takeoff });
    // the clone must not be the same object reference as the input
    expect(result?.landing_coordinate).not.toBe(takeoff);
    expect(result?.landing_coordinate.coordinates).not.toBe(takeoff.coordinates);
  });
});

describe("placementKeysFromUpdates", () => {
  it("returns empty array for an empty updates object", () => {
    expect(placementKeysFromUpdates({})).toEqual([]);
  });

  it("returns only takeoff when only takeoff_coordinate is set", () => {
    expect(
      placementKeysFromUpdates({ takeoff_coordinate: pointZ(0, 0, 0) }),
    ).toEqual(["takeoff"]);
  });

  it("returns only landing when only landing_coordinate is set", () => {
    expect(
      placementKeysFromUpdates({ landing_coordinate: pointZ(0, 0, 0) }),
    ).toEqual(["landing"]);
  });

  it("returns both in order when the updates set both coordinates", () => {
    expect(
      placementKeysFromUpdates({
        takeoff_coordinate: pointZ(0, 0, 0),
        landing_coordinate: pointZ(0, 0, 0),
      }),
    ).toEqual(["takeoff", "landing"]);
  });
});
