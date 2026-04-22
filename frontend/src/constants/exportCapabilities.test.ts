import { describe, it, expect } from "vitest";
import {
  GEOZONE_ADVISORY_FORMATS,
  GEOZONE_CAPABLE_FORMATS,
  GEOZONE_ENFORCED_FORMATS,
  anyGeozoneAdvisory,
  anyGeozoneCapable,
  anyGeozoneEnforced,
  isGeozoneCapableFormat,
} from "./exportCapabilities";

describe("exportCapabilities", () => {
  it("declares the expected capability sets", () => {
    expect([...GEOZONE_CAPABLE_FORMATS].sort()).toEqual(
      ["JSON", "KML", "KMZ", "MAVLINK", "UGCS"],
    );
    expect([...GEOZONE_ENFORCED_FORMATS].sort()).toEqual(["JSON", "MAVLINK", "UGCS"]);
    expect([...GEOZONE_ADVISORY_FORMATS].sort()).toEqual(["KML", "KMZ"]);
  });

  it("isGeozoneCapableFormat returns true for capable formats", () => {
    expect(isGeozoneCapableFormat("MAVLINK")).toBe(true);
    expect(isGeozoneCapableFormat("WPML")).toBe(false);
  });

  it("anyGeozoneCapable returns true when any member is capable", () => {
    expect(anyGeozoneCapable(["GPX", "MAVLINK"])).toBe(true);
    expect(anyGeozoneCapable(["GPX", "CSV"])).toBe(false);
  });

  it("anyGeozoneEnforced separates enforced from advisory formats", () => {
    expect(anyGeozoneEnforced(["KMZ"])).toBe(false);
    expect(anyGeozoneEnforced(["KMZ", "JSON"])).toBe(true);
  });

  it("anyGeozoneAdvisory flags kml/kmz selections", () => {
    expect(anyGeozoneAdvisory(["MAVLINK"])).toBe(false);
    expect(anyGeozoneAdvisory(["KML"])).toBe(true);
  });
});
