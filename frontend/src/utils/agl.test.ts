import { describe, it, expect } from "vitest";
import { formatAglDisplayName } from "./agl";
import type { AglType } from "@/types/airport";
import type { SurfaceType } from "@/types/enums";

describe("formatAglDisplayName", () => {
  it("formats PAPI on a runway as 'PAPI RWY {designator}'", () => {
    const agl = { agl_type: "PAPI" as AglType, name: "PAPI 1" };
    const surface = { surface_type: "RUNWAY" as SurfaceType, identifier: "12/30" };
    expect(formatAglDisplayName(agl, surface)).toBe("PAPI RWY 12/30");
  });

  it("falls back to agl.name when surface is missing", () => {
    const agl = { agl_type: "PAPI" as AglType, name: "PAPI 1" };
    expect(formatAglDisplayName(agl, undefined)).toBe("PAPI 1");
  });

  it("falls back to agl.name when surface is not a runway", () => {
    const agl = { agl_type: "PAPI" as AglType, name: "PAPI 1" };
    const surface = { surface_type: "TAXIWAY" as SurfaceType, identifier: "A1" };
    expect(formatAglDisplayName(agl, surface)).toBe("PAPI 1");
  });

  it("falls back to agl.name when agl_type is unknown", () => {
    const agl = { agl_type: "CUSTOM" as unknown as AglType, name: "Custom 1" };
    const surface = { surface_type: "RUNWAY" as SurfaceType, identifier: "06L/24R" };
    expect(formatAglDisplayName(agl, surface)).toBe("Custom 1");
  });

  it("formats RUNWAY_EDGE_LIGHTS on a runway as 'EDGE LIGHTS RWY {designator}'", () => {
    const agl = { agl_type: "RUNWAY_EDGE_LIGHTS" as AglType, name: "Edge Left" };
    const surface = { surface_type: "RUNWAY" as SurfaceType, identifier: "06/24" };
    expect(formatAglDisplayName(agl, surface)).toBe("EDGE LIGHTS RWY 06/24");
  });
});
