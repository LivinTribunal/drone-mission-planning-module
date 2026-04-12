import { useState, useCallback, useRef, useEffect } from "react";
import type { FlyAlongState, FlyAlongSpeed } from "@/types/map";

interface UseFlyAlongReturn {
  state: FlyAlongState;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setSpeed: (speed: FlyAlongSpeed) => void;
}

/** animation controller for flying along a trajectory in 3d view. */
export default function useFlyAlong(waypointCount: number): UseFlyAlongReturn {
  const [state, setState] = useState<FlyAlongState>({
    status: "idle",
    currentIndex: 0,
    speed: 2,
    progress: 0,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const waypointCountRef = useRef(waypointCount);
  waypointCountRef.current = waypointCount;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /** shared tick function for advancing to the next waypoint. */
  const advanceTick = useCallback(() => {
    setState((prev) => {
      if (prev.status !== "playing") return prev;
      const nextIndex = prev.currentIndex + 1;
      const count = waypointCountRef.current;
      if (nextIndex >= count) {
        clearTimer();
        return { ...prev, status: "idle", currentIndex: count - 1, progress: 100 };
      }
      const progress = (nextIndex / (count - 1)) * 100;
      return { ...prev, currentIndex: nextIndex, progress };
    });
  }, [clearTimer]);

  /** start the interval timer at a given speed. */
  const startInterval = useCallback(
    (speed: number) => {
      clearTimer();
      intervalRef.current = setInterval(advanceTick, 2000 / speed);
    },
    [clearTimer, advanceTick],
  );

  const play = useCallback(() => {
    if (waypointCount <= 0) return;

    setState((prev) => ({
      ...prev,
      status: "playing",
      currentIndex: prev.status === "paused" ? prev.currentIndex : 0,
      progress: prev.status === "paused" ? prev.progress : 0,
    }));

    startInterval(stateRef.current.speed);
  }, [waypointCount, startInterval]);

  const pause = useCallback(() => {
    clearTimer();
    setState((prev) => ({ ...prev, status: "paused" }));
  }, [clearTimer]);

  const stop = useCallback(() => {
    clearTimer();
    setState({ status: "idle", currentIndex: 0, speed: stateRef.current.speed, progress: 0 });
  }, [clearTimer]);

  const setSpeed = useCallback(
    (speed: FlyAlongSpeed) => {
      setState((prev) => ({ ...prev, speed }));
      if (stateRef.current.status === "playing") {
        startInterval(speed);
      }
    },
    [startInterval],
  );

  // cleanup on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return { state, play, pause, stop, setSpeed };
}
