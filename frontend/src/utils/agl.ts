import type { AGLResponse, SurfaceResponse } from "@/types/airport";

/** format an AGL display name based on type and surface context. */
export function formatAglDisplayName(
  agl: Pick<AGLResponse, "agl_type" | "name">,
  surface?: Pick<SurfaceResponse, "surface_type" | "identifier"> | null,
): string {
  const isRunway = surface?.surface_type === "RUNWAY" && !!surface.identifier;

  if (agl.agl_type === "PAPI" && isRunway) {
    return `PAPI RWY ${surface.identifier}`;
  }
  if (agl.agl_type === "RUNWAY_EDGE_LIGHTS" && isRunway) {
    return `REL RWY ${surface.identifier}`;
  }
  return agl.name;
}
