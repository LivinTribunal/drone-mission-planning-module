import { useState, useCallback, useMemo } from "react";

interface PendingChange {
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete";
  data?: Record<string, unknown>;
}

interface DirtyStateReturn {
  isDirty: boolean;
  markDirty: (entityType: string, entityId: string, action: PendingChange["action"], data?: Record<string, unknown>) => void;
  clearAll: () => void;
  getPendingChanges: () => PendingChange[];
}

export default function useDirtyState(): DirtyStateReturn {
  /** track pending edits across entity types for batched saving. */
  const [changes, setChanges] = useState<Map<string, PendingChange>>(new Map());

  const markDirty = useCallback(
    (entityType: string, entityId: string, action: PendingChange["action"], data?: Record<string, unknown>) => {
      /** record a pending change by entity type and id. */
      const key = `${entityType}:${entityId}`;
      setChanges((prev) => {
        const next = new Map(prev);
        next.set(key, { entityType, entityId, action, data });
        return next;
      });
    },
    [],
  );

  const clearAll = useCallback(() => {
    /** clear all pending changes after successful save. */
    setChanges(new Map());
  }, []);

  const getPendingChanges = useCallback(() => {
    /** return array of all pending changes. */
    return Array.from(changes.values());
  }, [changes]);

  const isDirty = useMemo(() => changes.size > 0, [changes]);

  return { isDirty, markDirty, clearAll, getPendingChanges };
}
