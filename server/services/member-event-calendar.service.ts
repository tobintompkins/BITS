import { buildEventIcs } from "@/lib/calendar/ics";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  memberEventCalendarRegistrationSchema,
  memberRegistrationCanAddToCalendar,
  sanitizeCalendarFileName,
} from "@/lib/validation/member-event-calendar";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { prisma } from "@/lib/db/prisma";

const publicLocationSelect = {
  name: true,
  roomName: true,
  isOnline: true,
  city: true,
  state: true,
} as const;

function registrationIdFrom(input: unknown) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && "registrationId" in input) {
    return (input as { registrationId?: unknown }).registrationId;
  }
  return undefined;
}

function publicLocationText(
  location: {
    name: string;
    roomName: string | null;
    isOnline: boolean;
    city: string | null;
    state: string | null;
  } | null,
) {
  if (!location) return null;
  const cityLine = [location.city, location.state]
    .filter((part) => part?.trim())
    .join(", ");
  const parts = [
    location.name,
    location.roomName,
    cityLine,
    location.isOnline ? "Online" : null,
  ].filter((part) => part?.trim());
  return parts.length ? parts.join(", ") : null;
}

export const memberEventCalendarDownloadHeaders = (fileName: string) => ({
  "Content-Type": "text/calendar; charset=utf-8",
  "Content-Disposition": `attachment; filename="${fileName}"`,
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
});

export type MemberEventCalendarResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "NOT_FOUND" }
  | {
      status: "READY";
      ics: string;
      fileName: string;
      headers: ReturnType<typeof memberEventCalendarDownloadHeaders>;
    };

/**
 * Ownership-scoped ICS download for a registration created by the signed-in
 * account. Client identity fields are ignored.
 */
export async function getMemberEventCalendar(
  input: unknown,
  now = new Date(),
): Promise<MemberEventCalendarResult> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const parsed = memberEventCalendarRegistrationSchema.safeParse({
    registrationId: registrationIdFrom(input),
  });
  if (!parsed.success) return { status: "NOT_FOUND" };

  const row = await prisma.eventRegistration.findFirst({
    where: {
      id: parsed.data.registrationId,
      organizationId: organization.id,
      registeredByUserId: userAccount.id,
      event: { organizationId: organization.id },
    },
    select: {
      id: true,
      status: true,
      confirmationCode: true,
      event: {
        select: {
          title: true,
          shortDescription: true,
          startDateTime: true,
          endDateTime: true,
          timezone: true,
          isAllDay: true,
          location: { select: publicLocationSelect },
        },
      },
    },
  });
  if (!row || !memberRegistrationCanAddToCalendar(row.status)) {
    return { status: "NOT_FOUND" };
  }

  const fileName = sanitizeCalendarFileName(row.event.title);
  const ics = buildEventIcs({
    uid: `bits-${row.confirmationCode}@member-event`,
    title: row.event.title,
    description: row.event.shortDescription,
    location: publicLocationText(row.event.location),
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
    headers: memberEventCalendarDownloadHeaders(fileName),
  };
}
