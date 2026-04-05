import type { ListMeta, DeleteResponse } from "@/types/common";
import type {
  AirportResponse,
  AirportSummaryResponse,
  AirportDetailResponse,
  AirportCreate,
  AirportUpdate,
  SurfaceResponse,
  SurfaceCreate,
  SurfaceUpdate,
  ObstacleResponse,
  ObstacleCreate,
  ObstacleUpdate,
  SafetyZoneResponse,
  SafetyZoneCreate,
  SafetyZoneUpdate,
  AGLResponse,
  AGLCreate,
  AGLUpdate,
  LHAResponse,
  LHACreate,
  LHAUpdate,
  TerrainUploadResponse,
  TerrainDownloadResponse,
} from "@/types/airport";
import client from "./client";

export async function listAirports(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ data: AirportResponse[]; meta: ListMeta }> {
  const res = await client.get("/airports", { params });
  return res.data;
}

export async function listAirportSummaries(): Promise<{
  data: AirportSummaryResponse[];
  meta: ListMeta;
}> {
  const res = await client.get("/airports/summary");
  return res.data;
}

export async function getAirport(id: string): Promise<AirportDetailResponse> {
  const res = await client.get(`/airports/${id}`);
  return res.data;
}

export async function createAirport(
  data: AirportCreate,
): Promise<AirportResponse> {
  const res = await client.post("/airports", data);
  return res.data;
}

export async function updateAirport(
  id: string,
  data: AirportUpdate,
): Promise<AirportResponse> {
  const res = await client.put(`/airports/${id}`, data);
  return res.data;
}

export async function deleteAirport(id: string): Promise<DeleteResponse> {
  const res = await client.delete(`/airports/${id}`);
  return res.data;
}

// terrain

export async function uploadTerrainDEM(
  airportId: string,
  file: File,
): Promise<TerrainUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await client.post(
    `/airports/${airportId}/terrain-dem`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return res.data;
}

export async function deleteTerrainDEM(
  airportId: string,
): Promise<DeleteResponse> {
  const res = await client.delete(`/airports/${airportId}/terrain-dem`);
  return res.data;
}

export async function downloadTerrainData(
  airportId: string,
): Promise<TerrainDownloadResponse> {
  const res = await client.post(`/airports/${airportId}/terrain-download`);
  return res.data;
}

// surfaces

export async function listSurfaces(
  airportId: string,
): Promise<{ data: SurfaceResponse[]; meta: ListMeta }> {
  const res = await client.get(`/airports/${airportId}/surfaces`);
  return res.data;
}

export async function getSurface(
  airportId: string,
  id: string,
): Promise<SurfaceResponse> {
  const res = await client.get(`/airports/${airportId}/surfaces/${id}`);
  return res.data;
}

export async function createSurface(
  airportId: string,
  data: SurfaceCreate,
): Promise<SurfaceResponse> {
  const res = await client.post(`/airports/${airportId}/surfaces`, data);
  return res.data;
}

export async function updateSurface(
  airportId: string,
  id: string,
  data: SurfaceUpdate,
): Promise<SurfaceResponse> {
  const res = await client.put(`/airports/${airportId}/surfaces/${id}`, data);
  return res.data;
}

export async function deleteSurface(
  airportId: string,
  id: string,
): Promise<DeleteResponse> {
  const res = await client.delete(`/airports/${airportId}/surfaces/${id}`);
  return res.data;
}

// obstacles

export async function listObstacles(
  airportId: string,
): Promise<{ data: ObstacleResponse[]; meta: ListMeta }> {
  const res = await client.get(`/airports/${airportId}/obstacles`);
  return res.data;
}

export async function getObstacle(
  airportId: string,
  id: string,
): Promise<ObstacleResponse> {
  const res = await client.get(`/airports/${airportId}/obstacles/${id}`);
  return res.data;
}

export async function createObstacle(
  airportId: string,
  data: ObstacleCreate,
): Promise<ObstacleResponse> {
  const res = await client.post(`/airports/${airportId}/obstacles`, data);
  return res.data;
}

export async function updateObstacle(
  airportId: string,
  id: string,
  data: ObstacleUpdate,
): Promise<ObstacleResponse> {
  const res = await client.put(`/airports/${airportId}/obstacles/${id}`, data);
  return res.data;
}

