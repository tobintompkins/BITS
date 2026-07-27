/**
 * Reusable fixtures for Blueprint 7.3B attendance foundation tests
 * and later check-in patches that need same-tenant / cross-tenant graphs.
 */
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";

export type AttendanceFoundationFixture = {
  organizationId: string;
  otherOrganizationId: string;
  createdByUserId: string;
  memberId: string | null;
  otherMemberId: string;
  eventId: string;
  registrationId: string;
  guestAttendeeId: string;
  memberAttendeeId: string;
  otherRegistrationId: string;
  otherAttendeeId: string;
  /** Same-tenant registration/attendee pair on a second event (for mismatch cases). */
  altEventId: string;
  altRegistrationId: string;
  altAttendeeId: string;
  /** Cross-tenant event/registration/attendee under otherOrganizationId. */
  foreignEventId: string;
  foreignRegistrationId: string;
  foreignAttendeeId: string;
  cleanup: () => Promise<void>;
};

function confirmationCode(prefix: string, id: string) {
  return `${prefix}${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

async function ensureSecondaryOrganization(primaryOrganizationId: string) {
  const existing = await prisma.organization.findFirst({
    where: { id: { not: primaryOrganizationId } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false as const };

  const created = await prisma.organization.create({
    data: {
      id: randomUUID(),
      name: "7.3B Cross-Tenant Org",
      slug: `blueprint-73b-org-${randomUUID().slice(0, 8)}`,
      displayName: "7.3B Cross-Tenant",
      mailingAddressLine1: "1 Test Lane",
      city: "Nashville",
      state: "TN",
      postalCode: "37201",
      country: "US",
    },
  });
  return { id: created.id, created: true as const };
}

/**
 * Builds a disposable event/registration/attendee graph for attendance tests.
 * Requires a seeded primary organization and user account.
 */
export async function createAttendanceFoundationFixture(): Promise<AttendanceFoundationFixture> {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!org) {
    throw new Error("No organization found; run npm run db:seed first.");
  }

  const user = await prisma.userAccount.findFirst({ select: { id: true } });
  if (!user) {
    throw new Error("No user account found; run npm run db:seed first.");
  }

  const member = await prisma.member.findFirst({
    where: { organizationId: org.id },
    select: { id: true },
  });

  const secondary = await ensureSecondaryOrganization(org.id);

  let otherMember = await prisma.member.findFirst({
    where: { organizationId: secondary.id },
    select: { id: true },
  });
  let createdOtherMember = false;
  if (!otherMember) {
    otherMember = await prisma.member.create({
      data: {
        id: randomUUID(),
        organizationId: secondary.id,
        firstName: "Foreign",
        lastName: "Member",
        membershipStatus: "MEMBER",
        recordStatus: "ACTIVE",
      },
      select: { id: true },
    });
    createdOtherMember = true;
  }

  const ids = {
    eventId: randomUUID(),
    registrationId: randomUUID(),
    guestAttendeeId: randomUUID(),
    memberAttendeeId: randomUUID(),
    otherRegistrationId: randomUUID(),
    otherAttendeeId: randomUUID(),
    altEventId: randomUUID(),
    altRegistrationId: randomUUID(),
    altAttendeeId: randomUUID(),
    foreignEventId: randomUUID(),
    foreignRegistrationId: randomUUID(),
    foreignAttendeeId: randomUUID(),
  };

  const start = new Date("2030-01-15T15:00:00.000Z");
  const end = new Date("2030-01-15T16:00:00.000Z");

  await prisma.event.create({
    data: {
      id: ids.eventId,
      organizationId: org.id,
      title: "7.3B Attendance Fixture",
      slug: `blueprint-73b-${ids.eventId.slice(0, 8)}`,
      eventStatus: "DRAFT",
      visibility: "STAFF_ONLY",
      startDateTime: start,
      endDateTime: end,
      timezone: "America/Chicago",
      createdByUserId: user.id,
      checkInSettings: {
        create: {
          organizationId: org.id,
          checkInEnabled: false,
        },
      },
    },
  });

  await prisma.eventRegistration.create({
    data: {
      id: ids.registrationId,
      organizationId: org.id,
      eventId: ids.eventId,
      status: "CONFIRMED",
      confirmationCode: confirmationCode("73B", ids.registrationId),
      primaryContactName: "Fixture Contact",
      partySize: 2,
      attendees: {
        create: [
          {
            id: ids.guestAttendeeId,
            organizationId: org.id,
            eventId: ids.eventId,
            firstName: "Guest",
            lastName: "Attendee",
            isGuest: true,
            attendeeType: "GUEST",
            memberId: null,
          },
          {
            id: ids.memberAttendeeId,
            organizationId: org.id,
            eventId: ids.eventId,
            firstName: "Member",
            lastName: "Attendee",
            isGuest: false,
            attendeeType: "MEMBER",
            memberId: member?.id ?? null,
          },
        ],
      },
    },
  });

  await prisma.eventRegistration.create({
    data: {
      id: ids.otherRegistrationId,
      organizationId: org.id,
      eventId: ids.eventId,
      status: "CONFIRMED",
      confirmationCode: confirmationCode("73C", ids.otherRegistrationId),
      primaryContactName: "Other Party",
      partySize: 1,
      attendees: {
        create: {
          id: ids.otherAttendeeId,
          organizationId: org.id,
          eventId: ids.eventId,
          firstName: "Other",
          lastName: "Guest",
          isGuest: true,
          attendeeType: "GUEST",
        },
      },
    },
  });

  await prisma.event.create({
    data: {
      id: ids.altEventId,
      organizationId: org.id,
      title: "7.3B Alt Event",
      slug: `blueprint-73b-alt-${ids.altEventId.slice(0, 8)}`,
      eventStatus: "DRAFT",
      visibility: "STAFF_ONLY",
      startDateTime: start,
      endDateTime: end,
      timezone: "America/Chicago",
      createdByUserId: user.id,
    },
  });

  await prisma.eventRegistration.create({
    data: {
      id: ids.altRegistrationId,
      organizationId: org.id,
      eventId: ids.altEventId,
      status: "CONFIRMED",
      confirmationCode: confirmationCode("73D", ids.altRegistrationId),
      primaryContactName: "Alt Party",
      partySize: 1,
      attendees: {
        create: {
          id: ids.altAttendeeId,
          organizationId: org.id,
          eventId: ids.altEventId,
          firstName: "Alt",
          lastName: "Guest",
          isGuest: true,
          attendeeType: "GUEST",
        },
      },
    },
  });

  await prisma.event.create({
    data: {
      id: ids.foreignEventId,
      organizationId: secondary.id,
      title: "7.3B Foreign Event",
      slug: `blueprint-73b-fx-${ids.foreignEventId.slice(0, 8)}`,
      eventStatus: "DRAFT",
      visibility: "STAFF_ONLY",
      startDateTime: start,
      endDateTime: end,
      timezone: "America/Chicago",
      createdByUserId: user.id,
    },
  });

  await prisma.eventRegistration.create({
    data: {
      id: ids.foreignRegistrationId,
      organizationId: secondary.id,
      eventId: ids.foreignEventId,
      status: "CONFIRMED",
      confirmationCode: confirmationCode("73E", ids.foreignRegistrationId),
      primaryContactName: "Foreign Party",
      partySize: 1,
      attendees: {
        create: {
          id: ids.foreignAttendeeId,
          organizationId: secondary.id,
          eventId: ids.foreignEventId,
          firstName: "Foreign",
          lastName: "Guest",
          isGuest: true,
          attendeeType: "GUEST",
        },
      },
    },
  });

  return {
    organizationId: org.id,
    otherOrganizationId: secondary.id,
    createdByUserId: user.id,
    memberId: member?.id ?? null,
    otherMemberId: otherMember.id,
    ...ids,
    cleanup: async () => {
      const eventIds = [ids.eventId, ids.altEventId, ids.foreignEventId];
      await prisma.eventAttendanceAction.deleteMany({
        where: { eventId: { in: eventIds } },
      });
      await prisma.eventAttendanceRecord.deleteMany({
        where: { eventId: { in: eventIds } },
      });
      await prisma.eventAttendee.deleteMany({
        where: { eventId: { in: eventIds } },
      });
      await prisma.eventRegistration.deleteMany({
        where: { eventId: { in: eventIds } },
      });
      await prisma.eventCheckInSettings.deleteMany({
        where: { eventId: { in: eventIds } },
      });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });

      if (createdOtherMember) {
        await prisma.member.deleteMany({ where: { id: otherMember.id } });
      }
      if (secondary.created) {
        await prisma.organization.deleteMany({ where: { id: secondary.id } });
      }
    },
  };
}
