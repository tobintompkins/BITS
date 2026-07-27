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
  "CHECK_OUT_DISABLED",
  "REENTRY_DISABLED",
  "REGISTRATION_NOT_ELIGIBLE",
  "ATTENDEE_CANCELLED",
  "ATTENDEE_WAITLISTED",
  "STATION_CLOSED",
  // Invalid current attendance state for check-out / re-entry.
  "VALIDATION",
];

/**
 * Map 7.3W domain errors to safe HTTP responses for check-out / re-entry APIs.
 */
export function mapStaffCheckOutError(error: unknown): NextResponse {
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
  }

  if (error instanceof Error && /permission/i.test(error.message)) {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  return NextResponse.json(
    { error: "Unable to complete check-out or re-entry." },
    { status: 500 },
  );
}
