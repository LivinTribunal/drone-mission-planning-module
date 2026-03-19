export interface ListMeta {
  total: number;
  limit: number | null;
  offset: number | null;
}

export interface DeleteResponse {
  deleted: boolean;
  warnings: string[];
}

export interface PointZ {
  type: "Point";
  coordinates: [number, number, number];
}

export interface LineStringZ {
  type: "LineString";
  coordinates: [number, number, number][];
}

export interface PolygonZ {
  type: "Polygon";
  coordinates: [number, number, number][][];
}

export interface Coordinate {
  latitude: number;
  longitude: number;
  altitude: number;
}
