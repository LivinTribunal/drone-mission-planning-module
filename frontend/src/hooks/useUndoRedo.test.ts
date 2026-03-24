import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useUndoRedo from "./useUndoRedo";

describe("useUndoRedo", () => {
  it("starts with empty stacks", () => {
    const { result } = renderHook(() => useUndoRedo<string>());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("push enables undo", () => {
    const { result } = renderHook(() => useUndoRedo<string>());
    act(() => result.current.push("a"));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("undo enables redo and reduces undo stack", () => {
    const { result } = renderHook(() => useUndoRedo<string>());
    act(() => result.current.push("a"));
    act(() => result.current.push("b"));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("redo moves item back to undo stack", () => {
    const { result } = renderHook(() => useUndoRedo<string>());
    act(() => result.current.push("a"));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  it("push clears future stack", () => {
    const { result } = renderHook(() => useUndoRedo<string>());
    act(() => result.current.push("a"));
    act(() => result.current.push("b"));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.push("c"));
    expect(result.current.canRedo).toBe(false);
  });

  it("respects max steps", () => {
    const { result } = renderHook(() => useUndoRedo<number>(3));
    act(() => {
      for (let i = 0; i < 5; i++) result.current.push(i);
    });

    // only 3 items in past
    let count = 0;
    while (result.current.canUndo) {
      act(() => result.current.undo());
      count++;
    }
    expect(count).toBe(3);
  });

  it("clear resets both stacks", () => {
    const { result } = renderHook(() => useUndoRedo<string>());
    act(() => result.current.push("a"));
    act(() => result.current.push("b"));
    act(() => result.current.undo());
    act(() => result.current.clear());

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
