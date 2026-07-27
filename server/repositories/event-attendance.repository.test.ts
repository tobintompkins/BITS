import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import {
  EVENT_ATTENDANCE_ACTIONS,
  EVENT_ATTENDANCE_SOURCES,
  EVENT_ATTENDANCE_STATUSES,
} from "@/lib/constants/event-attendance";
import {
  AttendanceFoundationError,
  appendAttendanceAction,
  createExpectedAttendance,
  eventAttendanceFoundationApi,
  findAttendanceByEventAttendee,
  listAttendanceActions,
} from "@/server/repositories/event-attendance.repository";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe("Blueprint 7.3B attendance foundation API surface", () => {
  it("exposes only create/read/append/list helpers (no action update/delete)", () => {
    expect(Object.keys(eventAttendanceFoundationApi).sort()).toEqual([
      "appendAttendanceAction",
      "createExpectedAttendance",
      "findAttendanceByEventAttendee",
      "listAttendanceActions",
    ]);
    expect(eventAttendanceFoundationApi).not.toHaveProperty(
      "updateAttendanceAction",
    );
    expect(eventAttendanceFoundationApi).not.toHaveProperty(
      "deleteAttendanceAction",
    );
    expect(eventAttendanceFoundationApi).not.toHaveProperty("findAttendanceById");
  });

  it("documents required domain enums including IMPORT (existing facility)", () => {
    expect(EVENT_ATTENDANCE_STATUSES).toContain("EXPECTED");
    expect(EVENT_ATTENDANCE_SOURCES).toEqual(
      expect.arrayContaining([
        "STAFF_SEARCH",
        "STAFF_QR",
        "SELF_QR",
        "WALK_IN",
        "ADMIN_CORRECTION",
      ]),
    );
    expect(EVENT_ATTENDANCE_ACTIONS).toContain("STATUS_CORRECTED");
  });
});

