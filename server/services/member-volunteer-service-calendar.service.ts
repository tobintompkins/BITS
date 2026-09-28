import { createHash } from "node:crypto";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { buildEventIcs } from "@/lib/calendar/ics";
import { prisma } from "@/lib/db/prisma";
import { sanitizeCalendarFileName } from "@/lib/validation/member-event-calendar";
import {
  MEMBER_VOLUNTEER_SERVICE_CALENDAR_EVENT_STATUSES,
  memberVolunteerServiceAssignmentSchema,
  volunteerAssignmentCalendarDescription,
} from "@/lib/validation/member-volunteer-service-calendar";
import { publicVolunteerLocationText } from "@/lib/validation/volunteer-service-schedule";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const publicLocationSelect = {
  name: true,
  roomName: true,
  isOnline: true,
  city: true,
  state: true,
} as const;

function assignmentIdFrom(input: unknown) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && "assignmentId" in input) {
    return (input as { assignmentId?: unknown }).assignmentId;
  }
  return undefined;
}

export const memberVolunteerServiceCalendarDownloadHeaders = (
  fileName: string,
) => ({
  "Content-Type": "text/calendar; charset=utf-8",
  "Content-Disposition": `attachment; filename="${fileName}"`,
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
});

export function volunteerAssignmentCalendarUid(assignmentId: string) {
  const digest = createHash("sha256")
    .update(`member-volunteer-service:${assignmentId}`)
    .digest("hex")
    .slice(0, 20);
  return `bits-${digest}@member-volunteer-service`;
}

function upcomingEventWhere(organizationId: string, now: Date) {
  return {
    organizationId,
    eventStatus: { in: [...MEMBER_VOLUNTEER_SERVICE_CALENDAR_EVENT_STATUSES] },
    endDateTime: { gte: now },
  };
}

export type MemberVolunteerServiceCalendarResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "NOT_FOUND" }
  | {
      status: "READY";
      ics: string;
      fileName: string;
      headers: ReturnType<typeof memberVolunteerServiceCalendarDownloadHeaders>;
    };

/**
 * Ownership-scoped ICS download for the signed-in member's own upcoming
 * scheduled volunteer assignment. Client identity fields are ignored.
 */
export async function getMemberVolunteerServiceCalendar(
  input: unknown,
  now = new Date(),
): Promise<MemberVolunteerServiceCalendarResult> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const member = await prisma.member.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      recordStatus: "ACTIVE",
    },
    select: { id: true },
  });
  if (!member) {
    return {
      status: "CONNECTION_PENDING",
      accountEmail: userAccount.primaryEmail,
    };
  }

  const parsed = memberVolunteerServiceAssignmentSchema.safeParse({
    assignmentId: assignmentIdFrom(input),
  });
  if (!parsed.success) return { status: "NOT_FOUND" };

  const row = await prisma.volunteerServiceAssignment.findFirst({
    where: {
      id: parsed.data.assignmentId,
      organizationId: organization.id,
      memberId: member.id,
      status: "SCHEDULED",
      event: upcomingEventWhere(organization.id, now),
    },
    select: {
      roleLabel: true,
      event: {
        select: {
          title: true,
          startDateTime: true,
          endDateTime: true,
          timezone: true,
          isAllDay: true,
          location: { select: publicLocationSelect },
        },
      },
      ministry: {
        select: { name: true },
      },
    },
  });
  if (!row) return { status: "NOT_FOUND" };

  const fileName = sanitizeCalendarFileName(row.event.title);
  const ics = buildEventIcs({
    uid: volunteerAssignmentCalendarUid(parsed.data.assignmentId),
    title: row.event.title,
    description: volunteerAssignmentCalendarDescription(
      row.ministry?.name ?? null,
      row.roleLabel,
    ),
    location: publicVolunteerLocationText(row.event.location),
    start: row.event.startDateTime,
    end: row.event.endDateTime,
    timeZone: row.event.timezone,
    isAllDay: row.event.isAllDay,
    now,
  });

  return {
    status: "READY",
    ics,
    fileName,
    headers: memberVolunteerServiceCalendarDownloadHeaders(fileName),
  };
}
