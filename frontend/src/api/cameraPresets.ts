import type { DeleteResponse, ListMeta } from "@/types/common";
import type {
  CameraPresetCreate,
  CameraPresetResponse,
  CameraPresetUpdate,
} from "@/types/cameraPreset";
import client from "./client";

export async function listCameraPresets(params?: {
  drone_profile_id?: string;
  is_default?: boolean;
}): Promise<{ data: CameraPresetResponse[]; meta: ListMeta }> {
  const res = await client.get("/camera-presets", { params });
  return res.data;
}

export async function getCameraPreset(
  id: string,
): Promise<CameraPresetResponse> {
  const res = await client.get(`/camera-presets/${id}`);
  return res.data;
}

export async function createCameraPreset(
  data: CameraPresetCreate,
): Promise<CameraPresetResponse> {
  const res = await client.post("/camera-presets", data);
  return res.data;
}

export async function updateCameraPreset(
  id: string,
  data: CameraPresetUpdate,
): Promise<CameraPresetResponse> {
  const res = await client.put(`/camera-presets/${id}`, data);
  return res.data;
}

export async function deleteCameraPreset(
  id: string,
): Promise<DeleteResponse> {
  const res = await client.delete(`/camera-presets/${id}`);
  return res.data;
}
