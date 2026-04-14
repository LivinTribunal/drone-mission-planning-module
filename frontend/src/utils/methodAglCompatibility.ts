import type { AglType } from "@/types/airport";
import type { InspectionMethod } from "@/types/enums";

// inspection method -> set of compatible AGL types
export const METHOD_AGL_COMPAT: Record<InspectionMethod, AglType[]> = {
  VERTICAL_PROFILE: ["PAPI"],
  ANGULAR_SWEEP: ["PAPI"],
  HOVER_POINT_LOCK: ["PAPI", "RUNWAY_EDGE_LIGHTS"],
  FLY_OVER: ["RUNWAY_EDGE_LIGHTS"],
  PARALLEL_SIDE_SWEEP: ["RUNWAY_EDGE_LIGHTS"],
};

// all methods by AGL type (useful for the 2-step picker)
export const METHODS_BY_AGL: Record<AglType, InspectionMethod[]> = {
  PAPI: ["VERTICAL_PROFILE", "ANGULAR_SWEEP", "HOVER_POINT_LOCK"],
  RUNWAY_EDGE_LIGHTS: ["FLY_OVER", "PARALLEL_SIDE_SWEEP", "HOVER_POINT_LOCK"],
};

export function isMethodCompatibleWithAgl(
  method: InspectionMethod,
  agl: AglType,
): boolean {
  const allowed = METHOD_AGL_COMPAT[method];
  return allowed ? allowed.includes(agl) : false;
}

export function methodsForAgl(agl: AglType): InspectionMethod[] {
  return METHODS_BY_AGL[agl] ?? [];
}

export function aglTypesForMethod(method: InspectionMethod): AglType[] {
  return METHOD_AGL_COMPAT[method] ?? [];
}

// given an allowed-methods list (e.g. template.methods), filter by AGL
export function compatibleMethods(
  methods: InspectionMethod[],
  agls: AglType[],
): InspectionMethod[] {
  return methods.filter((m) =>
    agls.every((a) => isMethodCompatibleWithAgl(m, a)),
  );
}
