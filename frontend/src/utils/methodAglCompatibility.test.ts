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
  it("PAPI accepts VERTICAL_PROFILE / ANGULAR_SWEEP", () => {
    expect(isMethodCompatibleWithAgl("VERTICAL_PROFILE", "PAPI")).toBe(true);
    expect(isMethodCompatibleWithAgl("ANGULAR_SWEEP", "PAPI")).toBe(true);
  });

  it("PAPI rejects FLY_OVER, PARALLEL_SIDE_SWEEP, and HOVER_POINT_LOCK", () => {
    expect(isMethodCompatibleWithAgl("FLY_OVER", "PAPI")).toBe(false);
    expect(isMethodCompatibleWithAgl("PARALLEL_SIDE_SWEEP", "PAPI")).toBe(false);
    expect(isMethodCompatibleWithAgl("HOVER_POINT_LOCK", "PAPI")).toBe(false);
  });

  it("RUNWAY_EDGE_LIGHTS accepts FLY_OVER / PARALLEL_SIDE_SWEEP", () => {
    expect(isMethodCompatibleWithAgl("FLY_OVER", "RUNWAY_EDGE_LIGHTS")).toBe(true);
    expect(isMethodCompatibleWithAgl("PARALLEL_SIDE_SWEEP", "RUNWAY_EDGE_LIGHTS")).toBe(true);
  });

  it("RUNWAY_EDGE_LIGHTS rejects VERTICAL_PROFILE, ANGULAR_SWEEP, and HOVER_POINT_LOCK", () => {
    expect(isMethodCompatibleWithAgl("VERTICAL_PROFILE", "RUNWAY_EDGE_LIGHTS")).toBe(false);
    expect(isMethodCompatibleWithAgl("ANGULAR_SWEEP", "RUNWAY_EDGE_LIGHTS")).toBe(false);
    expect(isMethodCompatibleWithAgl("HOVER_POINT_LOCK", "RUNWAY_EDGE_LIGHTS")).toBe(false);
  });
});

describe("methodsForAgl / aglTypesForMethod", () => {
  it("methodsForAgl returns two AGL-specific methods per type", () => {
    expect(methodsForAgl("PAPI")).toHaveLength(2);
    expect(methodsForAgl("RUNWAY_EDGE_LIGHTS")).toHaveLength(2);
  });

  it("aglTypesForMethod matches matrix entries", () => {
    expect(aglTypesForMethod("HOVER_POINT_LOCK")).toEqual([]);
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
    expect(result).toEqual(["VERTICAL_PROFILE"]);
  });

  it("returns empty when mixed AGL types are required", () => {
    const result = compatibleMethods(
      ["VERTICAL_PROFILE", "FLY_OVER", "HOVER_POINT_LOCK"],
      ["PAPI", "RUNWAY_EDGE_LIGHTS"],
    );
    expect(result).toEqual([]);
  });

  it("empty agl list returns all methods", () => {
    const all = ["VERTICAL_PROFILE", "FLY_OVER"] as const;
    expect(compatibleMethods([...all], [])).toEqual([...all]);
  });
});

describe("matrix shape", () => {
  it("every AGL-specific method has at least one compatible AGL type", () => {
    for (const [method, allowed] of Object.entries(METHOD_AGL_COMPAT)) {
      if (method === "HOVER_POINT_LOCK") {
        expect(allowed).toHaveLength(0);
      } else {
        expect(allowed.length).toBeGreaterThan(0);
      }
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
