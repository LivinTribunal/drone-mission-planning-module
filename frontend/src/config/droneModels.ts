export const BUNDLED_DRONE_MODELS = [
  {
    id: "generic_quadcopter",
    name: "Generic Quadcopter",
    path: "/models/drones/generic_quadcopter.glb",
    thumbnail: "/models/drones/thumbnails/generic_quadcopter.png",
  },
  {
    id: "dji_matrice_300",
    name: "DJI Matrice 300 RTK",
    path: "/models/drones/dji_matrice_300.glb",
    thumbnail: "/models/drones/thumbnails/dji_matrice_300.png",
  },
  {
    id: "dji_mavic_2",
    name: "DJI Mavic 2 Pro",
    path: "/models/drones/dji_mavic_3.glb",
    thumbnail: "/models/drones/thumbnails/dji_mavic_3.png",
  },
  {
    id: "dji_mavic_3",
    name: "DJI Mavic 3 Enterprise",
    path: "/models/drones/dji_mavic_3.glb",
    thumbnail: "/models/drones/thumbnails/dji_mavic_3.png",
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
