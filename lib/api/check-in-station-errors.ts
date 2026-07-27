import { NextResponse } from "next/server";

import { mapStaffCheckInError } from "@/lib/api/staff-check-in-errors";
import { isCheckInError } from "@/lib/errors/check-in-errors";

/**
 * Map 7.3J station lifecycle errors to safe HTTP responses.
 * Reuses staff check-in mapping; name conflicts surface as 409.
 */
export function mapCheckInStationError(error: unknown): NextResponse {
  if (
    isCheckInError(error) &&
    error.code === "VALIDATION" &&
    /already exists/i.test(error.message)
  ) {
    return NextResponse.json(
      { error: error.message, code: "STATION_NAME_CONFLICT" },
      { status: 409 },
    );
  }
  return mapStaffCheckInError(error);
}
