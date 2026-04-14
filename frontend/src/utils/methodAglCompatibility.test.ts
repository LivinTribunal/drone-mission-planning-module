import { describe, it, expect } from "vitest";
import {
  METHOD_AGL_COMPAT,
  METHODS_BY_AGL,
  aglTypesForMethod,
  compatibleMethods,
  isMethodCompatibleWithAgl,
  methodsForAgl,
} from "./methodAglCompatibility";

describe("isMethodCompatibleWithAgl", () => {
  it("PAPI accepts VERTICAL_PROFILE / ANGULAR_SWEEP / HOVER_POINT_LOCK", () => {
    expect(isMethodCompatibleWithAgl("VERTICAL_PROFILE", "PAPI")).toBe(true);
    expect(isMethodCompatibleWithAgl("ANGULAR_SWEEP", "PAPI")).toBe(true);
    expect(isMethodCompatibleWithAgl("HOVER_POINT_LOCK", "PAPI")).toBe(true);
  });

  it("PAPI rejects FLY_OVER and PARALLEL_SIDE_SWEEP", () => {
    expect(isMethodCompatibleWithAgl("FLY_OVER", "PAPI")).toBe(false);
    expect(isMethodCompatibleWithAgl("PARALLEL_SIDE_SWEEP", "PAPI")).toBe(false);
  });

  it("RUNWAY_EDGE_LIGHTS accepts FLY_OVER / PARALLEL_SIDE_SWEEP / HOVER_POINT_LOCK", () => {
    expect(isMethodCompatibleWithAgl("FLY_OVER", "RUNWAY_EDGE_LIGHTS")).toBe(true);
    expect(isMethodCompatibleWithAgl("PARALLEL_SIDE_SWEEP", "RUNWAY_EDGE_LIGHTS")).toBe(true);
    expect(isMethodCompatibleWithAgl("HOVER_POINT_LOCK", "RUNWAY_EDGE_LIGHTS")).toBe(true);
  });

  it("RUNWAY_EDGE_LIGHTS rejects VERTICAL_PROFILE and ANGULAR_SWEEP", () => {
    expect(isMethodCompatibleWithAgl("VERTICAL_PROFILE", "RUNWAY_EDGE_LIGHTS")).toBe(false);
    expect(isMethodCompatibleWithAgl("ANGULAR_SWEEP", "RUNWAY_EDGE_LIGHTS")).toBe(false);
  });
});

describe("methodsForAgl / aglTypesForMethod", () => {
  it("methodsForAgl returns all three for each AGL type", () => {
    expect(methodsForAgl("PAPI")).toHaveLength(3);
    expect(methodsForAgl("RUNWAY_EDGE_LIGHTS")).toHaveLength(3);
  });

  it("aglTypesForMethod matches matrix entries", () => {
    expect(aglTypesForMethod("HOVER_POINT_LOCK")).toEqual([
      "PAPI",
      "RUNWAY_EDGE_LIGHTS",
    ]);
    expect(aglTypesForMethod("VERTICAL_PROFILE")).toEqual(["PAPI"]);
    expect(aglTypesForMethod("FLY_OVER")).toEqual(["RUNWAY_EDGE_LIGHTS"]);
  });
});

describe("compatibleMethods", () => {
  it("filters a method list by required AGL set (single)", () => {
    const result = compatibleMethods(
      ["VERTICAL_PROFILE", "FLY_OVER", "HOVER_POINT_LOCK"],
      ["PAPI"],
    );
    expect(result).toEqual(["VERTICAL_PROFILE", "HOVER_POINT_LOCK"]);
  });

  it("returns only HOVER_POINT_LOCK when mixed AGL types are required", () => {
    const result = compatibleMethods(
      ["VERTICAL_PROFILE", "FLY_OVER", "HOVER_POINT_LOCK"],
      ["PAPI", "RUNWAY_EDGE_LIGHTS"],
    );
    expect(result).toEqual(["HOVER_POINT_LOCK"]);
  });

  it("empty agl list returns all methods", () => {
    const all = ["VERTICAL_PROFILE", "FLY_OVER"] as const;
    expect(compatibleMethods([...all], [])).toEqual([...all]);
  });
});

describe("matrix shape", () => {
  it("every method has at least one compatible AGL type", () => {
    for (const allowed of Object.values(METHOD_AGL_COMPAT)) {
      expect(allowed.length).toBeGreaterThan(0);
    }
  });

  it("METHODS_BY_AGL is the inverse of METHOD_AGL_COMPAT", () => {
    for (const [method, agls] of Object.entries(METHOD_AGL_COMPAT)) {
      for (const agl of agls) {
        expect(METHODS_BY_AGL[agl]).toContain(method);
      }
    }
  });
});
