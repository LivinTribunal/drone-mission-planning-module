import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ComputationProvider, useComputation } from "./ComputationContext";
import ComputationNotification from "@/components/common/ComputationNotification";

const mockRefreshMissions = vi.fn();
const mockRefreshSelectedMission = vi.fn();
let mockSelectedMission: Record<string, unknown> | null = null;

vi.mock("./MissionContext", () => ({
  useMission: () => ({
    selectedMission: mockSelectedMission,
    refreshMissions: mockRefreshMissions,
    refreshSelectedMission: mockRefreshSelectedMission,
  }),
}));

const mockGenerateTrajectory = vi.fn();
const mockGetComputationStatus = vi.fn();

vi.mock("@/api/missions", () => ({
  generateTrajectory: (...args: unknown[]) => mockGenerateTrajectory(...args),
  getComputationStatus: (...args: unknown[]) => mockGetComputationStatus(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

let testQueryClient: QueryClient;

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={testQueryClient}>
      <ComputationProvider>{children}</ComputationProvider>
    </QueryClientProvider>
  );
}

describe("ComputationContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testQueryClient = createTestQueryClient();
    mockSelectedMission = { id: "m-1", name: "Test Mission", computation_status: "IDLE" };
  });

  it("throws when useComputation is used outside provider", () => {
    expect(() => renderHook(() => useComputation())).toThrow(
      "useComputation must be used within ComputationProvider",
    );
  });

  it("starts with IDLE status", () => {
    const { result } = renderHook(() => useComputation(), { wrapper });
    expect(result.current.status).toBe("IDLE");
    expect(result.current.isComputing).toBe(false);
    expect(result.current.lastResult).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("transitions to COMPLETED on successful computation", async () => {
    const mockFlightPlan = { id: "fp-1", waypoints: [] };
    mockGenerateTrajectory.mockResolvedValueOnce({
      flight_plan: mockFlightPlan,
      mission_status: "PLANNED",
    });

    const { result } = renderHook(() => useComputation(), { wrapper });

    act(() => {
      result.current.startComputation("m-1");
    });

    expect(result.current.status).toBe("COMPUTING");

    await waitFor(() => {
      expect(result.current.status).toBe("COMPLETED");
    });

    expect(mockGenerateTrajectory).toHaveBeenCalledWith("m-1", expect.any(AbortSignal));
    expect(result.current.lastResult).toEqual(mockFlightPlan);
    expect(result.current.isComputing).toBe(false);
    expect(mockRefreshMissions).toHaveBeenCalled();
    expect(mockRefreshSelectedMission).toHaveBeenCalled();
  });

  it("transitions to FAILED on error", async () => {
    mockGenerateTrajectory.mockRejectedValueOnce(
      Object.assign(new Error("server error"), {
        response: { data: { detail: "trajectory computation failed" } },
      }),
    );

    const { result } = renderHook(() => useComputation(), { wrapper });

    act(() => {
      result.current.startComputation("m-1");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("FAILED");
    });

    expect(result.current.error).toBe("trajectory computation failed");
    expect(result.current.lastResult).toBeNull();
  });

  it("prevents double-trigger via computingRef guard", async () => {
    let resolveFirst: (value: unknown) => void;
    const firstCall = new Promise((r) => { resolveFirst = r; });
    mockGenerateTrajectory.mockReturnValueOnce(firstCall);

    const { result } = renderHook(() => useComputation(), { wrapper });

    act(() => {
      result.current.startComputation("m-1");
    });

    expect(result.current.status).toBe("COMPUTING");

    act(() => {
      result.current.startComputation("m-1");
    });

    expect(mockGenerateTrajectory).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst!({ flight_plan: { id: "fp-1" }, mission_status: "PLANNED" });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("COMPLETED");
    });
  });

  it("invalidates react query mission cache on computation success", async () => {
    mockGenerateTrajectory.mockResolvedValueOnce({
      flight_plan: { id: "fp-1" },
      mission_status: "PLANNED",
    });

    const invalidateSpy = vi.spyOn(testQueryClient, "invalidateQueries");

    const { result } = renderHook(() => useComputation(), { wrapper });

    act(() => {
      result.current.startComputation("m-1");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("COMPLETED");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["missions"],
    });
  });

  it("invalidates react query mission cache on computation failure", async () => {
    mockGenerateTrajectory.mockRejectedValueOnce(new Error("fail"));

    const invalidateSpy = vi.spyOn(testQueryClient, "invalidateQueries");

    const { result } = renderHook(() => useComputation(), { wrapper });

    act(() => {
      result.current.startComputation("m-1");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("FAILED");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["missions"],
    });
  });

  it("dismiss resets to IDLE", async () => {
    mockGenerateTrajectory.mockResolvedValueOnce({
      flight_plan: { id: "fp-1" },
      mission_status: "PLANNED",
    });

    const { result } = renderHook(() => useComputation(), { wrapper });

    act(() => {
      result.current.startComputation("m-1");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("COMPLETED");
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.status).toBe("IDLE");
    expect(result.current.lastResult).toBeNull();
  });
});

describe("ComputationContext polling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testQueryClient = createTestQueryClient();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts polling when selectedMission has COMPUTING status on mount", async () => {
    mockSelectedMission = { id: "m-1", name: "Test", computation_status: "COMPUTING" };
    mockGetComputationStatus.mockResolvedValueOnce({
      computation_status: "COMPLETED",
      computation_error: null,
    });

    const { result } = renderHook(() => useComputation(), { wrapper });

    expect(result.current.status).toBe("COMPUTING");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(mockGetComputationStatus).toHaveBeenCalledWith("m-1");
    expect(result.current.status).toBe("COMPLETED");
  });

  it("polling detects FAILED status from backend", async () => {
    mockSelectedMission = { id: "m-1", name: "Test", computation_status: "COMPUTING" };
    mockGetComputationStatus.mockResolvedValueOnce({
      computation_status: "FAILED",
      computation_error: "timed out",
    });

    const { result } = renderHook(() => useComputation(), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(result.current.status).toBe("FAILED");
    expect(result.current.error).toBe("timed out");
  });

  it("polling handles network error gracefully", async () => {
    mockSelectedMission = { id: "m-1", name: "Test", computation_status: "COMPUTING" };
    mockGetComputationStatus.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useComputation(), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(result.current.status).toBe("FAILED");
    expect(result.current.error).toBe("network error");
  });
});

describe("ComputationNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testQueryClient = createTestQueryClient();
    mockSelectedMission = { id: "m-1", name: "Test", computation_status: "IDLE" };
  });

  it("renders nothing when IDLE", () => {
    render(
      <QueryClientProvider client={testQueryClient}>
        <ComputationProvider>
          <ComputationNotification />
        </ComputationProvider>
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId("computation-notification")).not.toBeInTheDocument();
  });

  it("shows COMPUTING state via context", () => {
    mockSelectedMission = { id: "m-1", name: "Test Mission", computation_status: "IDLE" };
    mockGenerateTrajectory.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => useComputation(), { wrapper });

    act(() => {
      result.current.startComputation("m-1");
    });

    expect(result.current.status).toBe("COMPUTING");
    expect(result.current.missionName).toBe("Test Mission");
  });
});
