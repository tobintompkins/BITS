import { NextResponse } from "next/server";

import { mapStaffCheckInError } from "@/lib/api/staff-check-in-errors";
import { secretResponseHeaders } from "@/lib/api/qr-pass-errors";
import { isCheckInError } from "@/lib/errors/check-in-errors";

/**
 * Blueprint 7.3U — map resolve/check-in errors without echoing token material.
 */
export function mapQrCheckInApiError(error: unknown): NextResponse {
  if (isCheckInError(error) && error.code === "INVALID_QR_PASS") {
    return NextResponse.json(
      { error: "QR pass is invalid.", code: "INVALID_QR_PASS" },
      { status: 409, headers: secretResponseHeaders() },
    );
  }

  if (
    isCheckInError(error) &&
    (error.code === "QR_PASS_EXPIRED" || error.code === "QR_PASS_REVOKED")
  ) {
    return NextResponse.json(
      { error: "QR pass is invalid.", code: "INVALID_QR_PASS" },
      { status: 409, headers: secretResponseHeaders() },
    );
  }

  const mapped = mapStaffCheckInError(error);
  const headers = new Headers(mapped.headers);
  for (const [key, value] of Object.entries(secretResponseHeaders())) {
    headers.set(key, value);
  }
  return new NextResponse(mapped.body, {
    status: mapped.status,
    statusText: mapped.statusText,
    headers,
  });
}

export { secretResponseHeaders };