export async function deleteObstacle(
  airportId: string,
  id: string,
): Promise<DeleteResponse> {
  const res = await client.delete(`/airports/${airportId}/obstacles/${id}`);
  return res.data;
}

// safety zones

export async function listSafetyZones(
  airportId: string,
): Promise<{ data: SafetyZoneResponse[]; meta: ListMeta }> {
  const res = await client.get(`/airports/${airportId}/safety-zones`);
  return res.data;
}

export async function getSafetyZone(
  airportId: string,
  id: string,
): Promise<SafetyZoneResponse> {
  const res = await client.get(`/airports/${airportId}/safety-zones/${id}`);
  return res.data;
}

export async function createSafetyZone(
  airportId: string,
  data: SafetyZoneCreate,
): Promise<SafetyZoneResponse> {
  const res = await client.post(`/airports/${airportId}/safety-zones`, data);
  return res.data;
}

export async function updateSafetyZone(
  airportId: string,
  id: string,
  data: SafetyZoneUpdate,
): Promise<SafetyZoneResponse> {
  const res = await client.put(
    `/airports/${airportId}/safety-zones/${id}`,
    data,
  );
  return res.data;
}

export async function deleteSafetyZone(
  airportId: string,
  id: string,
): Promise<DeleteResponse> {
  const res = await client.delete(`/airports/${airportId}/safety-zones/${id}`);
  return res.data;
}

// agls (nested under surfaces)

export async function listAGLs(
  airportId: string,
  surfaceId: string,
): Promise<{ data: AGLResponse[]; meta: ListMeta }> {
  const res = await client.get(
    `/airports/${airportId}/surfaces/${surfaceId}/agls`,
  );
  return res.data;
}

export async function getAGL(
  airportId: string,
  surfaceId: string,
  id: string,
): Promise<AGLResponse> {
  const res = await client.get(
    `/airports/${airportId}/surfaces/${surfaceId}/agls/${id}`,
  );
  return res.data;
}

export async function createAGL(
  airportId: string,
  surfaceId: string,
  data: AGLCreate,
): Promise<AGLResponse> {
  const res = await client.post(
    `/airports/${airportId}/surfaces/${surfaceId}/agls`,
    data,
  );
  return res.data;
}

export async function updateAGL(
  airportId: string,
  surfaceId: string,
  id: string,
  data: AGLUpdate,
): Promise<AGLResponse> {
  const res = await client.put(
    `/airports/${airportId}/surfaces/${surfaceId}/agls/${id}`,
    data,
  );
  return res.data;
}

export async function deleteAGL(
  airportId: string,
  surfaceId: string,
  id: string,
): Promise<DeleteResponse> {
  const res = await client.delete(
    `/airports/${airportId}/surfaces/${surfaceId}/agls/${id}`,
  );
  return res.data;
}

// lhas (nested under agls)

export async function listLHAs(
  airportId: string,
  surfaceId: string,
  aglId: string,
): Promise<{ data: LHAResponse[]; meta: ListMeta }> {
  const res = await client.get(
    `/airports/${airportId}/surfaces/${surfaceId}/agls/${aglId}/lhas`,
  );
  return res.data;
}

export async function getLHA(
  airportId: string,
  surfaceId: string,
  aglId: string,
  id: string,
): Promise<LHAResponse> {
  const res = await client.get(
    `/airports/${airportId}/surfaces/${surfaceId}/agls/${aglId}/lhas/${id}`,
  );
  return res.data;
}

export async function createLHA(
  airportId: string,
  surfaceId: string,
  aglId: string,
  data: LHACreate,
): Promise<LHAResponse> {
  const res = await client.post(
    `/airports/${airportId}/surfaces/${surfaceId}/agls/${aglId}/lhas`,
    data,
  );
  return res.data;
}

export async function updateLHA(
  airportId: string,
  surfaceId: string,
  aglId: string,
  id: string,
  data: LHAUpdate,
): Promise<LHAResponse> {
  const res = await client.put(
    `/airports/${airportId}/surfaces/${surfaceId}/agls/${aglId}/lhas/${id}`,
    data,
  );
  return res.data;
}

export async function deleteLHA(
  airportId: string,
  surfaceId: string,
  aglId: string,
  id: string,
): Promise<DeleteResponse> {
  const res = await client.delete(
    `/airports/${airportId}/surfaces/${surfaceId}/agls/${aglId}/lhas/${id}`,
  );
  return res.data;
}
