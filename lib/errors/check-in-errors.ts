export const CHECK_IN_ERROR_CODES = [
  "CHECK_IN_DISABLED",
  "CHECK_IN_NOT_OPEN",
  "CHECK_IN_CLOSED",
  "EVENT_NOT_FOUND",
  "ATTENDEE_NOT_FOUND",
  "REGISTRATION_NOT_ELIGIBLE",
  "ATTENDEE_CANCELLED",
  "ATTENDEE_WAITLISTED",
  "ALREADY_CHECKED_IN",
  "CHECK_OUT_DISABLED",
  "REENTRY_DISABLED",
  "STATION_CLOSED",
  "INVALID_QR_PASS",
  "QR_PASS_EXPIRED",
  "QR_PASS_REVOKED",
  "WALK_INS_DISABLED",
  "REGISTRATION_REQUIRED",
  "CORRECTION_REASON_REQUIRED",
  "CAPACITY_UNAVAILABLE",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
] as const;

export type CheckInErrorCode = (typeof CHECK_IN_ERROR_CODES)[number];

export class CheckInError extends Error {
  readonly code: CheckInErrorCode;

  constructor(code: CheckInErrorCode, message: string) {
    super(message);
    this.name = "CheckInError";
    this.code = code;
  }
}

export function isCheckInError(error: unknown): error is CheckInError {
  return error instanceof CheckInError;
}
