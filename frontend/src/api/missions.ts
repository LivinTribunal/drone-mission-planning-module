import type { ListMeta, DeleteResponse } from "@/types/common";
import type {
  MissionResponse,
  MissionDetailResponse,
  MissionCreate,
  MissionUpdate,
  InspectionResponse,
  InspectionCreate,
  InspectionUpdate,
  ReorderRequest,
} from "@/types/mission";
import type {
  FlightPlanResponse,
  GenerateTrajectoryResponse,
} from "@/types/flightPlan";
import client from "./client";

export async function listMissions(params?: {
  limit?: number;
  offset?: number;
  airport_id?: string;
}): Promise<{ data: MissionResponse[]; meta: ListMeta }> {
  const res = await client.get("/missions", { params });
  return res.data;
}

export async function getMission(id: string): Promise<MissionDetailResponse> {
  const res = await client.get(`/missions/${id}`);
  return res.data;
}

export async function createMission(
  data: MissionCreate,
): Promise<MissionResponse> {
  const res = await client.post("/missions", data);
  return res.data;
}

export async function updateMission(
  id: string,
  data: MissionUpdate,
): Promise<MissionResponse> {
  const res = await client.put(`/missions/${id}`, data);
  return res.data;
}

export async function deleteMission(id: string): Promise<DeleteResponse> {
  const res = await client.delete(`/missions/${id}`);
  return res.data;
}

export async function duplicateMission(
  id: string,
): Promise<MissionResponse> {
  const res = await client.post(`/missions/${id}/duplicate`);
  return res.data;
}

// status transitions

export async function validateMission(
  id: string,
): Promise<MissionResponse> {
  const res = await client.post(`/missions/${id}/validate`);
  return res.data;
}

export async function exportMission(id: string): Promise<MissionResponse> {
  const res = await client.post(`/missions/${id}/export`);
  return res.data;
}

export async function completeMission(
  id: string,
): Promise<MissionResponse> {
  const res = await client.post(`/missions/${id}/complete`);
  return res.data;
}

export async function cancelMission(id: string): Promise<MissionResponse> {
  const res = await client.post(`/missions/${id}/cancel`);
  return res.data;
}

// inspections

export async function addInspection(
  missionId: string,
  data: InspectionCreate,
): Promise<InspectionResponse> {
  const res = await client.post(`/missions/${missionId}/inspections`, data);
  return res.data;
}

export async function updateInspection(
  missionId: string,
  inspectionId: string,
  data: InspectionUpdate,
): Promise<InspectionResponse> {
  const res = await client.put(
    `/missions/${missionId}/inspections/${inspectionId}`,
    data,
  );
  return res.data;
}

export async function removeInspection(
  missionId: string,
  inspectionId: string,
): Promise<DeleteResponse> {
  const res = await client.delete(
    `/missions/${missionId}/inspections/${inspectionId}`,
  );
  return res.data;
}

export async function reorderInspections(
  missionId: string,
  data: ReorderRequest,
): Promise<{ reordered: boolean }> {
  const res = await client.put(
    `/missions/${missionId}/inspections/reorder`,
    data,
  );
  return res.data;
}

// trajectory and flight plan

export async function generateTrajectory(
  missionId: string,
): Promise<GenerateTrajectoryResponse> {
  const res = await client.post(`/missions/${missionId}/generate-trajectory`);
  return res.data;
}

export async function getFlightPlan(
  missionId: string,
): Promise<FlightPlanResponse> {
  const res = await client.get(`/missions/${missionId}/flight-plan`);
  return res.data;
}
