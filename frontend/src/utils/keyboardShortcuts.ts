/**
 * keyboard shortcut helpers for editor pages.
 *
 * browsers emit e.key === "Z" (uppercase) when shift is held, so the redo
 * shortcut must normalise with toLowerCase() - comparing against "z" alone
 * silently misses Ctrl/Cmd+Shift+Z.
 */

export type UndoRedoAction = "undo" | "redo";

export function matchUndoRedoShortcut(e: KeyboardEvent): UndoRedoAction | null {
  /** match Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z (redo), ignoring form fields. */
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return null;
  if (!(e.ctrlKey || e.metaKey)) return null;
  if (e.key.toLowerCase() !== "z") return null;
  return e.shiftKey ? "redo" : "undo";
}
