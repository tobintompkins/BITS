/** Blueprint 7.3B attendance domain values (shared labels live in event-check-in). */

export const EVENT_ATTENDANCE_STATUSES = [
  "EXPECTED",
  "PRESENT",
  "CHECKED_OUT",
  "NO_SHOW",
  "CANCELLED",
] as const;

export const EVENT_ATTENDANCE_SOURCES = [
  "STAFF_SEARCH",
  "STAFF_QR",
  "SELF_QR",
  "WALK_IN",
  "IMPORT",
  "ADMIN_CORRECTION",
] as const;

export const EVENT_ATTENDANCE_ACTIONS = [
  "CHECKED_IN",
  "CHECKED_OUT",
  "REENTERED",
  "MARKED_NO_SHOW",
  "UNDO_CHECK_IN",
  "STATUS_CORRECTED",
] as const;

export type EventAttendanceStatusValue =
  (typeof EVENT_ATTENDANCE_STATUSES)[number];
export type EventAttendanceSourceValue =
  (typeof EVENT_ATTENDANCE_SOURCES)[number];
export type EventAttendanceActionValue =
  (typeof EVENT_ATTENDANCE_ACTIONS)[number];
