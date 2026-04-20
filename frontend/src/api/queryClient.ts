import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const queryKeys = {
  missions: {
    all: ["missions"] as const,
    list: (airportId: string) => ["missions", "list", airportId] as const,
    detail: (id: string) => ["missions", "detail", id] as const,
    flightPlan: (missionId: string) =>
      ["missions", "flightPlan", missionId] as const,
    computationStatus: (missionId: string) =>
      ["missions", "computationStatus", missionId] as const,
  },
  airports: {
    all: ["airports"] as const,
    list: () => ["airports", "list"] as const,
    summaries: () => ["airports", "summaries"] as const,
    detail: (id: string) => ["airports", "detail", id] as const,
  },
  droneProfiles: {
    all: ["droneProfiles"] as const,
    list: () => ["droneProfiles", "list"] as const,
    detail: (id: string) => ["droneProfiles", "detail", id] as const,
  },
  inspectionTemplates: {
    all: ["inspectionTemplates"] as const,
    list: (params?: { airport_id?: string }) =>
      ["inspectionTemplates", "list", params] as const,
    detail: (id: string) => ["inspectionTemplates", "detail", id] as const,
  },
  admin: {
    users: {
      all: ["admin", "users"] as const,
      list: (params?: Record<string, unknown>) =>
        ["admin", "users", "list", params] as const,
      detail: (id: string) => ["admin", "users", "detail", id] as const,
    },
    airports: () => ["admin", "airports"] as const,
    systemSettings: () => ["admin", "systemSettings"] as const,
    auditLog: (params?: Record<string, unknown>) =>
      ["admin", "auditLog", params] as const,
  },
};