describe.runIf(hasDatabase)("Blueprint 7.3B attendance foundation (database)", () => {
  let fx: AttendanceFoundationFixture;

  beforeAll(async () => {
    fx = await createAttendanceFoundationFixture();
  });

  afterAll(async () => {
    await fx.cleanup();
    await prisma.$disconnect();
  });

  it("keeps 7.3A settings disabled for the fixture event", async () => {
    const settings = await prisma.eventCheckInSettings.findFirst({
      where: { organizationId: fx.organizationId, eventId: fx.eventId },
    });
    expect(settings?.checkInEnabled).toBe(false);
  });

  it("creates a valid same-tenant EXPECTED attendance row with safe defaults", async () => {
    const row = await createExpectedAttendance({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      attendeeId: fx.guestAttendeeId,
      memberId: null,
    });

    expect(row.status).toBe("EXPECTED");
    expect(row.checkInCount).toBe(0);
    expect(row.source).toBeNull();
    expect(row.firstCheckedInAt).toBeNull();
    expect(row.lastCheckedInAt).toBeNull();
    expect(row.checkedOutAt).toBeNull();
    expect(row.memberId).toBeNull();
    expect(row).not.toHaveProperty("firstName");
    expect(row).not.toHaveProperty("email");

    const found = await findAttendanceByEventAttendee(
      fx.organizationId,
      fx.eventId,
      fx.guestAttendeeId,
    );
    expect(found?.id).toBe(row.id);
  });

  it("rejects duplicate attendance for the same event + attendee", async () => {
    await expect(
      createExpectedAttendance({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        attendeeId: fx.guestAttendeeId,
      }),
    ).rejects.toMatchObject({
      code: "DUPLICATE",
    } satisfies Partial<AttendanceFoundationError>);
  });

  it("rejects registration/attendee mismatch on the same tenant", async () => {
    await expect(
      createExpectedAttendance({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        registrationId: fx.otherRegistrationId,
        attendeeId: fx.guestAttendeeId,
      }),
    ).rejects.toMatchObject({ code: "MISMATCH" });
  });

  it("allows guest null memberId and member-backed attendees", async () => {
    const guestAlready = await findAttendanceByEventAttendee(
      fx.organizationId,
      fx.eventId,
      fx.guestAttendeeId,
    );
    expect(guestAlready?.memberId).toBeNull();

    const memberRow = await createExpectedAttendance({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      attendeeId: fx.memberAttendeeId,
    });
    expect(memberRow.memberId).toBe(fx.memberId);
  });

  describe("cross-tenant reference matrix", () => {
    it("rejects a foreign organizationId for a same-tenant event", async () => {
      await expect(
        createExpectedAttendance({
          organizationId: fx.otherOrganizationId,
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeId: fx.guestAttendeeId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects a foreign registrationId under the local event", async () => {
      await expect(
        createExpectedAttendance({
          organizationId: fx.organizationId,
          eventId: fx.eventId,
          registrationId: fx.foreignRegistrationId,
          attendeeId: fx.guestAttendeeId,
        }),
      ).rejects.toMatchObject({ code: "MISMATCH" });
    });

    it("rejects a foreign attendeeId under the local registration", async () => {
      await expect(
        createExpectedAttendance({
          organizationId: fx.organizationId,
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeId: fx.foreignAttendeeId,
        }),
      ).rejects.toMatchObject({ code: "MISMATCH" });
    });

    it("rejects a foreign memberId under the local tenant", async () => {
      await expect(
        createExpectedAttendance({
          organizationId: fx.organizationId,
          eventId: fx.eventId,
          registrationId: fx.otherRegistrationId,
          attendeeId: fx.otherAttendeeId,
          memberId: fx.otherMemberId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects listing actions with a foreign organizationId", async () => {
      const attendance = await findAttendanceByEventAttendee(
        fx.organizationId,
        fx.eventId,
        fx.guestAttendeeId,
      );
      if (!attendance) throw new Error("Expected attendance missing");

      await expect(
        listAttendanceActions(fx.otherOrganizationId, attendance.id),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects appending an action against a foreign organization/event pair", async () => {
      const attendance = await findAttendanceByEventAttendee(
        fx.organizationId,
        fx.eventId,
        fx.guestAttendeeId,
      );
      if (!attendance) throw new Error("Expected attendance missing");

      await expect(
        appendAttendanceAction({
          organizationId: fx.otherOrganizationId,
          eventId: fx.eventId,
          attendanceId: attendance.id,
          action: "CHECKED_IN",
          source: "STAFF_SEARCH",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("rejects negative checkInCount at the database", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "event_attendance_records" (
          "id", "organizationId", "eventId", "registrationId", "attendeeId",
          "status", "checkInCount", "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}::uuid,
          ${fx.organizationId}::uuid,
          ${fx.eventId}::uuid,
          ${fx.otherRegistrationId}::uuid,
          ${fx.otherAttendeeId}::uuid,
          'EXPECTED',
          -1,
          NOW(),
          NOW()
        )
      `,
    ).rejects.toThrow();
  });

  it("returns action history in stable chronological order with id tie-breaker", async () => {
    const attendance = await findAttendanceByEventAttendee(
      fx.organizationId,
      fx.eventId,
      fx.guestAttendeeId,
    );
    if (!attendance) throw new Error("Expected attendance missing");

    const t1 = new Date("2030-01-15T15:05:00.000Z");
    const t2 = new Date("2030-01-15T15:10:00.000Z");

    await appendAttendanceAction({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      attendanceId: attendance.id,
      action: "CHECKED_IN",
      source: "STAFF_SEARCH",
      occurredAt: t2,
      metadata: { note: "later" },
    });
    await appendAttendanceAction({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      attendanceId: attendance.id,
      action: "CHECKED_IN",
      source: "STAFF_SEARCH",
      occurredAt: t1,
      metadata: { note: "earlier" },
    });

    const sameTime = new Date("2030-01-15T15:12:00.000Z");
    const a = await appendAttendanceAction({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      attendanceId: attendance.id,
      action: "STATUS_CORRECTED",
      source: "ADMIN_CORRECTION",
      occurredAt: sameTime,
      reason: "a",
      metadata: { from: "EXPECTED", to: "PRESENT" },
    });
    const b = await appendAttendanceAction({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      attendanceId: attendance.id,
      action: "STATUS_CORRECTED",
      source: "ADMIN_CORRECTION",
      occurredAt: sameTime,
      reason: "b",
    });

    const actions = await listAttendanceActions(
      fx.organizationId,
      attendance.id,
    );
    expect(actions.map((row) => row.metadata)).toEqual(
      expect.arrayContaining([{ note: "earlier" }, { note: "later" }]),
    );
    const times = actions.map((row) => row.occurredAt.getTime());
    expect(times).toEqual([...times].sort((x, y) => x - y));

    const sameStamp = actions.filter(
      (row) => row.occurredAt.getTime() === sameTime.getTime(),
    );
    expect(sameStamp.map((row) => row.id)).toEqual(
      [...sameStamp]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((row) => row.id),
    );
    expect(sameStamp.map((row) => row.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("rejects unsafe attendance-action metadata", async () => {
    const attendance = await findAttendanceByEventAttendee(
      fx.organizationId,
      fx.eventId,
      fx.guestAttendeeId,
    );
    if (!attendance) throw new Error("Expected attendance missing");

    await expect(
      appendAttendanceAction({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        attendanceId: attendance.id,
        action: "CHECKED_IN",
        source: "STAFF_QR",
        metadata: { token: "raw-qr-secret" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      appendAttendanceAction({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        attendanceId: attendance.id,
        action: "CHECKED_IN",
        source: "STAFF_QR",
        metadata: { email: "person@example.com" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
