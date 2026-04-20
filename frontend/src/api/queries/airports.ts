import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryClient";
import {
  listAirports,
  listAirportSummaries,
  getAirport,
  createAirport,
  updateAirport,
  deleteAirport,
} from "../airports";
import type { AirportCreate, AirportUpdate } from "@/types/airport";

export function useAirports(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: queryKeys.airports.list(params),
    queryFn: () => listAirports(params),
    staleTime: 5 * 60_000,
  });
}

export function useAirportSummaries() {
  return useQuery({
    queryKey: queryKeys.airports.summaries(),
    queryFn: () => listAirportSummaries(),
    staleTime: 5 * 60_000,
  });
}

export function useAirportDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.airports.detail(id ?? ""),
    queryFn: () => getAirport(id!),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function useCreateAirport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AirportCreate) => createAirport(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.airports.all });
    },
  });
}

export function useUpdateAirport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AirportUpdate }) =>
      updateAirport(id, data),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.airports.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.airports.all });
    },
  });
}

export function useDeleteAirport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAirport(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.airports.all });
    },
  });
}
