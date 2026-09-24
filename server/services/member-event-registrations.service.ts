import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { formatEventEnumLabel, eventStatusOptions } from "@/lib/constants/events";
import {
  memberCalendarUnavailableReason,
  memberRegistrationCanAddToCalendar,
} from "@/lib/validation/member-event-calendar";
import { memberRegistrationCanCancel } from "@/lib/validation/member-event-registration-cancellation";
import {
  MEMBER_EVENT_REGISTRATIONS_PAGE_SIZE,
  formatMemberRegistrationStatus,
  memberEventRegistrationStatusFilterMap,
  parseMemberEventRegistrationsQuery,
} from "@/lib/validation/member-event-registrations";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const publicLocationSelect = {
  name: true,
  roomName: true,
  isOnline: true,
  city: true,
  state: true,
} as const;

export type MemberEventRegistrationLocation = {
  name: string;
  roomName: string | null;
  isOnline: boolean;
  city: string | null;
  state: string | null;
};

export type MemberEventRegistration = {
  id?: string;
  eventTitle: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
  location: MemberEventRegistrationLocation | null;
  eventStatus: string;
  registrationStatus: string;
  confirmationCode: string;
  partySize: number;
  isUpcoming: boolean;
  canCancel: boolean;
  canAddToCalendar: boolean;
  calendarUnavailableReason: string | null;
};

export type MemberEventRegistrationsResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | {
      status: "READY";
      view: "upcoming" | "past";
      statusFilter: "all" | "pending" | "confirmed" | "waitlisted" | "cancelled";
      page: number;
      pageSize: number;
      pageCount: number;
      totalCount: number;
      registrations: MemberEventRegistration[];
    };

function toPublicLocation(
  location: {
    name: string;
    roomName: string | null;
    isOnline: boolean;
    city: string | null;
    state: string | null;
  } | null,
): MemberEventRegistrationLocation | null {
  if (!location) return null;
  return {
    name: location.name,
    roomName: location.roomName,
    isOnline: location.isOnline,
    city: location.city,
    state: location.state,
  };
}

/**
 * Member-facing registrations created by the signed-in user account.
 * User IDs are never taken from the URL or client. Matching is never by email.
 */
export async function getMemberEventRegistrations(
  input: Record<string, string | string[] | undefined> = {},
  now = new Date(),
): Promise<MemberEventRegistrationsResult> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const parsed = parseMemberEventRegistrationsQuery(input);
  const mappedStatus = memberEventRegistrationStatusFilterMap[parsed.status];
  const eventTimingWhere =
    parsed.view === "upcoming"
      ? { endDateTime: { gte: now } }
      : { endDateTime: { lt: now } };

  const where = {
    organizationId: organization.id,
    registeredByUserId: userAccount.id,
    ...(mappedStatus ? { status: mappedStatus } : {}),
    event: {
      organizationId: organization.id,
      ...eventTimingWhere,
    },
  };

  const totalCount = await prisma.eventRegistration.count({ where });
  const pageCount = Math.max(
    1,
    Math.ceil(totalCount / MEMBER_EVENT_REGISTRATIONS_PAGE_SIZE),
  );
  const page = Math.min(parsed.page, pageCount);
  const startSort = parsed.view === "upcoming" ? "asc" : "desc";

  const rows = await prisma.eventRegistration.findMany({
    where,
    orderBy: [
      { event: { startDateTime: startSort } },
      { confirmationCode: "asc" },
    ],
    skip: (page - 1) * MEMBER_EVENT_REGISTRATIONS_PAGE_SIZE,
    take: MEMBER_EVENT_REGISTRATIONS_PAGE_SIZE,
    select: {
      id: true,
      confirmationCode: true,
      partySize: true,
      status: true,
      event: {
        select: {
          title: true,
          startDateTime: true,
          endDateTime: true,
          timezone: true,
          isAllDay: true,
          eventStatus: true,
          location: { select: publicLocationSelect },
          registrationSettings: {
            select: {
              allowCancellation: true,
              cancellationDeadline: true,
            },
          },
        },
      },
    },
  });

  return {
    status: "READY",
    view: parsed.view,
    statusFilter: parsed.status,
    page,
    pageSize: MEMBER_EVENT_REGISTRATIONS_PAGE_SIZE,
    pageCount,
    totalCount,
    registrations: rows.map((row) => {
      const isUpcoming = row.event.endDateTime >= now;
      const canCancel = memberRegistrationCanCancel({
        status: row.status,
        isUpcoming,
        allowCancellation: row.event.registrationSettings?.allowCancellation,
        cancellationDeadline: row.event.registrationSettings?.cancellationDeadline,
        now,
      });
      const canAddToCalendar = memberRegistrationCanAddToCalendar(row.status);
      return {
        ...(canCancel || canAddToCalendar ? { id: row.id } : {}),
        eventTitle: row.event.title,
        startDateTime: row.event.startDateTime,
        endDateTime: row.event.endDateTime,
        timezone: row.event.timezone,
        isAllDay: row.event.isAllDay,
        location: toPublicLocation(row.event.location),
        eventStatus: formatEventEnumLabel(eventStatusOptions, row.event.eventStatus),
        registrationStatus: formatMemberRegistrationStatus(row.status),
        confirmationCode: row.confirmationCode,
        partySize: row.partySize,
        isUpcoming,
        canCancel,
        canAddToCalendar,
        calendarUnavailableReason: canAddToCalendar
          ? null
          : memberCalendarUnavailableReason(row.status),
      };
    }),
  };
}
