import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { mapQrPassApiError, secretResponseHeaders } from "@/lib/api/qr-pass-errors";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  qrPassApiEventIdSchema,
  qrPassApiPassIdSchema,
  qrPassApiRegistrationIdSchema,
} from "@/lib/validation/event-qr-pass-api";
import { rotateQrPassLifecycle } from "@/server/services/event-qr-pass-lifecycle.service";

type RouteContext = {
  params: Promise<{ id: string; registrationId: string; passId: string }>;
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
 * Blueprint 7.3R — rotate a QR pass.
 * POST .../qr-passes/{passId}/rotate
 */
export async function POST(request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, registrationId, passId } = await context.params;
  const eventIdParsed = qrPassApiEventIdSchema.safeParse(id);
  const registrationIdParsed =
    qrPassApiRegistrationIdSchema.safeParse(registrationId);
  const passIdParsed = qrPassApiPassIdSchema.safeParse(passId);
  if (
    !eventIdParsed.success ||
    !registrationIdParsed.success ||
    !passIdParsed.success
  ) {
    return NextResponse.json(
      { error: "Invalid route identifiers." },
      { status: 400 },
    );
  }

  try {
    const actor = await getActor();
    const result = await rotateQrPassLifecycle(
      {
        eventId: eventIdParsed.data,
        registrationId: registrationIdParsed.data,
        passId: passIdParsed.data,
      },
      actor,
    );

    return NextResponse.json(
      {
        data: {
          id: result.passId,
          eventId: result.eventId,
          registrationId: result.registrationId,
          attendeeId: result.attendeeId,
          purpose: result.purpose,
          expiresAt: result.expiresAt.toISOString(),
          reused: result.reused,
          rawToken: result.rawToken,
        },
      },
      { status: 200, headers: secretResponseHeaders() },
    );
  } catch (error) {
    return mapQrPassApiError(error);
  }
}
