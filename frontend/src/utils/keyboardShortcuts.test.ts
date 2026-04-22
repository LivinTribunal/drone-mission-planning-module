import { describe, it, expect } from "vitest";
import { matchUndoRedoShortcut } from "./keyboardShortcuts";

function keyEvent(init: KeyboardEventInit & { tag?: string }): KeyboardEvent {
  /** build a KeyboardEvent with an optional target tagName. */
  const e = new KeyboardEvent("keydown", init);
  if (init.tag) {
    const target = document.createElement(init.tag);
    Object.defineProperty(e, "target", { value: target });
  }
  return e;
}

describe("matchUndoRedoShortcut", () => {
  it("returns null when no modifier is pressed", () => {
    expect(matchUndoRedoShortcut(keyEvent({ key: "z" }))).toBeNull();
  });

  it("matches undo on Ctrl+Z", () => {
    expect(matchUndoRedoShortcut(keyEvent({ key: "z", ctrlKey: true }))).toBe("undo");
  });

  it("matches undo on Cmd+Z (macOS)", () => {
    expect(matchUndoRedoShortcut(keyEvent({ key: "z", metaKey: true }))).toBe("undo");
  });

  it("matches redo on Ctrl+Shift+Z even when the browser emits uppercase Z", () => {
    // regression: holding shift flips e.key to "Z" - the old check against
    // lowercase "z" never fired, so cmd/ctrl+shift+z silently did nothing.
    expect(
      matchUndoRedoShortcut(keyEvent({ key: "Z", ctrlKey: true, shiftKey: true })),
    ).toBe("redo");
  });

  it("matches redo on Cmd+Shift+Z (macOS)", () => {
    expect(
      matchUndoRedoShortcut(keyEvent({ key: "Z", metaKey: true, shiftKey: true })),
    ).toBe("redo");
  });

  it("still matches redo if the key is lowercase (some platforms)", () => {
    expect(
      matchUndoRedoShortcut(keyEvent({ key: "z", ctrlKey: true, shiftKey: true })),
    ).toBe("redo");
  });

  it("ignores shortcuts fired from form fields", () => {
    expect(
      matchUndoRedoShortcut(keyEvent({ key: "z", ctrlKey: true, tag: "INPUT" })),
    ).toBeNull();
    expect(
      matchUndoRedoShortcut(keyEvent({ key: "z", ctrlKey: true, tag: "TEXTAREA" })),
    ).toBeNull();
    expect(
      matchUndoRedoShortcut(keyEvent({ key: "z", ctrlKey: true, tag: "SELECT" })),
    ).toBeNull();
  });

  it("returns null for non-Z keys", () => {
    expect(matchUndoRedoShortcut(keyEvent({ key: "y", ctrlKey: true }))).toBeNull();
    expect(matchUndoRedoShortcut(keyEvent({ key: "a", ctrlKey: true }))).toBeNull();
  });
});
