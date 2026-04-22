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
  ComputationStatusResponse,
  HeadingAutoResponse,
} from "@/types/mission";
import type { MissionStatus } from "@/types/enums";
import type {
  FlightPlanResponse,
  GenerateTrajectoryResponse,
  WaypointPositionUpdate,
} from "@/types/flightPlan";
import client from "./client";

export async function listMissions(params?: {
  limit?: number;
  offset?: number;
  airport_id?: string;
  drone_profile_id?: string;
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

export async function exportMissionFiles(
  id: string,
  formats: string[],
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await client.post(
    `/missions/${id}/export`,
    { formats },
    { responseType: "blob" },
  );
  return { blob: res.data, filename: parseContentDispositionFilename(res.headers) };
}

/** extract filename from a Content-Disposition response header.
 * prefers the rfc 5987 filename* (utf-8) variant when present.
 */
function parseContentDispositionFilename(
  headers: unknown,
): string | null {
  const raw =
    (headers as { "content-disposition"?: string })?.["content-disposition"];
  if (!raw) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(raw);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(raw);
  return plain?.[1] ?? null;
}

/** fetch mission technical report pdf blob from the backend. */
export async function downloadMissionReport(
  id: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await client.get(`/missions/${id}/mission-report`, {
    responseType: "blob",
  });
  return { blob: res.data, filename: parseContentDispositionFilename(res.headers) };
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

export async function resolveAutoHeadings(
  missionId: string,
): Promise<HeadingAutoResponse> {
  const res = await client.post(`/missions/${missionId}/headings/auto`);
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
  signal?: AbortSignal,
): Promise<GenerateTrajectoryResponse> {
  const res = await client.post(`/missions/${missionId}/generate-trajectory`, undefined, {
    signal,
  });
  return res.data;
}

export async function getComputationStatus(
  missionId: string,
): Promise<ComputationStatusResponse> {
  const res = await client.get(`/missions/${missionId}/computation-status`);
  return res.data;
}

export async function getFlightPlan(
  missionId: string,
): Promise<FlightPlanResponse> {
  const res = await client.get(`/missions/${missionId}/flight-plan`);
  return res.data;
}

export async function generateAndFetchTrajectory(
  missionId: string,
): Promise<{ flightPlan: FlightPlanResponse; missionStatus: MissionStatus }> {
  const result = await generateTrajectory(missionId);
  return { flightPlan: result.flight_plan, missionStatus: result.mission_status };
}

export async function batchUpdateWaypoints(
  missionId: string,
  updates: WaypointPositionUpdate[],
): Promise<FlightPlanResponse> {
  const res = await client.put(
    `/missions/${missionId}/flight-plan/waypoints`,
    { updates },
  );
  return res.data;
}

export async function insertTransitWaypoint(
  missionId: string,
  position: { type: "Point"; coordinates: [number, number, number] },
  afterSequence: number,
): Promise<FlightPlanResponse> {
  /** insert a new transit waypoint on the transit path. */
  const res = await client.post(
    `/missions/${missionId}/flight-plan/waypoints/transit`,
    { position, after_sequence: afterSequence },
  );
  return res.data;
}

export async function deleteTransitWaypoint(
  missionId: string,
  waypointId: string,
): Promise<FlightPlanResponse> {
  /** delete a transit waypoint from the flight plan. */
  const res = await client.delete(
    `/missions/${missionId}/flight-plan/waypoints/${waypointId}`,
  );
  return res.data;
}
