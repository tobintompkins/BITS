/**
 * Blueprint 7.3B — safe metadata for attendance-action history.
 * Allowlisted keys only; rejects secrets, tokens, and unnecessary PII.
 */

export const ATTENDANCE_ACTION_METADATA_ALLOWED_KEYS = [
  "note",
  "from",
  "to",
  "stationName",
  "operationKey",
  "correctionType",
] as const;

const FORBIDDEN_KEY_PATTERN =
  /(token|password|secret|authorization|bearer|cookie|qr|email|phone|dietary|accommodation|ssn|passport)/i;

const MAX_STRING_LENGTH = 200;
const MAX_KEYS = 12;

export type AttendanceActionMetadata = Partial<
  Record<(typeof ATTENDANCE_ACTION_METADATA_ALLOWED_KEYS)[number], string>
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates and returns a safe metadata object, or null when input is empty.
 * Throws Error with a stable message on rejection.
 */
export function sanitizeAttendanceActionMetadata(
  metadata: unknown,
): AttendanceActionMetadata | null {
  if (metadata === null || metadata === undefined) return null;

  if (!isPlainObject(metadata)) {
    throw new Error("Attendance action metadata must be a plain object.");
  }

  const entries = Object.entries(metadata);
  if (entries.length === 0) return null;
  if (entries.length > MAX_KEYS) {
    throw new Error("Attendance action metadata has too many keys.");
  }

  const allowed = new Set<string>(ATTENDANCE_ACTION_METADATA_ALLOWED_KEYS);
  const cleaned: AttendanceActionMetadata = {};

  for (const [key, value] of entries) {
    if (FORBIDDEN_KEY_PATTERN.test(key) || !allowed.has(key)) {
      throw new Error(
        `Attendance action metadata key "${key}" is not allowed.`,
      );
    }
    if (value === null || value === undefined) continue;
    if (typeof value !== "string") {
      throw new Error(
        `Attendance action metadata value for "${key}" must be a string.`,
      );
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_STRING_LENGTH) {
      throw new Error(
        `Attendance action metadata value for "${key}" is too long.`,
      );
    }
    if (FORBIDDEN_KEY_PATTERN.test(trimmed)) {
      throw new Error(
        `Attendance action metadata value for "${key}" looks sensitive.`,
      );
    }
    cleaned[key as keyof AttendanceActionMetadata] = trimmed;
  }

  return Object.keys(cleaned).length > 0 ? cleaned : null;
}
