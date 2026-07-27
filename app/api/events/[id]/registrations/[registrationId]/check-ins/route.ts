import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { mapStaffCheckInError } from "@/lib/api/staff-check-in-errors";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  staffPartyCheckInApiBodySchema,
  staffPartyCheckInApiEventIdSchema,
  staffPartyCheckInApiRegistrationIdSchema,
  staffPartyCheckInIdempotencyKeySchema,
} from "@/lib/validation/staff-party-check-in-api";
import {
  staffCheckInSelectedParty,
  type StaffPartyCheckInResult,
} from "@/server/services/staff-check-in.service";

type RouteContext = {
  params: Promise<{ id: string; registrationId: string }>;
};

function toApiPayload(result: StaffPartyCheckInResult) {
  return {
    eventId: result.eventId,
    registrationId: result.registrationId,
    requestedCount: result.requestedCount,
    newlyCheckedInCount: result.newlyCheckedInCount,
    alreadyPresentCount: result.alreadyPresentCount,
    attendees: result.attendees.map((row) => ({
      attendeeId: row.attendeeId,
      attendanceId: row.attendanceId,
      status: row.status,
      firstCheckedInAt: row.firstCheckedInAt?.toISOString() ?? null,
      lastCheckedInAt: row.lastCheckedInAt?.toISOString() ?? null,
      checkInCount: row.checkInCount,
      outcome: row.outcome,
    })),
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
 * Blueprint 7.3G / 7.3N — thin authenticated selected-party staff check-in API.
 * POST /api/events/{eventId}/registrations/{registrationId}/check-ins
 *
 * Delegates entirely to 7.3F/7.3M `staffCheckInSelectedParty`.
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

  const { id, registrationId } = await context.params;
  const eventIdParsed = staffPartyCheckInApiEventIdSchema.safeParse(id);
  if (!eventIdParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid event id.",
        fieldErrors: { eventId: ["Must be a valid UUID."] },
      },
      { status: 400 },
    );
  }

  const registrationIdParsed =
    staffPartyCheckInApiRegistrationIdSchema.safeParse(registrationId);
  if (!registrationIdParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid registration id.",
        fieldErrors: { registrationId: ["Must be a valid UUID."] },
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

  const bodyParsed = staffPartyCheckInApiBodySchema.safeParse(rawBody);
  if (!bodyParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid party check-in request.",
        fieldErrors: bodyParsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const idempotencyHeader = request.headers.get("idempotency-key");
  let operationKey: string | undefined;
  if (idempotencyHeader !== null && idempotencyHeader !== "") {
    const keyParsed =
      staffPartyCheckInIdempotencyKeySchema.safeParse(idempotencyHeader);
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
    const result = await staffCheckInSelectedParty(
      {
        eventId: eventIdParsed.data,
        registrationId: registrationIdParsed.data,
        attendeeIds: bodyParsed.data.attendeeIds,
        stationId: bodyParsed.data.stationId,
        operationKey,
      },
      actor,
    );

    return NextResponse.json(
      { data: toApiPayload(result) },
      { status: result.newlyCheckedInCount > 0 ? 201 : 200 },
    );
  } catch (error) {
    return mapStaffCheckInError(error);
  }
}
