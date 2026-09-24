import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getMemberEventCalendar } from "@/server/services/member-event-calendar.service";

type RouteContext = {
  params: Promise<{ registrationId: string }>;
};

const NOT_FOUND_BODY = { error: "Not found" };

function notFound() {
  return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
}

/**
 * GET /api/portal/events/{registrationId}/calendar
 *
 * Returns an ownership-scoped .ics file for the signed-in member's own
 * eligible registration. Organization and account are resolved server-side.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { registrationId } = await context.params;
  const result = await getMemberEventCalendar(registrationId);

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
