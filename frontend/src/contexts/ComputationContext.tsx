import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useMission } from "./MissionContext";
import { generateTrajectory, getComputationStatus } from "@/api/missions";
import type { FlightPlanResponse } from "@/types/flightPlan";
import type { ComputationStatus } from "@/types/enums";

const POLL_INTERVAL_MS = 3000;
const AUTO_DISMISS_SUCCESS_MS = 5000;
const AUTO_DISMISS_FAILURE_MS = 8000;
const SESSION_KEY = "tarmacview_computation";

interface ComputationState {
  status: ComputationStatus;
  missionId: string | null;
  missionName: string | null;
  error: string | null;
  lastResult: FlightPlanResponse | null;
}

function loadSessionState(): Partial<ComputationState> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSessionState(state: ComputationState): void {
  try {
    if (state.status === "IDLE") {
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        status: state.status,
        missionId: state.missionId,
        missionName: state.missionName,
        error: state.error,
      }));
    }
  } catch {
    // storage unavailable
  }
}

interface ComputationContextValue {
  status: ComputationStatus;
  missionId: string | null;
  missionName: string | null;
  error: string | null;
  isComputing: boolean;
  lastResult: FlightPlanResponse | null;
  startComputation: (missionId: string) => void;
  dismiss: () => void;
}

const ComputationContext = createContext<ComputationContextValue | null>(null);

