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
import { CheckInError } from "@/lib/errors/check-in-errors";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";
import {
  assertStaffCheckInWindow,
  staffCheckInRegisteredAttendee,
} from "@/server/services/staff-check-in.service";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe("assertStaffCheckInWindow boundaries", () => {
  const opens = new Date("2030-01-15T15:00:00.000Z");
  const closes = new Date("2030-01-15T17:00:00.000Z");
  const settings = {
    checkInEnabled: true,
    checkInOpensAt: opens,
    checkInClosesAt: closes,
  };

  it("allows the exact opening instant", () => {
    expect(() => assertStaffCheckInWindow(settings, opens)).not.toThrow();
  });

  it("rejects one ms before open", () => {
    expect(() =>
      assertStaffCheckInWindow(settings, new Date(opens.getTime() - 1)),
    ).toThrow(CheckInError);
  });

  it("rejects after the closing instant (exclusive close)", () => {
    expect(() =>
      assertStaffCheckInWindow(settings, new Date(closes.getTime() + 1)),
    ).toThrow(CheckInError);
  });

  it("allows the exact closing instant", () => {
    expect(() => assertStaffCheckInWindow(settings, closes)).not.toThrow();
  });

  it("rejects when disabled", () => {
    expect(() =>
      assertStaffCheckInWindow({ ...settings, checkInEnabled: false }, opens),
    ).toThrow(/disabled/i);
  });
});

