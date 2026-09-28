import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getMemberVolunteerServiceCalendar } from "@/server/services/member-volunteer-service-calendar.service";

type RouteContext = {
  params: Promise<{ assignmentId: string }>;
};

const NOT_FOUND_BODY = { error: "Not found" };

function notFound() {
  return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
}

/**
 * GET /api/portal/volunteer-schedule/{assignmentId}/calendar
 *
 * Returns an ownership-scoped .ics file for the signed-in member's own
 * upcoming scheduled volunteer assignment. Organization and member are
 * resolved server-side.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assignmentId } = await context.params;
  const result = await getMemberVolunteerServiceCalendar(assignmentId);

  if (result.status === "SIGNED_OUT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (result.status !== "READY") {
    return notFound();
  }

  return new NextResponse(result.ics, {
    headers: result.headers,
  });
}
