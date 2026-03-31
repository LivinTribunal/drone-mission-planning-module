import { useState, useCallback, useRef } from "react";

interface UndoRedoState<T> {
  past: T[];
  future: T[];
}

interface UndoRedoReturn<T> {
  push: (action: T) => void;
  undo: () => T | undefined;
  redo: () => T | undefined;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function useUndoRedo<T>(maxSteps = 10): UndoRedoReturn<T> {
  /** manages an undo/redo stack with a configurable max depth. */
  const [state, setState] = useState<UndoRedoState<T>>({
    past: [],
    future: [],
  });
  const stateRef = useRef(state);

  const updateState = useCallback(
    (updater: (prev: UndoRedoState<T>) => UndoRedoState<T>) => {
      /** update state and keep ref in sync. */
      setState((prev) => {
        const next = updater(prev);
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  const push = useCallback(
    (action: T) => {
      /** push a new action onto the undo stack. */
      updateState((prev) => ({
        past: [...prev.past, action].slice(-maxSteps),
        future: [],
      }));
    },
    [maxSteps, updateState],
  );

  const undo = useCallback((): T | undefined => {
    /** pop the last action from the undo stack. */
    const current = stateRef.current;
    if (current.past.length === 0) return undefined;
    const last = current.past[current.past.length - 1];
    updateState((prev) => ({
      past: prev.past.slice(0, -1),
      future: [last, ...prev.future].slice(0, maxSteps),
    }));
    return last;
  }, [maxSteps, updateState]);

  const redo = useCallback((): T | undefined => {
    /** pop the first action from the redo stack. */
    const current = stateRef.current;
    if (current.future.length === 0) return undefined;
    const next = current.future[0];
    updateState((prev) => ({
      past: [...prev.past, next].slice(-maxSteps),
      future: prev.future.slice(1),
    }));
    return next;
  }, [maxSteps, updateState]);

  const clear = useCallback(() => {
    /** clear all undo/redo history. */
    updateState(() => ({ past: [], future: [] }));
  }, [updateState]);

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
