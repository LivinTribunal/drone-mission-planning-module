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

interface ComputationState {
  status: ComputationStatus;
  missionId: string | null;
  missionName: string | null;
  error: string | null;
  lastResult: FlightPlanResponse | null;
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

  const [state, setState] = useState<ComputationState>({
    status: "IDLE",
    missionId: null,
    missionName: null,
    error: null,
    lastResult: null,
  });

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const computingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
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

      // abort any previous in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      generateTrajectory(missionId, controller.signal)
        .then((result) => {
          if (!mountedRef.current) return;
          setState({
            status: "COMPLETED",
            missionId,
            missionName: name,
            error: null,
            lastResult: result.flight_plan,
          });
          refreshMissions();
          refreshSelectedMission();
          scheduleDismiss(AUTO_DISMISS_SUCCESS_MS);
        })
        .catch((err) => {
          if (!mountedRef.current) return;
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
          refreshMissions();
          refreshSelectedMission();
          scheduleDismiss(AUTO_DISMISS_FAILURE_MS);
        })
        .finally(() => {
          computingRef.current = false;
        });
    },
    [selectedMission, refreshMissions, refreshSelectedMission, clearDismissTimer, scheduleDismiss],
  );

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
