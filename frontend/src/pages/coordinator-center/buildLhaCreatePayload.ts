import type { LHACreate } from "@/types/airport";

export function buildLhaCreatePayload(
  data: Record<string, unknown>,
  position: [number, number],
  elevation: number,
): LHACreate {
  /** map creationform output to lhacreate dto, preserving null setting_angle for papi. */
  return {
    unit_designator: (data.unit_designator as string) ?? "A",
    setting_angle: data.setting_angle as number | null,
    lamp_type: (data.lamp_type as "HALOGEN" | "LED") ?? "HALOGEN",
    position: { type: "Point", coordinates: [position[0], position[1], elevation] },
    tolerance: data.tolerance != null ? (data.tolerance as number) : undefined,
  };
}
