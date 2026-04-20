import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryClient";
import {
  listUsers,
  getUser,
  inviteUser,
  updateUser,
  deactivateUser,
  activateUser,
  deleteUser,
  listAirportsAdmin,
  getSystemSettings,
  updateSystemSettings,
  listAuditLogs,
} from "../admin";
import type { UserInviteRequest, UserAdminUpdate, SystemSettingsUpdate } from "@/types/admin";

export function useAdminUsers(params?: {
  role?: string;
  is_active?: boolean;
  airport_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: queryKeys.admin.users.list(params as Record<string, unknown>),
    queryFn: () => listUsers(params),
    staleTime: 60_000,
  });
}

export function useAdminUserDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.users.detail(id ?? ""),
    queryFn: () => getUser(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UserInviteRequest) => inviteUser(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.users.all });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserAdminUpdate }) =>
      updateUser(id, data),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.users.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.admin.users.all });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.users.all });
    },
  });
}

export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.users.all });
    },
  });
}

export function useDeleteAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.users.all });
    },
  });
}

export function useAdminAirports(params?: {
  search?: string;
  country?: string;
}) {
  return useQuery({
    queryKey: queryKeys.admin.airports(),
    queryFn: () => listAirportsAdmin(params),
    staleTime: 5 * 60_000,
  });
}

export function useSystemSettings() {
  return useQuery({
    queryKey: queryKeys.admin.systemSettings(),
    queryFn: () => getSystemSettings(),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SystemSettingsUpdate) => updateSystemSettings(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.systemSettings() });
    },
  });
}

export function useAuditLogs(params?: {
  search?: string;
  action?: string;
  user_id?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_dir?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: queryKeys.admin.auditLog(params as Record<string, unknown>),
    queryFn: () => listAuditLogs(params),
    staleTime: 60_000,
  });
}
