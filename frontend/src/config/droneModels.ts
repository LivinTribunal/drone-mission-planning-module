export const BUNDLED_DRONE_MODELS = [
  {
    id: "dji_matrice_300",
    name: "DJI Matrice 300 RTK",
    path: "/models/drones/dji_matrice_300.glb",
    thumbnail: "/models/drones/thumbnails/dji_matrice_300.png",
  },
  {
    id: "dji_matrice_350",
    name: "DJI Matrice 350 RTK",
    path: "/models/drones/dji_matrice_300.glb", // visually near-identical to matrice 300
    thumbnail: "/models/drones/thumbnails/dji_matrice_300.png",
  },
  {
    id: "dji_mavic_2",
    name: "DJI Mavic 2 Pro",
    path: "/models/drones/dji_mavic_2.glb",
    thumbnail: "/models/drones/thumbnails/dji_mavic_2.png",
  },
  {
    id: "dji_mavic_3",
    name: "DJI Mavic 3 Enterprise",
    path: "/models/drones/dji_mavic_3.glb",
    thumbnail: "/models/drones/thumbnails/dji_mavic_3.png",
  },
  {
    id: "autel_evo_ii",
    name: "Autel EVO II Pro V3",
    path: "/models/drones/autel_evo_ii.glb",
    thumbnail: "/models/drones/thumbnails/autel_evo_ii.png",
  },
  {
    id: "freefly_astro",
    name: "Freefly Astro",
    path: "/models/drones/generic_hexacopter.glb", // no cc-by source available
    thumbnail: "/models/drones/thumbnails/generic_hexacopter.png",
  },
  {
    id: "sensefly_ebee_x",
    name: "senseFly eBee X",
    path: "/models/drones/generic_fixed_wing.glb", // no cc-by source available
    thumbnail: "/models/drones/thumbnails/generic_fixed_wing.png",
  },
  {
    id: "skydio_x10",
    name: "Skydio X10",
    path: "/models/drones/generic_quadcopter.glb", // no cc-by source available
    thumbnail: "/models/drones/thumbnails/generic_quadcopter.png",
  },
  {
    id: "generic_quadcopter",
    name: "Generic Quadcopter",
    path: "/models/drones/generic_quadcopter.glb",
    thumbnail: "/models/drones/thumbnails/generic_quadcopter.png",
  },
  {
    id: "generic_hexacopter",
    name: "Generic Hexacopter",
    path: "/models/drones/generic_hexacopter.glb",
    thumbnail: "/models/drones/thumbnails/generic_hexacopter.png",
  },
  {
    id: "generic_fixed_wing",
    name: "Fixed Wing VTOL",
    path: "/models/drones/generic_fixed_wing.glb",
    thumbnail: "/models/drones/thumbnails/generic_fixed_wing.png",
  },
] as const;

export type BundledDroneModelId = (typeof BUNDLED_DRONE_MODELS)[number]["id"];

/** look up a bundled model by its id. */
export function getBundledModel(id: string) {
  return BUNDLED_DRONE_MODELS.find((m) => m.id === id) ?? null;
}
