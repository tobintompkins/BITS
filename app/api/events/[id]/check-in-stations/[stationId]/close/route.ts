import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { mapCheckInStationError } from "@/lib/api/check-in-station-errors";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  checkInStationApiEventIdSchema,
  checkInStationApiStationIdSchema,
  closeCheckInStationApiBodySchema,
} from "@/lib/validation/check-in-station-api";
import {
  closeCheckInStationLifecycle,
  type StationLifecycleDto,
} from "@/server/services/check-in-station-lifecycle.service";

type RouteContext = {
  params: Promise<{ id: string; stationId: string }>;
};

function toStationPayload(
  station: StationLifecycleDto,
  outcome: "CLOSED" | "ALREADY_CLOSED",
) {
  return {
    id: station.id,
    eventId: station.eventId,
    name: station.name,
    deviceLabel: station.deviceLabel,
    status: station.status,
    openedAt: station.openedAt.toISOString(),
    closedAt: station.closedAt?.toISOString() ?? null,
    lastActivityAt: station.lastActivityAt?.toISOString() ?? null,
    outcome,
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
 * Blueprint 7.3K — close a check-in station.
 * POST /api/events/{eventId}/check-in-stations/{stationId}/close
 *
 * Delegates entirely to 7.3J `closeCheckInStationLifecycle`.
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

  const { id, stationId } = await context.params;
  const eventIdParsed = checkInStationApiEventIdSchema.safeParse(id);
  if (!eventIdParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid event id.",
        fieldErrors: { eventId: ["Must be a valid UUID."] },
      },
      { status: 400 },
    );
  }

  const stationIdParsed = checkInStationApiStationIdSchema.safeParse(stationId);
  if (!stationIdParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid station id.",
        fieldErrors: { stationId: ["Must be a valid UUID."] },
      },
      { status: 400 },
    );
  }

  let rawBody: unknown = {};
  try {
    const text = await request.text();
    if (text.trim() !== "") {
      rawBody = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const bodyParsed = closeCheckInStationApiBodySchema.safeParse(rawBody);
  if (!bodyParsed.success) {
    return NextResponse.json(
      {
        error: "Close request must not include body fields.",
        fieldErrors: bodyParsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const actor = await getActor();
    const station = await closeCheckInStationLifecycle(
      {
        eventId: eventIdParsed.data,
        stationId: stationIdParsed.data,
      },
      actor,
    );

    return NextResponse.json({
      data: toStationPayload(
        station,
        station.transitioned ? "CLOSED" : "ALREADY_CLOSED",
      ),
    });
  } catch (error) {
    return mapCheckInStationError(error);
  }
}
