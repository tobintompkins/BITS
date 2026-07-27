import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { mapStaffCheckInError } from "@/lib/api/staff-check-in-errors";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  staffCheckInApiBodySchema,
  staffCheckInApiEventIdSchema,
  staffCheckInIdempotencyKeySchema,
} from "@/lib/validation/staff-check-in-api";
import {
  staffCheckInRegisteredAttendee,
  type StaffCheckInResult,
} from "@/server/services/staff-check-in.service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function toApiPayload(result: StaffCheckInResult) {
  return {
    attendanceId: result.attendanceId,
    eventId: result.eventId,
    attendeeId: result.attendeeId,
    status: result.status,
    firstCheckedInAt: result.firstCheckedInAt?.toISOString() ?? null,
    lastCheckedInAt: result.lastCheckedInAt?.toISOString() ?? null,
    checkInCount: result.checkInCount,
    alreadyPresent: result.alreadyPresent,
  };
}

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

/** Soft CSRF guard for cookie-authenticated browser calls (Origin must match Host when present). */
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
 * Blueprint 7.3D / 7.3N — thin authenticated staff check-in API.
 * POST /api/events/{eventId}/check-ins
 *
 * Delegates entirely to 7.3C/7.3M `staffCheckInRegisteredAttendee`.
 * Optional `stationId` is validated for shape only; domain rules live in 7.3M.
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
  const eventIdParsed = staffCheckInApiEventIdSchema.safeParse(id);
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

  const bodyParsed = staffCheckInApiBodySchema.safeParse(rawBody);
  if (!bodyParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid check-in request.",
        fieldErrors: bodyParsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const idempotencyHeader = request.headers.get("idempotency-key");
  let operationKey: string | undefined;
  if (idempotencyHeader !== null && idempotencyHeader !== "") {
    const keyParsed =
      staffCheckInIdempotencyKeySchema.safeParse(idempotencyHeader);
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
    const result = await staffCheckInRegisteredAttendee(
      {
        eventId: eventIdParsed.data,
        attendeeId: bodyParsed.data.attendeeId,
        stationId: bodyParsed.data.stationId,
        operationKey,
      },
      actor,
    );

    return NextResponse.json(
      { data: toApiPayload(result) },
      { status: result.alreadyPresent ? 200 : 201 },
    );
  } catch (error) {
    return mapStaffCheckInError(error);
  }
}
