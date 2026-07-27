import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  mapQrCheckInApiError,
  secretResponseHeaders,
} from "@/lib/api/qr-check-in-errors";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  qrCheckInApiBodySchema,
  qrCheckInApiEventIdSchema,
  qrCheckInIdempotencyKeySchema,
} from "@/lib/validation/qr-check-in-api";
import { checkInViaQrTokenForStaffApi } from "@/server/services/qr-staff-check-in.service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function getActor() {
  const userAccount = await getOrCreateUserAccount();
  const clerkUser = await currentUser();
  return {
    userAccountId: userAccount?.id ?? null,
    email:
      clerkUser?.primaryEmailAddress?.emailAddress ??
      userAccount?.primaryEmail ??
      null,
  };
}

function isTrustedOrigin(request: Request) {
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

/**
 * Blueprint 7.3U — check in via QR token (re-resolves; never trusts prior resolve).
 * POST /api/events/{eventId}/qr-check-in
 *
 * Raw token is accepted in the JSON body only. Do not log request bodies.
 */
export async function POST(request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  const { id } = await context.params;
  const eventIdParsed = qrCheckInApiEventIdSchema.safeParse(id);
  if (!eventIdParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid event id.",
        fieldErrors: { eventId: ["Must be a valid UUID."] },
      },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const bodyParsed = qrCheckInApiBodySchema.safeParse(rawBody);
  if (!bodyParsed.success) {
    // Avoid echoing malformed token/selection details.
    const issue = bodyParsed.error.issues[0];
    const isTokenIssue = issue?.path?.[0] === "token";
    if (isTokenIssue) {
      return NextResponse.json(
        { error: "QR pass is invalid.", code: "INVALID_QR_PASS" },
        { status: 409, headers: secretResponseHeaders() },
      );
    }
    return NextResponse.json(
      {
        error: issue?.message ?? "Invalid check-in request.",
        code: "VALIDATION",
      },
      { status: 400, headers: secretResponseHeaders() },
    );
  }

  const idempotencyHeader = request.headers.get("idempotency-key");
  let operationKey: string | undefined;
  if (idempotencyHeader !== null && idempotencyHeader !== "") {
    const keyParsed =
      qrCheckInIdempotencyKeySchema.safeParse(idempotencyHeader);
    if (!keyParsed.success) {
      return NextResponse.json(
        {
          error: "Invalid Idempotency-Key.",
          fieldErrors: {
            "Idempotency-Key": ["Must be 1–120 characters."],
          },
        },
        { status: 400 },
      );
    }
    operationKey = keyParsed.data;
  }

  try {
    const actor = await getActor();
    const outcome = await checkInViaQrTokenForStaffApi(
      {
        eventId: eventIdParsed.data,
        token: bodyParsed.data.token,
        attendeeIds: bodyParsed.data.attendeeIds,
        stationId: bodyParsed.data.stationId,
        operationKey,
      },
      actor,
    );

    if (outcome.kind === "SINGLE") {
      const result = outcome.result;
      return NextResponse.json(
        {
          data: {
            kind: "SINGLE" as const,
            attendanceId: result.attendanceId,
            eventId: result.eventId,
            attendeeId: result.attendeeId,
            status: result.status,
            firstCheckedInAt: result.firstCheckedInAt?.toISOString() ?? null,
            lastCheckedInAt: result.lastCheckedInAt?.toISOString() ?? null,
            checkInCount: result.checkInCount,
            alreadyPresent: result.alreadyPresent,
          },
        },
        {
          status: result.alreadyPresent ? 200 : 201,
          headers: secretResponseHeaders(),
        },
      );
    }

    const result = outcome.result;
    const allAlready = result.alreadyPresentCount === result.requestedCount;
    return NextResponse.json(
      {
        data: {
          kind: "PARTY" as const,
          eventId: result.eventId,
          registrationId: result.registrationId,
          requestedCount: result.requestedCount,
          newlyCheckedInCount: result.newlyCheckedInCount,
          alreadyPresentCount: result.alreadyPresentCount,
          attendees: result.attendees.map((row) => ({
            attendanceId: row.attendanceId,
            attendeeId: row.attendeeId,
            status: row.status,
            outcome: row.outcome,
            firstCheckedInAt: row.firstCheckedInAt?.toISOString() ?? null,
            lastCheckedInAt: row.lastCheckedInAt?.toISOString() ?? null,
            checkInCount: row.checkInCount,
          })),
        },
      },
      {
        status: allAlready ? 200 : 201,
        headers: secretResponseHeaders(),
      },
    );
  } catch (error) {
    return mapQrCheckInApiError(error);
  }
}
