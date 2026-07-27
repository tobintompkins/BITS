/** Blueprint 7.3P — secure QR pass data foundation constants. */

export const EVENT_QR_PASS_PURPOSES = ["EVENT_CHECK_IN"] as const;

export type EventQrPassPurpose = (typeof EVENT_QR_PASS_PURPOSES)[number];

export const EVENT_QR_PASS_STATUSES = [
  "ACTIVE",
  "REVOKED",
  "EXPIRED",
  "REPLACED",
] as const;

export type EventQrPassStatus = (typeof EVENT_QR_PASS_STATUSES)[number];

export const EVENT_QR_PASS_DEFAULT_PURPOSE = "EVENT_CHECK_IN" as const;

/**
 * Blueprint 7.3Q — registration statuses eligible for QR pass issue/rotate.
 * Stricter than general check-in eligibility (excludes PENDING).
 */
export const ELIGIBLE_REGISTRATION_STATUSES_FOR_QR_PASS = [
  "CONFIRMED",
  "CHECKED_IN",
] as const;

/** Attendee statuses eligible for attendee-bound QR pass issue/rotate. */
export const ELIGIBLE_ATTENDEE_STATUSES_FOR_QR_PASS = [
  "REGISTERED",
  "CONFIRMED",
  "CHECKED_IN",
] as const;

/** Hours after event end when a pass expires (no settings UI in 7.3Q). */
export const EVENT_QR_PASS_EXPIRY_HOURS_AFTER_EVENT_END = 24;

/** Bounded retries when a freshly generated hash collides. */
export const EVENT_QR_PASS_HASH_COLLISION_RETRIES = 3;

/**
 * Blueprint 7.3T — conservative max length for raw token / payload input.
 * Generated tokens are ~43 base64url chars; `BITS-CI:` prefix is allowed.
 */
export const EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH = 128;
