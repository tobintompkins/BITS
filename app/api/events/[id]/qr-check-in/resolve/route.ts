import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  mapQrCheckInApiError,
  secretResponseHeaders,
} from "@/lib/api/qr-check-in-errors";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  qrCheckInApiEventIdSchema,
  qrCheckInResolveApiBodySchema,
} from "@/lib/validation/qr-check-in-api";
import { resolveQrTokenForStaffApi } from "@/server/services/qr-staff-check-in.service";

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
 * Blueprint 7.3U — resolve a QR token (read-only).
 * POST /api/events/{eventId}/qr-check-in/resolve
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

  const bodyParsed = qrCheckInResolveApiBodySchema.safeParse(rawBody);
  if (!bodyParsed.success) {
    return NextResponse.json(
      {
        error: "QR pass is invalid.",
        code: "INVALID_QR_PASS",
      },
      { status: 409, headers: secretResponseHeaders() },
    );
  }

  try {
    const actor = await getActor();
    const result = await resolveQrTokenForStaffApi(
      {
        eventId: eventIdParsed.data,
        token: bodyParsed.data.token,
      },
      actor,
    );

    return NextResponse.json(
      {
        data: {
          passId: result.passId,
          eventId: result.eventId,
          registrationId: result.registrationId,
          bindingType: result.bindingType,
          attendeeId: result.attendeeId,
          eligibleAttendeeIds: result.eligibleAttendeeIds,
          expiresAt: result.expiresAt.toISOString(),
          eligibility: result.eligibility,
        },
      },
      { headers: secretResponseHeaders() },
    );
  } catch (error) {
    return mapQrCheckInApiError(error);
  }
}
