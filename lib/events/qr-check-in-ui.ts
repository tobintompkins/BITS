/**
 * Blueprint 7.3V — helpers for staff QR check-in UI privacy/cleanup.
 * Raw tokens must remain ephemeral component memory only.
 */

export const FORBIDDEN_QR_TOKEN_STORAGE_KEYS = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "cookie",
  "query",
  "url",
] as const;

/** Clear a bearer token held in a mutable ref/slot. */
export function clearEphemeralQrCheckInToken(slot: {
  current: string | null;
}) {
  slot.current = null;
}

/**
 * True when a feedback/error string appears to echo a raw token.
 * Used by tests to guard against accidental leakage in UI copy.
 */
export function feedbackLeaksQrToken(
  feedback: string,
  rawToken: string,
): boolean {
  if (!rawToken) return false;
  return feedback.includes(rawToken);
}
