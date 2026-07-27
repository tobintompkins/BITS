import { NextResponse } from "next/server";

import { mapStaffCheckInError } from "@/lib/api/staff-check-in-errors";
import { isCheckInError } from "@/lib/errors/check-in-errors";

/**
 * Map 7.3Q QR pass lifecycle errors to safe HTTP responses.
 * Never includes raw tokens, hashes, or constraint details.
 */
export function mapQrPassApiError(error: unknown): NextResponse {
  if (isCheckInError(error)) {
    if (
      error.code === "QR_PASS_EXPIRED" ||
      error.code === "QR_PASS_REVOKED" ||
      error.code === "INVALID_QR_PASS"
    ) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 },
      );
    }
  }
  return mapStaffCheckInError(error);
}

export function secretResponseHeaders(): HeadersInit {
  return {
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}
