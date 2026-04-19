import { useRef, useEffect } from "react";
import { useComputation } from "@/contexts/ComputationContext";
import type { FlightPlanResponse } from "@/types/flightPlan";

/**
 * fires callback once when computation transitions from COMPUTING to COMPLETED.
 */
export function useOnComputationCompleted(
  onCompleted: (result: FlightPlanResponse) => void,
) {
  const { status, lastResult } = useComputation();
  const prevStatus = useRef(status);
  const callbackRef = useRef(onCompleted);
  callbackRef.current = onCompleted;

  useEffect(() => {
    if (
      prevStatus.current === "COMPUTING" &&
      status === "COMPLETED" &&
      lastResult
    ) {
      callbackRef.current(lastResult);
    }
    prevStatus.current = status;
  }, [status, lastResult]);
}
