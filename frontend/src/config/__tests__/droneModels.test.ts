import { describe, it, expect } from "vitest";
import { BUNDLED_DRONE_MODELS, getBundledModel } from "../droneModels";

// model_identifier values set on each seeded DroneProfile in backend/app/seed.py
const SEEDED_PROFILE_IDENTIFIERS = [
  "dji_matrice_300",
  "dji_matrice_350",
  "dji_mavic_2",
  "dji_mavic_3",
  "autel_evo_ii",
  "freefly_astro",
  "sensefly_ebee_x",
  "skydio_x10",
];

// generic fallback models not tied to a specific seeded profile
const GENERIC_FALLBACK_IDS = [
  "generic_quadcopter",
  "generic_hexacopter",
  "generic_fixed_wing",
];

describe("BUNDLED_DRONE_MODELS", () => {
  it("has unique ids", () => {
    const ids = BUNDLED_DRONE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has non-empty name, path, and thumbnail", () => {
    for (const model of BUNDLED_DRONE_MODELS) {
      expect(model.name).toBeTruthy();
      expect(model.path).toMatch(/^\/models\/drones\/.+\.glb$/);
      expect(model.thumbnail).toMatch(/^\/models\/drones\/thumbnails\/.+\.png$/);
    }
  });

  it("covers every seeded drone profile identifier", () => {
    const bundledIds: Set<string> = new Set(BUNDLED_DRONE_MODELS.map((m) => m.id));
    for (const id of SEEDED_PROFILE_IDENTIFIERS) {
      expect(bundledIds.has(id)).toBe(true);
    }
  });

  it("generic fallback ids are present", () => {
    const bundledIds: Set<string> = new Set(BUNDLED_DRONE_MODELS.map((m) => m.id));
    for (const id of GENERIC_FALLBACK_IDS) {
      expect(bundledIds.has(id)).toBe(true);
    }
  });

  it("total count is seeded profiles + generic fallbacks", () => {
    expect(BUNDLED_DRONE_MODELS.length).toBe(
      SEEDED_PROFILE_IDENTIFIERS.length + GENERIC_FALLBACK_IDS.length,
    );
  });
});

describe("getBundledModel", () => {
  it("returns model for valid id", () => {
    const model = getBundledModel("dji_matrice_300");
    expect(model).not.toBeNull();
    expect(model!.name).toBe("DJI Matrice 300 RTK");
  });

  it("returns null for unknown id", () => {
    expect(getBundledModel("nonexistent")).toBeNull();
  });
});
