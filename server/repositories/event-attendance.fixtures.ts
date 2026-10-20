/**
 * Run-owned attendance fixtures for isolated-database tests.
 * Never select the oldest church or an existing user from the target database.
 */
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/app/generated/prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

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

type OwnedAttendanceManifest = {
  runId: string;
  organizationIds: string[];
  userAccountIds: string[];
  memberIds: string[];
  eventIds: string[];
};

function confirmationCode(prefix: string, id: string) {
  return `${prefix}${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function persistFailedCleanupManifest(manifest: OwnedAttendanceManifest) {
  const directory = path.join(process.cwd(), "e2e/.local");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "isolated-fixture-manifest.json"),
    JSON.stringify(
      {
        runId: manifest.runId,
        organizationIds: manifest.organizationIds,
        userAccountIds: manifest.userAccountIds,
        memberIds: manifest.memberIds,
        eventIds: manifest.eventIds,
      },
      null,
      2,
    ),
  );
}

export async function cleanupOwnedAttendanceFixture(
  db: PrismaClient,
  manifest: OwnedAttendanceManifest,
) {
  if (manifest.eventIds.length) {
    await db.eventAttendanceAction.deleteMany({
      where: { eventId: { in: manifest.eventIds } },
    });
    await db.eventAttendanceRecord.deleteMany({
      where: { eventId: { in: manifest.eventIds } },
    });
    await db.eventQrPass.deleteMany({
      where: { eventId: { in: manifest.eventIds } },
    });
    await db.eventCheckInIdempotency.deleteMany({
      where: { eventId: { in: manifest.eventIds } },
    });
    await db.eventCheckInStation.deleteMany({
      where: { eventId: { in: manifest.eventIds } },
    });
    await db.eventAttendee.deleteMany({
      where: { eventId: { in: manifest.eventIds } },
    });
    await db.eventRegistration.deleteMany({
      where: { eventId: { in: manifest.eventIds } },
    });
    await db.eventCheckInSettings.deleteMany({
      where: { eventId: { in: manifest.eventIds } },
    });
    await db.event.deleteMany({ where: { id: { in: manifest.eventIds } } });
  }
  if (manifest.organizationIds.length) {
    await db.auditEvent.deleteMany({
      where: { organizationId: { in: manifest.organizationIds } },
    });
    await db.member.deleteMany({
      where: {
        id: { in: manifest.memberIds },
        organizationId: { in: manifest.organizationIds },
      },
    });
    await db.organizationMembership.deleteMany({
      where: { organizationId: { in: manifest.organizationIds } },
    });
    await db.organization.deleteMany({
      where: { id: { in: manifest.organizationIds } },
    });
  }
  if (manifest.userAccountIds.length) {
    await db.userAccount.deleteMany({
      where: { id: { in: manifest.userAccountIds } },
    });
  }
}

/**
 * Builds a disposable event/registration/attendee graph for attendance tests.
 * Owns unique fictional churches and accounts for this run.
 */
export async function createAttendanceFoundationFixture(
  db: PrismaClient,
  runId = `${process.env.BITS_ISOLATED_RUN_ID?.trim() || "iso"}-${randomUUID().slice(0, 8)}`,
): Promise<AttendanceFoundationFixture> {
  const manifest: OwnedAttendanceManifest = {
    runId,
    organizationIds: [],
    userAccountIds: [],
    memberIds: [],
    eventIds: [],
  };

  try {
    const user = await db.userAccount.create({
      data: {
        clerkUserId: `${runId}-attendance-user`,
        primaryEmail: `${runId}-attendance@church.test`,
        displayName: "Isolated Attendance Staff",
      },
    });
    manifest.userAccountIds.push(user.id);

    const org = await db.organization.create({
      data: {
        name: `${runId} Attendance Church`,
        slug: `${runId}-attendance`,
        mailingAddressLine1: "1 Isolated Lane",
        city: "Testville",
        state: "TN",
        postalCode: "37201",
        country: "US",
      },
    });
    manifest.organizationIds.push(org.id);
    const otherOrg = await db.organization.create({
      data: {
        name: `${runId} Cross-Tenant Church`,
        slug: `${runId}-attendance-x`,
        mailingAddressLine1: "2 Isolated Lane",
        city: "Testville",
        state: "TN",
        postalCode: "37201",
        country: "US",
      },
    });
    manifest.organizationIds.push(otherOrg.id);

    const member = await db.member.create({
      data: {
        organizationId: org.id,
        firstName: "Isolated",
        lastName: "Member",
        membershipStatus: "MEMBER",
        recordStatus: "ACTIVE",
      },
      select: { id: true },
    });
    manifest.memberIds.push(member.id);
    const otherMember = await db.member.create({
      data: {
        organizationId: otherOrg.id,
        firstName: "Foreign",
        lastName: "Member",
        membershipStatus: "MEMBER",
        recordStatus: "ACTIVE",
      },
      select: { id: true },
    });
    manifest.memberIds.push(otherMember.id);

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
    manifest.eventIds.push(ids.eventId, ids.altEventId, ids.foreignEventId);

    const start = new Date("2030-01-15T15:00:00.000Z");
    const end = new Date("2030-01-15T16:00:00.000Z");

    await db.event.create({
      data: {
        id: ids.eventId,
        organizationId: org.id,
        title: `${runId} Attendance Fixture`,
        slug: `${runId}-att-${ids.eventId.slice(0, 8)}`,
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

    await db.eventRegistration.create({
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
              memberId: member.id,
            },
          ],
        },
      },
    });

    await db.eventRegistration.create({
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

    await db.event.create({
      data: {
        id: ids.altEventId,
        organizationId: org.id,
        title: `${runId} Alt Event`,
        slug: `${runId}-alt-${ids.altEventId.slice(0, 8)}`,
        eventStatus: "DRAFT",
        visibility: "STAFF_ONLY",
        startDateTime: start,
        endDateTime: end,
        timezone: "America/Chicago",
        createdByUserId: user.id,
      },
    });

    await db.eventRegistration.create({
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

    await db.event.create({
      data: {
        id: ids.foreignEventId,
        organizationId: otherOrg.id,
        title: `${runId} Foreign Event`,
        slug: `${runId}-fx-${ids.foreignEventId.slice(0, 8)}`,
        eventStatus: "DRAFT",
        visibility: "STAFF_ONLY",
        startDateTime: start,
        endDateTime: end,
        timezone: "America/Chicago",
        createdByUserId: user.id,
      },
    });

    await db.eventRegistration.create({
      data: {
        id: ids.foreignRegistrationId,
        organizationId: otherOrg.id,
        eventId: ids.foreignEventId,
        status: "CONFIRMED",
        confirmationCode: confirmationCode("73E", ids.foreignRegistrationId),
        primaryContactName: "Foreign Party",
        partySize: 1,
        attendees: {
          create: {
            id: ids.foreignAttendeeId,
            organizationId: otherOrg.id,
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
      otherOrganizationId: otherOrg.id,
      createdByUserId: user.id,
      memberId: member.id,
      otherMemberId: otherMember.id,
      ...ids,
      cleanup: async () => {
        try {
          await cleanupOwnedAttendanceFixture(db, manifest);
        } catch (error) {
          persistFailedCleanupManifest(manifest);
          throw error;
        }
      },
    };
  } catch (error) {
    try {
      await cleanupOwnedAttendanceFixture(db, manifest);
    } catch {
      persistFailedCleanupManifest(manifest);
    }
    throw error;
  }
}
