import { describe, it, expect } from "vitest";
import { buildLhaCreatePayload } from "./buildLhaCreatePayload";

describe("buildLhaCreatePayload", () => {
  it("preserves null setting_angle for papi (no fallback to 3.0)", () => {
    const payload = buildLhaCreatePayload(
      { unit_number: 2, setting_angle: null, lamp_type: "LED", tolerance: 0.5 },
      [17.0, 48.0],
      210,
    );
    expect(payload.setting_angle).toBeNull();
    expect(payload.unit_number).toBe(2);
    expect(payload.lamp_type).toBe("LED");
    expect(payload.tolerance).toBe(0.5);
    expect(payload.position).toEqual({
      type: "Point",
      coordinates: [17.0, 48.0, 210],
    });
  });

  it("passes through a numeric setting_angle for edge lights", () => {
    const payload = buildLhaCreatePayload(
      { unit_number: 1, setting_angle: 0.0, lamp_type: "HALOGEN" },
      [17.0, 48.0],
      210,
    );
    expect(payload.setting_angle).toBe(0.0);
    expect(payload.tolerance).toBeUndefined();
  });

  it("defaults missing unit_number and lamp_type", () => {
    const payload = buildLhaCreatePayload(
      { setting_angle: 2.75 },
      [17.0, 48.0],
      210,
    );
    expect(payload.unit_number).toBe(1);
    expect(payload.lamp_type).toBe("HALOGEN");
    expect(payload.setting_angle).toBe(2.75);
  });
});
