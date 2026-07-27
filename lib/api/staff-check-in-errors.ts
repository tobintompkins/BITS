import { NextResponse } from "next/server";

import {
  type CheckInErrorCode,
  isCheckInError,
} from "@/lib/errors/check-in-errors";

const NOT_FOUND_CODES: CheckInErrorCode[] = [
  "ATTENDEE_NOT_FOUND",
  "EVENT_NOT_FOUND",
  "NOT_FOUND",
];

const CONFLICT_CODES: CheckInErrorCode[] = [
  "CHECK_IN_DISABLED",
  "CHECK_IN_NOT_OPEN",
  "CHECK_IN_CLOSED",
  "REGISTRATION_NOT_ELIGIBLE",
  "ATTENDEE_CANCELLED",
  "ATTENDEE_WAITLISTED",
  "REENTRY_DISABLED",
  "ALREADY_CHECKED_IN",
  "CAPACITY_UNAVAILABLE",
  "STATION_CLOSED",
];

/**
 * Map 7.3C domain errors to safe HTTP responses.
 * Cross-tenant misses already surface as ATTENDEE_NOT_FOUND / EVENT_NOT_FOUND.
 */
export function mapStaffCheckInError(error: unknown): NextResponse {
  if (isCheckInError(error)) {
    if (error.code === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Forbidden", code: error.code },
        { status: 403 },
      );
    }
    if (NOT_FOUND_CODES.includes(error.code)) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    if (CONFLICT_CODES.includes(error.code)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 },
      );
    }
    if (error.code === "VALIDATION") {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      );
    }
  }

  if (error instanceof Error && /permission/i.test(error.message)) {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  return NextResponse.json(
    { error: "Unable to complete check-in." },
    { status: 500 },
  );
}
