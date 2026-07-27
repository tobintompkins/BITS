import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { mapStaffCheckOutError } from "@/lib/api/staff-check-out-errors";
import { parseStaffCheckOutRequest } from "@/lib/api/staff-check-out-request";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  staffCheckOutRegisteredAttendee,
  type StaffCheckOutResult,
} from "@/server/services/staff-check-out.service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function toApiPayload(result: StaffCheckOutResult) {
  return {
    attendanceId: result.attendanceId,
    eventId: result.eventId,
    attendeeId: result.attendeeId,
    status: result.status,
    firstCheckedInAt: result.firstCheckedInAt?.toISOString() ?? null,
    lastCheckedInAt: result.lastCheckedInAt?.toISOString() ?? null,
    checkedOutAt: result.checkedOutAt?.toISOString() ?? null,
    checkInCount: result.checkInCount,
    outcome: result.outcome,
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

/**
 * Blueprint 7.3X — thin authenticated staff check-out API.
 * POST /api/events/{eventId}/check-outs
 *
 * Delegates entirely to 7.3W `staffCheckOutRegisteredAttendee`.
 * Uses attendeeId (established 7.3D convention), not attendanceId.
 */
export async function POST(request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = await parseStaffCheckOutRequest(request, id);
  if (!parsed.ok) return parsed.response;

  try {
    const actor = await getActor();
    const result = await staffCheckOutRegisteredAttendee(
      {
        eventId: parsed.eventId,
        attendeeId: parsed.body.attendeeId,
        stationId: parsed.body.stationId,
        operationKey: parsed.operationKey,
      },
      actor,
    );

    return NextResponse.json(
      { data: toApiPayload(result) },
      { status: result.outcome === "ALREADY_CHECKED_OUT" ? 200 : 201 },
    );
  } catch (error) {
    return mapStaffCheckOutError(error);
  }
}
