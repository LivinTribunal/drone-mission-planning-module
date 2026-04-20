import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryClient";
import {
  listInspectionTemplates,
  getInspectionTemplate,
  createInspectionTemplate,
  updateInspectionTemplate,
  deleteInspectionTemplate,
} from "../inspectionTemplates";
import type {
  InspectionTemplateCreate,
  InspectionTemplateUpdate,
} from "@/types/inspectionTemplate";

export function useInspectionTemplates(params?: { airport_id?: string }) {
  return useQuery({
    queryKey: queryKeys.inspectionTemplates.list(params),
    queryFn: () => listInspectionTemplates(params),
    staleTime: 5 * 60_000,
  });
}

export function useInspectionTemplateDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inspectionTemplates.detail(id ?? ""),
    queryFn: () => getInspectionTemplate(id!),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function useCreateInspectionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InspectionTemplateCreate) =>
      createInspectionTemplate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inspectionTemplates.all });
    },
  });
}

export function useUpdateInspectionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: InspectionTemplateUpdate;
    }) => updateInspectionTemplate(id, data),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({
        queryKey: queryKeys.inspectionTemplates.detail(id),
      });
      qc.invalidateQueries({ queryKey: queryKeys.inspectionTemplates.all });
    },
  });
}

export function useDeleteInspectionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteInspectionTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inspectionTemplates.all });
    },
  });
}
