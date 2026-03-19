import type { ListMeta, DeleteResponse } from "@/types/common";
import type {
  DroneProfileResponse,
  DroneProfileCreate,
  DroneProfileUpdate,
} from "@/types/droneProfile";
import client from "./client";

export async function listDroneProfiles(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ data: DroneProfileResponse[]; meta: ListMeta }> {
  const res = await client.get("/drone-profiles", { params });
  return res.data;
}

export async function getDroneProfile(
  id: string,
): Promise<DroneProfileResponse> {
  const res = await client.get(`/drone-profiles/${id}`);
  return res.data;
}

export async function createDroneProfile(
  data: DroneProfileCreate,
): Promise<DroneProfileResponse> {
  const res = await client.post("/drone-profiles", data);
  return res.data;
}

export async function updateDroneProfile(
  id: string,
  data: DroneProfileUpdate,
): Promise<DroneProfileResponse> {
  const res = await client.put(`/drone-profiles/${id}`, data);
  return res.data;
}

export async function deleteDroneProfile(
  id: string,
): Promise<DeleteResponse> {
  const res = await client.delete(`/drone-profiles/${id}`);
  return res.data;
}
