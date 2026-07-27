/**
 * Blueprint 7.3C — stricter eligibility than the broader ops check-in path.
 * Pending / waitlisted / offered / declined / expired registrations are rejected.
 */
export const STAFF_CHECK_IN_ELIGIBLE_REGISTRATION_STATUSES = [
  "CONFIRMED",
  "CHECKED_IN",
] as const;

export const STAFF_CHECK_IN_ELIGIBLE_ATTENDEE_STATUSES = [
  "REGISTERED",
  "CONFIRMED",
  "CHECKED_IN",
] as const;
