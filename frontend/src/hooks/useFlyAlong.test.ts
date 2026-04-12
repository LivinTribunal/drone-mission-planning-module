import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useFlyAlong from "./useFlyAlong";

describe("useFlyAlong", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with idle state", () => {
    const { result } = renderHook(() => useFlyAlong(10));
    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.currentIndex).toBe(0);
    expect(result.current.state.speed).toBe(2);
    expect(result.current.state.progress).toBe(0);
  });

  it("does nothing when play is called with zero waypoints", () => {
    const { result } = renderHook(() => useFlyAlong(0));
    act(() => result.current.play());
    expect(result.current.state.status).toBe("idle");
  });

  it("transitions to playing on play", () => {
    const { result } = renderHook(() => useFlyAlong(5));
    act(() => result.current.play());
    expect(result.current.state.status).toBe("playing");
    expect(result.current.state.currentIndex).toBe(0);
  });

  it("advances through waypoints on interval ticks", () => {
    const { result } = renderHook(() => useFlyAlong(5));
    act(() => result.current.play());

    // default speed is 2, interval = 2000/2 = 1000ms
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.state.currentIndex).toBe(1);
    expect(result.current.state.progress).toBe(25);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.state.currentIndex).toBe(2);
    expect(result.current.state.progress).toBe(50);
  });

  it("returns to idle when reaching the end", () => {
    const { result } = renderHook(() => useFlyAlong(3));
    act(() => result.current.play());

    // 3 waypoints: index 0->1->2->(3 >= 3 so idle)
    act(() => vi.advanceTimersByTime(1000));
    act(() => vi.advanceTimersByTime(1000));
    act(() => vi.advanceTimersByTime(1000));

    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.progress).toBe(100);
  });

  it("pauses and resumes from paused position", () => {
    const { result } = renderHook(() => useFlyAlong(10));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.state.currentIndex).toBe(1);

    act(() => result.current.pause());
    expect(result.current.state.status).toBe("paused");
    expect(result.current.state.currentIndex).toBe(1);

    // timer should not advance while paused
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.state.currentIndex).toBe(1);

    // resume
    act(() => result.current.play());
    expect(result.current.state.status).toBe("playing");
    expect(result.current.state.currentIndex).toBe(1);
  });

  it("stop resets to idle at index 0", () => {
    const { result } = renderHook(() => useFlyAlong(10));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(3000));

    act(() => result.current.stop());
    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.currentIndex).toBe(0);
    expect(result.current.state.progress).toBe(0);
  });

  it("setSpeed updates speed and restarts interval when playing", () => {
    const { result } = renderHook(() => useFlyAlong(20));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.state.currentIndex).toBe(1);

    // change speed to 10 -> interval = 2000/10 = 200ms
    act(() => result.current.setSpeed(10));
    expect(result.current.state.speed).toBe(10);

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.state.currentIndex).toBe(2);
  });

  it("clears interval on unmount", () => {
    const clearSpy = vi.spyOn(global, "clearInterval");
    const { result, unmount } = renderHook(() => useFlyAlong(10));
    act(() => result.current.play());

    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
