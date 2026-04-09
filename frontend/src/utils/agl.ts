import type { AGLResponse, SurfaceResponse } from "@/types/airport";

/** format an AGL display name as "PAPI RWY {designator}" when applicable. */
export function formatAglDisplayName(
  agl: Pick<AGLResponse, "agl_type" | "name">,
  surface?: Pick<SurfaceResponse, "surface_type" | "identifier"> | null,
): string {
  if (
    agl.agl_type === "PAPI" &&
    surface &&
    surface.surface_type === "RUNWAY" &&
    surface.identifier
  ) {
    return `PAPI RWY ${surface.identifier}`;
  }
  return agl.name;
}
