import type { AGLResponse, SurfaceResponse } from "@/types/airport";

/** format side suffix like " (Left side)" when side is present. */
function sideSuffix(side?: string | null): string {
  if (!side) return "";
  return ` (${side.charAt(0)}${side.slice(1).toLowerCase()} side)`;
}

/** format an AGL display name based on type, side, and surface context. */
export function formatAglDisplayName(
  agl: Pick<AGLResponse, "agl_type" | "name" | "side">,
  surface?: Pick<SurfaceResponse, "surface_type" | "identifier"> | null,
): string {
  const isRunway = surface?.surface_type === "RUNWAY" && !!surface.identifier;

  if (agl.agl_type === "PAPI" && isRunway) {
    return `PAPI RWY ${surface.identifier}${sideSuffix(agl.side)}`;
  }
  if (agl.agl_type === "RUNWAY_EDGE_LIGHTS" && isRunway) {
    return `REL RWY ${surface.identifier}${sideSuffix(agl.side)}`;
  }
  return `${agl.name}${sideSuffix(agl.side)}`;
}
