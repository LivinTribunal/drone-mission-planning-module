import { useState, useCallback } from "react";

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
  const [state, setState] = useState<UndoRedoState<T>>({
    past: [],
    future: [],
  });

  const push = useCallback(
    (action: T) => {
      setState((prev) => ({
        past: [...prev.past, action].slice(-maxSteps),
        future: [],
      }));
    },
    [maxSteps],
  );

  const undo = useCallback((): T | undefined => {
    let result: T | undefined;
    setState((prev) => {
      if (prev.past.length === 0) return prev;
      const last = prev.past[prev.past.length - 1];
      result = last;
      return {
        past: prev.past.slice(0, -1),
        future: [last, ...prev.future].slice(0, maxSteps),
      };
    });
    return result;
  }, [maxSteps]);

  const redo = useCallback((): T | undefined => {
    let result: T | undefined;
    setState((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      result = next;
      return {
        past: [...prev.past, next].slice(-maxSteps),
        future: prev.future.slice(1),
      };
    });
    return result;
  }, [maxSteps]);

  const clear = useCallback(() => {
    setState({ past: [], future: [] });
  }, []);

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
