import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryClient";
import {
  listDroneProfiles,
  getDroneProfile,
  createDroneProfile,
  updateDroneProfile,
  deleteDroneProfile,
} from "../droneProfiles";
import type { DroneProfileCreate, DroneProfileUpdate } from "@/types/droneProfile";

export function useDroneProfiles() {
  return useQuery({
    queryKey: queryKeys.droneProfiles.list(),
    queryFn: () => listDroneProfiles(),
    staleTime: 5 * 60_000,
  });
}

export function useDroneProfileDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.droneProfiles.detail(id ?? ""),
    queryFn: () => getDroneProfile(id!),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function useCreateDroneProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DroneProfileCreate) => createDroneProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.droneProfiles.all });
    },
  });
}

export function useUpdateDroneProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DroneProfileUpdate }) =>
      updateDroneProfile(id, data),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.droneProfiles.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.droneProfiles.all });
    },
  });
}

export function useDeleteDroneProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDroneProfile(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.droneProfiles.all });
    },
  });
}
