/**
 * shared utilities for violation message display.
 */

// strip legacy [SUGGESTION] prefix from display message.
// new code uses category='suggestion' instead of this prefix,
// but existing DB rows from before the migration may still have it.
export function cleanMessage(message: string): string {
  return message.replace(/^\[SUGGESTION\]\s*/i, "");
}