describe.runIf(hasDatabase)("Blueprint 7.3C staff check-in service (database)", () => {
  let fx: AttendanceFoundationFixture;
  const actor = { userAccountId: "" as string, email: "staff@example.com" };

  beforeAll(async () => {
    fx = await createAttendanceFoundationFixture();
    actor.userAccountId = fx.createdByUserId;

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

  it("checks in a confirmed same-tenant attendee with safe result shape", async () => {
    await wipeAttendance();
    const now = new Date("2030-01-15T15:30:00.000Z");

    const result = await staffCheckInRegisteredAttendee(
      { eventId: fx.eventId, attendeeId: fx.guestAttendeeId, now },
      actor,
    );

    expect(result).toMatchObject({
      eventId: fx.eventId,
      attendeeId: fx.guestAttendeeId,
      status: "PRESENT",
      checkInCount: 1,
      alreadyPresent: false,
    });
    expect(result.firstCheckedInAt?.toISOString()).toBe(now.toISOString());
    expect(result.lastCheckedInAt?.toISOString()).toBe(now.toISOString());
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("firstName");
    expect(result).not.toHaveProperty("dietaryNotes");

    const actions = await prisma.eventAttendanceAction.findMany({
      where: { attendanceId: result.attendanceId },
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toBe("CHECKED_IN");
    expect(actions[0]?.source).toBe("STAFF_SEARCH");

    const audits = await prisma.auditEvent.findMany({
      where: {
        organizationId: fx.organizationId,
        entityId: result.attendanceId,
        action: "EVENT_STAFF_ATTENDEE_CHECKED_IN",
      },
    });
    expect(audits).toHaveLength(1);

    // Does not mutate attendee/registration rows
    const attendee = await prisma.eventAttendee.findUniqueOrThrow({
      where: { id: fx.guestAttendeeId },
    });
    expect(attendee.status).not.toBe("CHECKED_IN");
  });

  it("rejects disabled check-in", async () => {
    await wipeAttendance();
    await prisma.eventCheckInSettings.update({
      where: { eventId: fx.eventId },
      data: { checkInEnabled: false },
    });

    await expect(
      staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: new Date("2030-01-15T15:30:00.000Z"),
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "CHECK_IN_DISABLED" });

    await prisma.eventCheckInSettings.update({
      where: { eventId: fx.eventId },
      data: { checkInEnabled: true },
    });
  });

  it("rejects before-open and after-close", async () => {
    await wipeAttendance();
    await expect(
      staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: new Date("2030-01-15T13:59:59.000Z"),
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "CHECK_IN_NOT_OPEN" });

    await expect(
      staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: new Date("2030-01-15T18:00:00.001Z"),
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "CHECK_IN_CLOSED" });
  });

  it("rejects unauthorized actors", async () => {
    mocks.requireEventPermission.mockRejectedValueOnce(
      new Error("You do not have permission to check in attendees."),
    );
    await expect(
      staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: new Date("2030-01-15T15:30:00.000Z"),
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects foreign-tenant attendee IDs as not found", async () => {
    await expect(
      staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.foreignAttendeeId,
          now: new Date("2030-01-15T15:30:00.000Z"),
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "ATTENDEE_NOT_FOUND" });
  });

  it("rejects pending registrations", async () => {
    await wipeAttendance();
    await prisma.eventRegistration.update({
      where: { id: fx.otherRegistrationId },
      data: { status: "PENDING" },
    });
    await expect(
      staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.otherAttendeeId,
          now: new Date("2030-01-15T15:30:00.000Z"),
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "REGISTRATION_NOT_ELIGIBLE" });

    await prisma.eventRegistration.update({
      where: { id: fx.otherRegistrationId },
      data: { status: "CONFIRMED" },
    });
  });

  it("rejects cancelled attendees", async () => {
    await wipeAttendance();
    await prisma.eventAttendee.update({
      where: { id: fx.otherAttendeeId },
      data: { status: "CANCELLED" },
    });
    await expect(
      staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.otherAttendeeId,
          now: new Date("2030-01-15T15:30:00.000Z"),
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "ATTENDEE_CANCELLED" });

    await prisma.eventAttendee.update({
      where: { id: fx.otherAttendeeId },
      data: { status: "REGISTERED" },
    });
  });

  it("treats sequential duplicates as idempotent", async () => {
    await wipeAttendance();
    const now = new Date("2030-01-15T15:30:00.000Z");
    const first = await staffCheckInRegisteredAttendee(
      { eventId: fx.eventId, attendeeId: fx.guestAttendeeId, now },
      actor,
    );
    const second = await staffCheckInRegisteredAttendee(
      {
        eventId: fx.eventId,
        attendeeId: fx.guestAttendeeId,
        now: new Date("2030-01-15T15:45:00.000Z"),
      },
      actor,
    );

    expect(second.alreadyPresent).toBe(true);
    expect(second.attendanceId).toBe(first.attendanceId);
    expect(second.checkInCount).toBe(1);
    expect(second.firstCheckedInAt?.toISOString()).toBe(now.toISOString());

    const actions = await prisma.eventAttendanceAction.count({
      where: { attendanceId: first.attendanceId },
    });
    expect(actions).toBe(1);

    const audits = await prisma.auditEvent.count({
      where: {
        organizationId: fx.organizationId,
        entityId: first.attendanceId,
        action: "EVENT_STAFF_ATTENDEE_CHECKED_IN",
      },
    });
    expect(audits).toBe(1);
  });

  it("handles two simultaneous first requests with one effective check-in", async () => {
    await wipeAttendance();
    const now = new Date("2030-01-15T15:30:00.000Z");
    const input = {
      eventId: fx.eventId,
      attendeeId: fx.otherAttendeeId,
      now,
    };

    const [a, b] = await Promise.all([
      staffCheckInRegisteredAttendee(input, actor),
      staffCheckInRegisteredAttendee(input, actor),
    ]);

    expect(a.attendanceId).toBe(b.attendanceId);
    expect([a.alreadyPresent, b.alreadyPresent].filter(Boolean).length).toBe(1);
    expect(a.checkInCount).toBe(1);
    expect(b.checkInCount).toBe(1);

    const rows = await prisma.eventAttendanceRecord.count({
      where: {
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        attendeeId: fx.otherAttendeeId,
      },
    });
    expect(rows).toBe(1);

    const actions = await prisma.eventAttendanceAction.count({
      where: { attendanceId: a.attendanceId, action: "CHECKED_IN" },
    });
    expect(actions).toBe(1);

    const audits = await prisma.auditEvent.count({
      where: {
        organizationId: fx.organizationId,
        entityId: a.attendanceId,
        action: "EVENT_STAFF_ATTENDEE_CHECKED_IN",
      },
    });
    expect(audits).toBe(1);
  });

  it("rolls back attendance and history together when the transaction fails", async () => {
    await wipeAttendance();
    const badActor = { userAccountId: randomUUID(), email: null };

    await expect(
      staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.memberAttendeeId,
          now: new Date("2030-01-15T15:30:00.000Z"),
        },
        badActor,
      ),
    ).rejects.toThrow();

    const rows = await prisma.eventAttendanceRecord.count({
      where: {
        eventId: fx.eventId,
        attendeeId: fx.memberAttendeeId,
      },
    });
    expect(rows).toBe(0);

    const memberActions = await prisma.eventAttendanceAction.findMany({
      where: { eventId: fx.eventId },
      include: { attendance: true },
    });
    expect(
      memberActions.filter((row) => row.attendance.attendeeId === fx.memberAttendeeId),
    ).toHaveLength(0);
  });
});
