export const REGISTRATION_ERROR_CODES = [
  "REGISTRATION_DISABLED",
  "REGISTRATION_NOT_OPEN",
  "REGISTRATION_CLOSED",
  "EVENT_NOT_FOUND",
  "EVENT_NOT_REGISTERABLE",
  "CAPACITY_UNAVAILABLE",
  "WAITLIST_DISABLED",
  "WAITLIST_FULL",
  "PARTY_SIZE_EXCEEDED",
  "DUPLICATE_ATTENDEE",
  "ALREADY_REGISTERED",
  "INVALID_HOUSEHOLD_MEMBER",
  "FORBIDDEN",
  "OFFER_INVALID",
  "OFFER_EXPIRED",
  "OFFER_ALREADY_USED",
  "CANCELLATION_DISABLED",
  "CANCELLATION_DEADLINE_PASSED",
  "NOT_FOUND",
  "VALIDATION",
] as const;

export type RegistrationErrorCode = (typeof REGISTRATION_ERROR_CODES)[number];

export class RegistrationError extends Error {
  readonly code: RegistrationErrorCode;

  constructor(code: RegistrationErrorCode, message: string) {
    super(message);
    this.name = "RegistrationError";
    this.code = code;
  }
}

export function isRegistrationError(error: unknown): error is RegistrationError {
  return error instanceof RegistrationError;
}
