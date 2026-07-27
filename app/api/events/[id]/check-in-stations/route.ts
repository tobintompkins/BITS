import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { mapCheckInStationError } from "@/lib/api/check-in-station-errors";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  checkInStationApiEventIdSchema,
  listCheckInStationsApiQuerySchema,
  openCheckInStationApiBodySchema,
} from "@/lib/validation/check-in-station-api";
import {
  listCheckInStationsLifecycle,
  openCheckInStationLifecycle,
  type StationLifecycleDto,
} from "@/server/services/check-in-station-lifecycle.service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function toStationPayload(
  station: StationLifecycleDto,
  outcome?: "CREATED" | "CLOSED" | "ALREADY_CLOSED",
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
    ...(outcome ? { outcome } : {}),
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
 * Blueprint 7.3K — list check-in stations.
 * GET /api/events/{eventId}/check-in-stations
 */
export async function GET(request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
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

  const url = new URL(request.url);
  const queryParsed = listCheckInStationsApiQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!queryParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid list query.",
        fieldErrors: queryParsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const actor = await getActor();
    const result = await listCheckInStationsLifecycle(
      {
        eventId: eventIdParsed.data,
        status: queryParsed.data.status,
        page: queryParsed.data.page,
        pageSize: queryParsed.data.pageSize,
      },
      actor,
    );

    return NextResponse.json({
      data: {
        items: result.items.map((row) => toStationPayload(row)),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      },
    });
  } catch (error) {
    return mapCheckInStationError(error);
  }
}

/**
 * Blueprint 7.3K — open a check-in station.
 * POST /api/events/{eventId}/check-in-stations
 *
 * Delegates entirely to 7.3J `openCheckInStationLifecycle`.
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const bodyParsed = openCheckInStationApiBodySchema.safeParse(rawBody);
  if (!bodyParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid open-station request.",
        fieldErrors: bodyParsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const actor = await getActor();
    const station = await openCheckInStationLifecycle(
      {
        eventId: eventIdParsed.data,
        name: bodyParsed.data.name,
        deviceLabel: bodyParsed.data.deviceLabel,
      },
      actor,
    );

    return NextResponse.json(
      { data: toStationPayload(station, "CREATED") },
      { status: 201 },
    );
  } catch (error) {
    return mapCheckInStationError(error);
  }
}
