// one color per AGL system type
const AGL_COLOR_BY_TYPE: Record<string, string> = {
  PAPI: "#e91e90",
  RUNWAY_EDGE_LIGHTS: "#f7b32b",
};

const DEFAULT_AGL_COLOR = "#e91e90";

export function aglColorForType(aglType: string | null | undefined): string {
  /** return the canonical color for an AGL system type. */
  if (!aglType) return DEFAULT_AGL_COLOR;
  return AGL_COLOR_BY_TYPE[aglType] ?? DEFAULT_AGL_COLOR;
}
