import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useDirtyState from "./useDirtyState";

describe("useDirtyState", () => {
  it("starts clean", () => {
    const { result } = renderHook(() => useDirtyState());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.getPendingChanges()).toEqual([]);
  });

  it("marks dirty after markDirty call", () => {
    const { result } = renderHook(() => useDirtyState());
    act(() => result.current.markDirty("surface", "s1", "update", { name: "RWY 09" }));
    expect(result.current.isDirty).toBe(true);
    expect(result.current.getPendingChanges()).toHaveLength(1);
    expect(result.current.getPendingChanges()[0]).toEqual({
      entityType: "surface",
      entityId: "s1",
      action: "update",
      data: { name: "RWY 09" },
    });
  });

  it("overwrites previous change for same entity", () => {
    const { result } = renderHook(() => useDirtyState());
    act(() => result.current.markDirty("surface", "s1", "update", { name: "A" }));
    act(() => result.current.markDirty("surface", "s1", "update", { name: "B" }));
    expect(result.current.getPendingChanges()).toHaveLength(1);
    expect(result.current.getPendingChanges()[0].data).toEqual({ name: "B" });
  });

  it("tracks multiple entities independently", () => {
    const { result } = renderHook(() => useDirtyState());
    act(() => result.current.markDirty("surface", "s1", "update", { name: "A" }));
    act(() => result.current.markDirty("obstacle", "o1", "update", { height: 10 }));
    expect(result.current.getPendingChanges()).toHaveLength(2);
  });

  it("merges field changes for same entity", () => {
    const { result } = renderHook(() => useDirtyState());
    act(() => result.current.markDirty("surface", "s1", "update", { name: "RWY 09" }));
    act(() => result.current.markDirty("surface", "s1", "update", { length: 3000 }));
    expect(result.current.getPendingChanges()).toHaveLength(1);
    expect(result.current.getPendingChanges()[0].data).toEqual({ name: "RWY 09", length: 3000 });
  });

  it("clearAll resets to clean state", () => {
    const { result } = renderHook(() => useDirtyState());
    act(() => result.current.markDirty("surface", "s1", "update", { name: "A" }));
    act(() => result.current.clearAll());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.getPendingChanges()).toEqual([]);
  });
});
