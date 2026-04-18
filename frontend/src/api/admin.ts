import type {
  AirportAdminResponse,
  AirportAssignmentUpdate,
  AuditLogEntry,
  InvitationResponse,
  SystemSettingsResponse,
  SystemSettingsUpdate,
  UserAdminResponse,
  UserAdminUpdate,
  UserInviteRequest,
} from "@/types/admin";
import type { ListMeta } from "@/types/common";
import client from "./client";

export async function listUsers(params?: {
  role?: string;
  is_active?: boolean;
  airport_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: UserAdminResponse[]; meta: ListMeta }> {
  const res = await client.get("/admin/users", { params });
  return res.data;
}

export async function getUser(id: string): Promise<UserAdminResponse> {
  const res = await client.get(`/admin/users/${id}`);
  return res.data;
}

export async function inviteUser(
  data: UserInviteRequest,
): Promise<InvitationResponse> {
  const res = await client.post("/admin/users/invite", data);
  return res.data;
}

export async function updateUser(
  id: string,
  data: UserAdminUpdate,
): Promise<UserAdminResponse> {
  const res = await client.put(`/admin/users/${id}`, data);
  return res.data;
}

export async function deactivateUser(
  id: string,
): Promise<UserAdminResponse> {
  const res = await client.put(`/admin/users/${id}/deactivate`);
  return res.data;
}

export async function activateUser(
  id: string,
): Promise<UserAdminResponse> {
  const res = await client.put(`/admin/users/${id}/activate`);
  return res.data;
}

export async function deleteUser(
  id: string,
): Promise<{ deleted: boolean }> {
  const res = await client.delete(`/admin/users/${id}`);
  return res.data;
}

export async function resetPassword(
  id: string,
): Promise<{ invitation_link: string }> {
  const res = await client.post(`/admin/users/${id}/reset-password`);
  return res.data;
}

export async function updateUserAirports(
  id: string,
  data: AirportAssignmentUpdate,
): Promise<UserAdminResponse> {
  const res = await client.put(`/admin/users/${id}/airports`, data);
  return res.data;
}

export async function listAirportsAdmin(params?: {
  search?: string;
  country?: string;
}): Promise<{ data: AirportAdminResponse[] }> {
  const res = await client.get("/admin/airports", { params });
  return res.data;
}

export async function getSystemSettings(): Promise<SystemSettingsResponse> {
  const res = await client.get("/admin/system-settings");
  return res.data;
}

export async function updateSystemSettings(
  data: SystemSettingsUpdate,
): Promise<SystemSettingsResponse> {
  const res = await client.put("/admin/system-settings", data);
  return res.data;
}

export async function listAuditLogs(params?: {
  search?: string;
  action?: string;
  user_id?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: AuditLogEntry[]; meta: ListMeta }> {
  const res = await client.get("/admin/audit-log", { params });
  return res.data;
}

export async function exportAuditLog(params?: {
  date_from?: string;
  date_to?: string;
}): Promise<Blob> {
  const res = await client.get("/admin/audit-log/export", {
    params,
    responseType: "blob",
  });
  return res.data;
}
