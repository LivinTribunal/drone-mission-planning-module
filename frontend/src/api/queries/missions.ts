import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryClient";
import {
  listMissions,
  getMission,
  createMission,
  updateMission,
  deleteMission,
  duplicateMission,
  getFlightPlan,
  addInspection,
  updateInspection,
  removeInspection,
  reorderInspections,
} from "../missions";
import type { MissionCreate, MissionUpdate, InspectionCreate, InspectionUpdate, ReorderRequest } from "@/types/mission";

export function useMissions(airportId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.missions.list(airportId ?? ""),
    queryFn: () => listMissions({ airport_id: airportId, limit: 200 }),
    enabled: !!airportId,
    staleTime: 60_000,
  });
}

export function useMissionDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.missions.detail(id ?? ""),
    queryFn: () => getMission(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useFlightPlan(missionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.missions.flightPlan(missionId ?? ""),
    queryFn: () => getFlightPlan(missionId!),
    enabled: !!missionId,
    staleTime: 60_000,
  });
}

export function useCreateMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MissionCreate) => createMission(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.missions.all });
    },
  });
}

export function useUpdateMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MissionUpdate }) =>
      updateMission(id, data),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.missions.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.missions.all });
    },
  });
}

export function useDeleteMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMission(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.missions.all });
    },
  });
}

export function useDuplicateMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => duplicateMission(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.missions.all });
    },
  });
}

export function useAddInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ missionId, data }: { missionId: string; data: InspectionCreate }) =>
      addInspection(missionId, data),
    onSuccess: (_result, { missionId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.missions.detail(missionId) });
    },
  });
}

export function useUpdateInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      missionId,
      inspectionId,
      data,
    }: {
      missionId: string;
      inspectionId: string;
      data: InspectionUpdate;
    }) => updateInspection(missionId, inspectionId, data),
    onSuccess: (_result, { missionId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.missions.detail(missionId) });
    },
  });
}

export function useRemoveInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ missionId, inspectionId }: { missionId: string; inspectionId: string }) =>
      removeInspection(missionId, inspectionId),
    onSuccess: (_result, { missionId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.missions.detail(missionId) });
    },
  });
}

export function useReorderInspections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ missionId, data }: { missionId: string; data: ReorderRequest }) =>
      reorderInspections(missionId, data),
    onSuccess: (_result, { missionId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.missions.detail(missionId) });
    },
  });
}
