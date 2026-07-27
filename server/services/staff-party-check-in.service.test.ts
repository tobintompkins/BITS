import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  requireEventPermission: vi.fn(),
  assertActionAllowed: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/event-permissions", () => ({
  requireEventPermission: mocks.requireEventPermission,
  getEventAccess: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  assertActionAllowed: mocks.assertActionAllowed,
}));

import { prisma } from "@/lib/db/prisma";
import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";
import {
  findCheckInSettings,
  lockCheckInSettingsForEvent,
} from "@/server/repositories/event-check-in.repository";
import {
  applyStaffAttendeeCheckInInTx,
  staffCheckInRegisteredAttendee,
  staffCheckInSelectedParty,
} from "@/server/services/staff-check-in.service";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)("Blueprint 7.3F selected party check-in (database)", () => {
  let fx: AttendanceFoundationFixture;
  let thirdAttendeeId: string;
  const actor = { userAccountId: "" as string, email: "staff@example.com" };
  const now = new Date("2030-01-15T15:30:00.000Z");

  beforeAll(async () => {
    fx = await createAttendanceFoundationFixture();
    actor.userAccountId = fx.createdByUserId;
    thirdAttendeeId = randomUUID();

    await prisma.eventAttendee.create({
      data: {
        id: thirdAttendeeId,
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        firstName: "Third",
        lastName: "Guest",
        isGuest: true,
        attendeeType: "GUEST",
        status: "REGISTERED",
      },
    });

    await prisma.eventCheckInSettings.update({
      where: { eventId: fx.eventId },
      data: {
        checkInEnabled: true,
        checkInOpensAt: new Date("2030-01-15T14:00:00.000Z"),
        checkInClosesAt: new Date("2030-01-15T18:00:00.000Z"),
        allowSelfCheckIn: false,
        allowWalkIns: false,
        allowCheckOut: false,
        allowReentry: false,
        requireRegistration: true,
      },
    });

    await prisma.eventRegistration.update({
      where: { id: fx.registrationId },
      data: { status: "CONFIRMED", partySize: 3 },
    });
    await prisma.eventRegistration.update({
      where: { id: fx.otherRegistrationId },
      data: { status: "CONFIRMED" },
    });
  });

  afterAll(async () => {
    await prisma.eventCheckInIdempotency.deleteMany({
      where: { eventId: fx.eventId },
    });
    await fx.cleanup();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mocks.findPrimaryOrganization.mockResolvedValue({ id: fx.organizationId });
    mocks.requireEventPermission.mockResolvedValue({
      canOperateCheckIn: true,
      userAccountId: actor.userAccountId,
    });
    mocks.assertActionAllowed.mockResolvedValue(undefined);
  });

  async function wipeAttendance() {
    const attendanceIds = (
      await prisma.eventAttendanceRecord.findMany({
        where: { eventId: fx.eventId },
        select: { id: true },
      })
    ).map((row) => row.id);

    if (attendanceIds.length > 0) {
      await prisma.auditEvent.deleteMany({
        where: {
          organizationId: fx.organizationId,
          action: "EVENT_STAFF_ATTENDEE_CHECKED_IN",
          entityId: { in: attendanceIds },
        },
      });
    }
    await prisma.auditEvent.deleteMany({
      where: {
        organizationId: fx.organizationId,
        action: "EVENT_STAFF_PARTY_CHECKED_IN",
        entityId: fx.registrationId,
      },
    });
    await prisma.eventAttendanceAction.deleteMany({
      where: { eventId: fx.eventId },
    });
    await prisma.eventAttendanceRecord.deleteMany({
      where: { eventId: fx.eventId },
    });
    await prisma.eventCheckInIdempotency.deleteMany({
      where: { eventId: fx.eventId },
    });
  }

  it("checks in two selected attendees from one registration", async () => {
    await wipeAttendance();
    const result = await staffCheckInSelectedParty(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        attendeeIds: [fx.guestAttendeeId, fx.memberAttendeeId],
        now,
      },
      actor,
    );

    expect(result).toMatchObject({
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      requestedCount: 2,
      newlyCheckedInCount: 2,
      alreadyPresentCount: 0,
    });
    expect(result.attendees).toHaveLength(2);
    expect(result.attendees.map((row) => row.attendeeId)).toEqual([
      fx.guestAttendeeId,
      fx.memberAttendeeId,
    ]);
    expect(result.attendees.every((row) => row.outcome === "CHECKED_IN")).toBe(true);
    expect(result.attendees.every((row) => row.checkInCount === 1)).toBe(true);
    expect(result).not.toHaveProperty("email");
    expect(JSON.stringify(result)).not.toMatch(/Guest|Member|dietary|@example/i);

    const actions = await prisma.eventAttendanceAction.count({
      where: { eventId: fx.eventId, action: "CHECKED_IN" },
    });
    expect(actions).toBe(2);

    const audits = await prisma.auditEvent.count({
      where: {
        organizationId: fx.organizationId,
        action: "EVENT_STAFF_PARTY_CHECKED_IN",
        entityId: fx.registrationId,
      },
    });
    expect(audits).toBe(1);
  });

  it("leaves an unselected same-registration attendee unchanged", async () => {
    await wipeAttendance();
    await staffCheckInSelectedParty(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        attendeeIds: [fx.guestAttendeeId],
        now,
      },
      actor,
    );

    const unselected = await prisma.eventAttendanceRecord.findFirst({
      where: {
        eventId: fx.eventId,
        attendeeId: fx.memberAttendeeId,
      },
    });
    expect(unselected).toBeNull();
  });

  it("rejects empty and over-limit lists", async () => {
    await wipeAttendance();
    await expect(
      staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [],
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const tooMany = Array.from(
      { length: STAFF_PARTY_CHECK_IN_MAX_ATTENDEES + 1 },
      () => randomUUID(),
    );
    await expect(
      staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: tooMany,
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("dedupes duplicate input IDs before checking in", async () => {
    await wipeAttendance();
    const result = await staffCheckInSelectedParty(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        attendeeIds: [fx.guestAttendeeId, fx.guestAttendeeId, fx.memberAttendeeId],
        now,
      },
      actor,
    );
    expect(result.requestedCount).toBe(2);
    expect(result.newlyCheckedInCount).toBe(2);
  });

  it("rejects mixed-registration and foreign attendee IDs for the whole party", async () => {
    await wipeAttendance();
    await expect(
      staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId, fx.otherAttendeeId],
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "ATTENDEE_NOT_FOUND" });

    await expect(
      staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId, fx.foreignAttendeeId],
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "ATTENDEE_NOT_FOUND" });

    const rows = await prisma.eventAttendanceRecord.count({
      where: { eventId: fx.eventId },
    });
    expect(rows).toBe(0);
  });

  it("rejects unauthorized actors", async () => {
    mocks.requireEventPermission.mockRejectedValueOnce(
      new Error("You do not have permission to check in attendees."),
    );
    await expect(
      staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId],
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects disabled and outside-window check-in", async () => {
    await wipeAttendance();
    await prisma.eventCheckInSettings.update({
      where: { eventId: fx.eventId },
      data: { checkInEnabled: false },
    });
    await expect(
      staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId],
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "CHECK_IN_DISABLED" });
    await prisma.eventCheckInSettings.update({
      where: { eventId: fx.eventId },
      data: { checkInEnabled: true },
    });

    await expect(
      staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId],
          now: new Date("2030-01-15T13:00:00.000Z"),
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "CHECK_IN_NOT_OPEN" });
  });

  it("rejects cancelled attendee or non-confirmed registration for the whole party", async () => {
    await wipeAttendance();
    await prisma.eventAttendee.update({
      where: { id: fx.memberAttendeeId },
      data: { status: "CANCELLED" },
    });
    await expect(
      staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId, fx.memberAttendeeId],
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "ATTENDEE_CANCELLED" });
    expect(
      await prisma.eventAttendanceRecord.count({ where: { eventId: fx.eventId } }),
    ).toBe(0);
    await prisma.eventAttendee.update({
      where: { id: fx.memberAttendeeId },
      data: { status: "REGISTERED" },
    });

    await prisma.eventRegistration.update({
      where: { id: fx.registrationId },
      data: { status: "PENDING" },
    });
    await expect(
      staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId],
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "REGISTRATION_NOT_ELIGIBLE" });
    await prisma.eventRegistration.update({
      where: { id: fx.registrationId },
      data: { status: "CONFIRMED" },
    });
  });

  it("returns mixed already-present and new outcomes without double-counting", async () => {
    await wipeAttendance();
    await staffCheckInRegisteredAttendee(
      { eventId: fx.eventId, attendeeId: fx.guestAttendeeId, now },
      actor,
    );

    const result = await staffCheckInSelectedParty(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        attendeeIds: [fx.guestAttendeeId, fx.memberAttendeeId],
        now: new Date("2030-01-15T15:45:00.000Z"),
      },
      actor,
    );

    expect(result.newlyCheckedInCount).toBe(1);
    expect(result.alreadyPresentCount).toBe(1);
    expect(result.attendees[0]?.outcome).toBe("ALREADY_PRESENT");
    expect(result.attendees[0]?.checkInCount).toBe(1);
    expect(result.attendees[1]?.outcome).toBe("CHECKED_IN");
    expect(result.attendees[1]?.checkInCount).toBe(1);

    const guestActions = await prisma.eventAttendanceAction.count({
      where: {
        eventId: fx.eventId,
        action: "CHECKED_IN",
        attendance: { attendeeId: fx.guestAttendeeId },
      },
    });
    expect(guestActions).toBe(1);
  });

  it("is idempotent when the same party request is repeated", async () => {
    await wipeAttendance();
    const input = {
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      attendeeIds: [fx.guestAttendeeId, fx.memberAttendeeId],
      now,
    };
    const first = await staffCheckInSelectedParty(input, actor);
    const second = await staffCheckInSelectedParty(
      { ...input, now: new Date("2030-01-15T16:00:00.000Z") },
      actor,
    );

    expect(second.newlyCheckedInCount).toBe(0);
    expect(second.alreadyPresentCount).toBe(2);
    expect(second.attendees.every((row) => row.outcome === "ALREADY_PRESENT")).toBe(
      true,
    );
    expect(second.attendees.every((row) => row.checkInCount === 1)).toBe(true);

    const actions = await prisma.eventAttendanceAction.count({
      where: { eventId: fx.eventId, action: "CHECKED_IN" },
    });
    expect(actions).toBe(2);

    const audits = await prisma.auditEvent.count({
      where: {
        organizationId: fx.organizationId,
        action: "EVENT_STAFF_PARTY_CHECKED_IN",
        entityId: fx.registrationId,
      },
    });
    expect(audits).toBe(1);
    expect(first.attendees[0]?.attendanceId).toBe(second.attendees[0]?.attendanceId);
  });

  it("handles overlapping simultaneous parties with one effective check-in each", async () => {
    await wipeAttendance();
    const [left, right] = await Promise.all([
      staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId, fx.memberAttendeeId],
          now,
        },
        actor,
      ),
      staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.memberAttendeeId, thirdAttendeeId],
          now,
        },
        actor,
      ),
    ]);

    const allAttendeeIds = new Set([
      ...left.attendees.map((row) => row.attendeeId),
      ...right.attendees.map((row) => row.attendeeId),
    ]);
    expect(allAttendeeIds.size).toBe(3);

    for (const attendeeId of [
      fx.guestAttendeeId,
      fx.memberAttendeeId,
      thirdAttendeeId,
    ]) {
      const rows = await prisma.eventAttendanceRecord.findMany({
        where: { eventId: fx.eventId, attendeeId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.checkInCount).toBe(1);
      expect(rows[0]?.status).toBe("PRESENT");

      const actions = await prisma.eventAttendanceAction.count({
        where: {
          attendanceId: rows[0]!.id,
          action: "CHECKED_IN",
        },
      });
      expect(actions).toBe(1);
    }
  });

  it("rolls back earlier in-tx transitions when a later step fails", async () => {
    await wipeAttendance();
    const organizationId = fx.organizationId;

    await expect(
      prisma.$transaction(async (tx) => {
        await lockCheckInSettingsForEvent(fx.eventId, tx);
        const settings = await findCheckInSettings(organizationId, fx.eventId, tx);
        expect(settings?.checkInEnabled).toBe(true);

        const attendee = await tx.eventAttendee.findFirstOrThrow({
          where: { id: fx.guestAttendeeId },
          include: {
            registration: {
              select: {
                id: true,
                organizationId: true,
                eventId: true,
                status: true,
              },
            },
          },
        });

        await applyStaffAttendeeCheckInInTx(
          {
            organizationId,
            eventId: fx.eventId,
            attendee,
            actor,
            now,
          },
          tx,
        );

        throw new Error("forced rollback after first attendee");
      }),
    ).rejects.toThrow(/forced rollback/);

    expect(
      await prisma.eventAttendanceRecord.count({ where: { eventId: fx.eventId } }),
    ).toBe(0);
    expect(
      await prisma.eventAttendanceAction.count({ where: { eventId: fx.eventId } }),
    ).toBe(0);
  });

  it("keeps Blueprint 7.3C single-attendee behavior intact", async () => {
    await wipeAttendance();
    const result = await staffCheckInRegisteredAttendee(
      { eventId: fx.eventId, attendeeId: thirdAttendeeId, now },
      actor,
    );
    expect(result).toMatchObject({
      attendeeId: thirdAttendeeId,
      status: "PRESENT",
      checkInCount: 1,
      alreadyPresent: false,
    });
    expect(result).not.toHaveProperty("email");
  });
});
