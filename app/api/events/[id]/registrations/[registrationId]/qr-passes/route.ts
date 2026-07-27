import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { mapQrPassApiError, secretResponseHeaders } from "@/lib/api/qr-pass-errors";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import type { QrPassSecretResult } from "@/lib/events/qr-pass-secret-result";
import type { SafeQrPassDto } from "@/server/repositories/event-qr-pass.repository";
import {
  issueQrPassApiBodySchema,
  qrPassApiEventIdSchema,
  qrPassApiRegistrationIdSchema,
} from "@/lib/validation/event-qr-pass-api";
import {
  issueQrPassLifecycle,
  listQrPassesLifecycle,
} from "@/server/services/event-qr-pass-lifecycle.service";

type RouteContext = {
  params: Promise<{ id: string; registrationId: string }>;
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

function toMetadataPayload(pass: SafeQrPassDto) {
  return {
    id: pass.id,
    eventId: pass.eventId,
    registrationId: pass.registrationId,
    attendeeId: pass.attendeeId,
    bindingType: pass.attendeeId ? ("ATTENDEE" as const) : ("PARTY" as const),
    purpose: pass.purpose,
    status: pass.status,
    expiresAt: pass.expiresAt.toISOString(),
    createdAt: pass.createdAt.toISOString(),
    revokedAt: pass.revokedAt?.toISOString() ?? null,
    rotatedAt: pass.rotatedAt?.toISOString() ?? null,
  };
}

function toSecretPayload(result: QrPassSecretResult) {
  return {
    id: result.passId,
    eventId: result.eventId,
    registrationId: result.registrationId,
    attendeeId: result.attendeeId,
    purpose: result.purpose,
    expiresAt: result.expiresAt.toISOString(),
    reused: result.reused,
    /** One-time opaque bearer — only present on fresh issue/rotate. */
    rawToken: result.rawToken,
  };
}

/**
 * Blueprint 7.3R — list safe QR pass metadata.
 * GET /api/events/{eventId}/registrations/{registrationId}/qr-passes
 */
export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, registrationId } = await context.params;
  const eventIdParsed = qrPassApiEventIdSchema.safeParse(id);
  const registrationIdParsed =
    qrPassApiRegistrationIdSchema.safeParse(registrationId);
  if (!eventIdParsed.success || !registrationIdParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid route identifiers.",
        fieldErrors: {
          ...(eventIdParsed.success
            ? {}
            : { eventId: ["Must be a valid UUID."] }),
          ...(registrationIdParsed.success
            ? {}
            : { registrationId: ["Must be a valid UUID."] }),
        },
      },
      { status: 400 },
    );
  }

  try {
    const actor = await getActor();
    const items = await listQrPassesLifecycle(
      {
        eventId: eventIdParsed.data,
        registrationId: registrationIdParsed.data,
      },
      actor,
    );

    return NextResponse.json({
      data: {
        items: items.map((row) => toMetadataPayload(row)),
      },
    });
  } catch (error) {
    return mapQrPassApiError(error);
  }
}

/**
 * Blueprint 7.3R — issue a QR pass.
 * POST /api/events/{eventId}/registrations/{registrationId}/qr-passes
 *
 * Delegates to 7.3Q `issueQrPassLifecycle`. Raw token only on fresh mint.
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
  const eventIdParsed = qrPassApiEventIdSchema.safeParse(id);
  const registrationIdParsed =
    qrPassApiRegistrationIdSchema.safeParse(registrationId);
  if (!eventIdParsed.success || !registrationIdParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid route identifiers.",
        fieldErrors: {
          ...(eventIdParsed.success
            ? {}
            : { eventId: ["Must be a valid UUID."] }),
          ...(registrationIdParsed.success
            ? {}
            : { registrationId: ["Must be a valid UUID."] }),
        },
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

  const bodyParsed = issueQrPassApiBodySchema.safeParse(rawBody);
  if (!bodyParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid issue-pass request.",
        fieldErrors: bodyParsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const actor = await getActor();
    const result = await issueQrPassLifecycle(
      {
        eventId: eventIdParsed.data,
        registrationId: registrationIdParsed.data,
        attendeeId: bodyParsed.data.attendeeId ?? null,
      },
      actor,
    );

    return NextResponse.json(
      { data: toSecretPayload(result) },
      {
        status: result.reused ? 200 : 201,
        headers: secretResponseHeaders(),
      },
    );
  } catch (error) {
    return mapQrPassApiError(error);
  }
}