export function ComputationProvider({ children }: { children: ReactNode }) {
  const { selectedMission, refreshMissions, refreshSelectedMission } = useMission();

  const [state, setState] = useState<ComputationState>(() => {
    const saved = loadSessionState();
    if (saved?.status === "COMPUTING" && typeof saved.missionId === "string") {
      return {
        status: "COMPUTING",
        missionId: saved.missionId,
        missionName: saved.missionName ?? null,
        error: null,
        lastResult: null,
      };
    }
    return {
      status: "IDLE",
      missionId: null,
      missionName: null,
      error: null,
      lastResult: null,
    };
  });

  useEffect(() => {
    saveSessionState(state);
  }, [state]);

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const computingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearDismissTimer();
    };
  }, [clearDismissTimer]);

  const dismiss = useCallback(() => {
    clearDismissTimer();
    setState((prev) => ({
      ...prev,
      status: "IDLE",
      error: null,
      lastResult: null,
    }));
  }, [clearDismissTimer]);

  const scheduleDismiss = useCallback(
    (ms: number) => {
      clearDismissTimer();
      dismissTimer.current = setTimeout(dismiss, ms);
    },
    [clearDismissTimer, dismiss],
  );

  const startComputation = useCallback(
    (missionId: string) => {
      if (computingRef.current) return;
      computingRef.current = true;
      clearDismissTimer();

      const name = selectedMission?.id === missionId ? selectedMission.name : null;

      setState({
        status: "COMPUTING",
        missionId,
        missionName: name,
        error: null,
        lastResult: null,
      });

      const controller = new AbortController();
      abortRef.current = controller;

      generateTrajectory(missionId, controller.signal)
        .then((result) => {
          setState({
            status: "COMPLETED",
            missionId,
            missionName: name,
            error: null,
            lastResult: result.flight_plan,
          });
          if (!mountedRef.current) return;
          refreshMissions();
          refreshSelectedMission();
          scheduleDismiss(AUTO_DISMISS_SUCCESS_MS);
        })
        .catch((err) => {
          if (err?.name === "AbortError" || err?.code === "ERR_CANCELED") return;
          let errorMsg = "trajectory computation failed";
          if (err?.response?.data?.detail) {
            const detail = err.response.data.detail;
            errorMsg = typeof detail === "string" ? detail : detail.error ?? errorMsg;
          } else if (err instanceof Error) {
            errorMsg = err.message;
          }
          setState({
            status: "FAILED",
            missionId,
            missionName: name,
            error: errorMsg,
            lastResult: null,
          });
          if (!mountedRef.current) return;
          refreshMissions();
          refreshSelectedMission();
          scheduleDismiss(AUTO_DISMISS_FAILURE_MS);
        })
        .finally(() => {
          computingRef.current = false;
          setState((prev) =>
            prev.status === "COMPUTING"
              ? { ...prev, status: "FAILED", error: "computation did not complete" }
              : prev,
          );
        });
    },
    [selectedMission, refreshMissions, refreshSelectedMission, clearDismissTimer, scheduleDismiss],
  );

  // reconcile restored session state with actual backend status
  useEffect(() => {
    if (state.status !== "COMPUTING" || computingRef.current || !state.missionId) {
      return;
    }

    if (selectedMission?.id === state.missionId) {
      if (selectedMission.computation_status === "COMPUTING") return;

      const bs = selectedMission.computation_status;
      if (bs === "COMPLETED") {
        setState((prev) => ({ ...prev, status: "COMPLETED", error: null }));
        refreshMissions();
        refreshSelectedMission();
        scheduleDismiss(AUTO_DISMISS_SUCCESS_MS);
      } else if (bs === "FAILED") {
        setState((prev) => ({
          ...prev,
          status: "FAILED",
          error: selectedMission.computation_error ?? null,
        }));
        refreshMissions();
        refreshSelectedMission();
        scheduleDismiss(AUTO_DISMISS_FAILURE_MS);
      } else {
        setState((prev) => ({ ...prev, status: "IDLE", error: null }));
      }
    } else if (selectedMission !== undefined) {
      // mission changed or loaded with a different id - stale session state
      setState((prev) => ({ ...prev, status: "IDLE", missionId: null, error: null }));
    }
  }, [
    state.status,
    state.missionId,
    selectedMission,
    refreshMissions,
    refreshSelectedMission,
    scheduleDismiss,
  ]);

  // on mount/mission change: if backend says COMPUTING, start polling
  useEffect(() => {
    if (
      selectedMission?.computation_status === "COMPUTING" &&
      !computingRef.current
    ) {
      setState({
        status: "COMPUTING",
        missionId: selectedMission.id,
        missionName: selectedMission.name,
        error: null,
        lastResult: null,
      });

      let cancelled = false;
      const id = setInterval(async () => {
        try {
          const res = await getComputationStatus(selectedMission.id);
          if (cancelled) return;
          if (res.computation_status === "COMPLETED") {
            clearInterval(id);
            setState((prev) => ({
              ...prev,
              status: "COMPLETED",
              error: null,
            }));
            refreshMissions();
            refreshSelectedMission();
            scheduleDismiss(AUTO_DISMISS_SUCCESS_MS);
          } else if (res.computation_status === "FAILED") {
            clearInterval(id);
            setState((prev) => ({
              ...prev,
              status: "FAILED",
              error: res.computation_error,
            }));
            refreshMissions();
            refreshSelectedMission();
            scheduleDismiss(AUTO_DISMISS_FAILURE_MS);
          } else if (res.computation_status === "IDLE") {
            clearInterval(id);
            setState((prev) => ({
              ...prev,
              status: "IDLE",
              error: null,
            }));
          }
        } catch (err) {
          if (cancelled) return;
          clearInterval(id);
          setState((prev) => ({
            ...prev,
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
          }));
          scheduleDismiss(AUTO_DISMISS_FAILURE_MS);
        }
      }, POLL_INTERVAL_MS);

      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }

    return undefined;
  }, [
    selectedMission?.id,
    selectedMission?.computation_status,
    selectedMission?.name,
    refreshMissions,
    refreshSelectedMission,
    scheduleDismiss,
  ]);

  const value: ComputationContextValue = {
    status: state.status,
    missionId: state.missionId,
    missionName: state.missionName,
    error: state.error,
    isComputing: state.status === "COMPUTING",
    lastResult: state.lastResult,
    startComputation,
    dismiss,
  };

  return (
    <ComputationContext.Provider value={value}>
      {children}
    </ComputationContext.Provider>
  );
}

export function useComputation(): ComputationContextValue {
  const ctx = useContext(ComputationContext);
  if (!ctx) {
    throw new Error("useComputation must be used within ComputationProvider");
  }
  return ctx;
}
