import { describe, it, expect } from "vitest";
import { formatAglDisplayName } from "./agl";
import type { SurfaceType } from "@/types/enums";

describe("formatAglDisplayName", () => {
  it("formats PAPI on a runway as 'PAPI RWY {designator}'", () => {
    const agl = { agl_type: "PAPI", name: "PAPI 1" };
    const surface = { surface_type: "RUNWAY" as SurfaceType, identifier: "12/30" };
    expect(formatAglDisplayName(agl, surface)).toBe("PAPI RWY 12/30");
  });

  it("falls back to agl.name when surface is missing", () => {
    const agl = { agl_type: "PAPI", name: "PAPI 1" };
    expect(formatAglDisplayName(agl, undefined)).toBe("PAPI 1");
  });

  it("falls back to agl.name when surface is not a runway", () => {
    const agl = { agl_type: "PAPI", name: "PAPI 1" };
    const surface = { surface_type: "TAXIWAY" as SurfaceType, identifier: "A1" };
    expect(formatAglDisplayName(agl, surface)).toBe("PAPI 1");
  });

  it("falls back to agl.name when agl is not a PAPI", () => {
    const agl = { agl_type: "REIL", name: "REIL 1" };
    const surface = { surface_type: "RUNWAY" as SurfaceType, identifier: "06L/24R" };
    expect(formatAglDisplayName(agl, surface)).toBe("REIL 1");
  });
});
