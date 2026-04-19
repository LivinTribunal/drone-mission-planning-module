import type { ListMeta, DeleteResponse } from "@/types/common";
import type {
  InspectionTemplateResponse,
  InspectionTemplateCreate,
  InspectionTemplateUpdate,
} from "@/types/inspectionTemplate";
import client from "./client";

export async function listInspectionTemplates(
  params?: {
    limit?: number;
    offset?: number;
    airport_id?: string;
  },
  signal?: AbortSignal,
): Promise<{ data: InspectionTemplateResponse[]; meta: ListMeta }> {
  /**fetch inspection templates with optional abort signal.*/
  const res = await client.get("/inspection-templates", { params, signal });
  return res.data;
}

export async function getInspectionTemplate(
  id: string,
): Promise<InspectionTemplateResponse> {
  const res = await client.get(`/inspection-templates/${id}`);
  return res.data;
}

export async function createInspectionTemplate(
  data: InspectionTemplateCreate,
): Promise<InspectionTemplateResponse> {
  const res = await client.post("/inspection-templates", data);
  return res.data;
}

export async function updateInspectionTemplate(
  id: string,
  data: InspectionTemplateUpdate,
): Promise<InspectionTemplateResponse> {
  const res = await client.put(`/inspection-templates/${id}`, data);
  return res.data;
}

export async function deleteInspectionTemplate(
  id: string,
): Promise<DeleteResponse> {
  const res = await client.delete(`/inspection-templates/${id}`);
  return res.data;
}

export async function bulkCreateInspectionTemplates(
  airportId: string,
): Promise<{ created: InspectionTemplateResponse[]; skipped: number }> {
  const res = await client.post("/inspection-templates/bulk", {
    airport_id: airportId,
  });
  return res.data;
}
