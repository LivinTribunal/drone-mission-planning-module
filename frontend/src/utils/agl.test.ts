import { describe, it, expect } from "vitest";
import { formatAglDisplayName } from "./agl";
import type { AglType } from "@/types/airport";
import type { PAPISide, SurfaceType } from "@/types/enums";

describe("formatAglDisplayName", () => {
  it("formats PAPI on a runway as 'PAPI RWY {designator}'", () => {
    const agl = { agl_type: "PAPI" as AglType, name: "PAPI 1", side: null };
    const surface = { surface_type: "RUNWAY" as SurfaceType, identifier: "12/30" };
    expect(formatAglDisplayName(agl, surface)).toBe("PAPI RWY 12/30");
  });

  it("formats PAPI with side on a runway", () => {
    const agl = { agl_type: "PAPI" as AglType, name: "PAPI 1", side: "LEFT" as PAPISide };
    const surface = { surface_type: "RUNWAY" as SurfaceType, identifier: "12/30" };
    expect(formatAglDisplayName(agl, surface)).toBe("PAPI RWY 12/30 (Left side)");
  });

  it("falls back to agl.name when surface is missing", () => {
    const agl = { agl_type: "PAPI" as AglType, name: "PAPI 1", side: null };
    expect(formatAglDisplayName(agl, undefined)).toBe("PAPI 1");
  });

  it("falls back to agl.name with side when surface is missing", () => {
    const agl = { agl_type: "PAPI" as AglType, name: "PAPI 1", side: "RIGHT" as PAPISide };
    expect(formatAglDisplayName(agl, undefined)).toBe("PAPI 1 (Right side)");
  });

  it("falls back to agl.name when surface is not a runway", () => {
    const agl = { agl_type: "PAPI" as AglType, name: "PAPI 1", side: null };
    const surface = { surface_type: "TAXIWAY" as SurfaceType, identifier: "A1" };
    expect(formatAglDisplayName(agl, surface)).toBe("PAPI 1");
  });

  it("falls back to agl.name when agl_type is unknown", () => {
    const agl = { agl_type: "CUSTOM" as unknown as AglType, name: "Custom 1", side: null };
    const surface = { surface_type: "RUNWAY" as SurfaceType, identifier: "06L/24R" };
    expect(formatAglDisplayName(agl, surface)).toBe("Custom 1");
  });

  it("formats RUNWAY_EDGE_LIGHTS on a runway as 'REL RWY {designator}'", () => {
    const agl = { agl_type: "RUNWAY_EDGE_LIGHTS" as AglType, name: "Edge Left", side: null };
    const surface = { surface_type: "RUNWAY" as SurfaceType, identifier: "06/24" };
    expect(formatAglDisplayName(agl, surface)).toBe("REL RWY 06/24");
  });

  it("formats RUNWAY_EDGE_LIGHTS with side on a runway", () => {
    const agl = { agl_type: "RUNWAY_EDGE_LIGHTS" as AglType, name: "Edge Left", side: "LEFT" as PAPISide };
    const surface = { surface_type: "RUNWAY" as SurfaceType, identifier: "06/24" };
    expect(formatAglDisplayName(agl, surface)).toBe("REL RWY 06/24 (Left side)");
  });

  it("falls back to empty string name when agl.name is empty", () => {
    const agl = { agl_type: "PAPI" as AglType, name: "", side: null };
    const surface = { surface_type: "TAXIWAY" as SurfaceType, identifier: "B2" };
    expect(formatAglDisplayName(agl, surface)).toBe("");
  });

  it("falls back to agl.name when surface identifier is empty string", () => {
    const agl = { agl_type: "PAPI" as AglType, name: "PAPI 1", side: null };
    const surface = { surface_type: "RUNWAY" as SurfaceType, identifier: "" };
    expect(formatAglDisplayName(agl, surface)).toBe("PAPI 1");
  });
});
