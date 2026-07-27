import { NextResponse } from "next/server";

import {
  staffCheckOutApiBodySchema,
  staffCheckOutApiEventIdSchema,
  staffCheckOutIdempotencyKeySchema,
  type StaffCheckOutApiBody,
} from "@/lib/validation/staff-check-out-api";

/** Soft CSRF guard for cookie-authenticated browser calls. */
export function isTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type ParsedStaffCheckOutRequest =
  | {
      ok: true;
      eventId: string;
      body: StaffCheckOutApiBody;
      operationKey?: string;
    }
  | { ok: false; response: NextResponse };

/**
 * Shared thin request parsing for 7.3X check-out / re-entry routes.
 * No domain logic — shape/CSRF/content-type only.
 */
export async function parseStaffCheckOutRequest(
  request: Request,
  eventIdRaw: string,
): Promise<ParsedStaffCheckOutRequest> {
  if (!isTrustedOrigin(request)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Content-Type must be application/json." },
        { status: 415 },
      ),
    };
  }

  const eventIdParsed = staffCheckOutApiEventIdSchema.safeParse(eventIdRaw);
  if (!eventIdParsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid event id.",
          fieldErrors: { eventId: ["Must be a valid UUID."] },
        },
        { status: 400 },
      ),
    };
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      ),
    };
  }

  const bodyParsed = staffCheckOutApiBodySchema.safeParse(rawBody);
  if (!bodyParsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid request.",
          fieldErrors: bodyParsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      ),
    };
  }

  const idempotencyHeader = request.headers.get("idempotency-key");
  let operationKey: string | undefined;
  if (idempotencyHeader !== null && idempotencyHeader !== "") {
    const keyParsed =
      staffCheckOutIdempotencyKeySchema.safeParse(idempotencyHeader);
    if (!keyParsed.success) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "Invalid Idempotency-Key.",
            fieldErrors: {
              "Idempotency-Key": ["Must be 1–120 characters."],
            },
          },
          { status: 400 },
        ),
      };
    }
    operationKey = keyParsed.data;
  }

  return {
    ok: true,
    eventId: eventIdParsed.data,
    body: bodyParsed.data,
    operationKey,
  };
}
