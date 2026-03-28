/**
 * shared utilities for violation message display.
 */

/** strip [SUGGESTION] prefix from display message. */
export function cleanMessage(message: string): string {
  return message.replace(/^\[SUGGESTION\]\s*/i, "");
}
