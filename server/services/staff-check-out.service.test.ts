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
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";
import {
  closeStationIfActive,
  createActiveStation,
} from "@/server/repositories/event-check-in-station.repository";
import { staffCheckInRegisteredAttendee } from "@/server/services/staff-check-in.service";
import {
  staffCheckOutRegisteredAttendee,
  staffReenterRegisteredAttendee,
} from "@/server/services/staff-check-out.service";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)(
  "Blueprint 7.3W staff check-out / re-entry service (database)",
  () => {
    let fx: AttendanceFoundationFixture;
    const actor = { userAccountId: "" as string, email: "staff@example.com" };
    const checkInAt = new Date("2030-01-15T15:00:00.000Z");
    const checkOutAt = new Date("2030-01-15T16:00:00.000Z");
    const reentryAt = new Date("2030-01-15T16:30:00.000Z");

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
          allowCheckOut: true,
          allowReentry: true,
          requireRegistration: true,
        },
      });

      await prisma.eventRegistration.update({
        where: { id: fx.registrationId },
        data: { status: "CONFIRMED" },
      });
      await prisma.eventRegistration.update({
        where: { id: fx.otherRegistrationId },
        data: { status: "CONFIRMED" },
      });
    });

    afterAll(async () => {
      if (!fx) return;
      await wipeAttendance();
      await prisma.eventCheckInStation.deleteMany({
        where: { eventId: { in: [fx.eventId, fx.altEventId, fx.foreignEventId] } },
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
            entityId: { in: attendanceIds },
            action: {
              in: [
                "EVENT_STAFF_ATTENDEE_CHECKED_IN",
                "EVENT_STAFF_ATTENDEE_CHECKED_OUT",
                "EVENT_STAFF_ATTENDEE_REENTERED",
              ],
            },
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

    async function presentAttendee(attendeeId: string, now = checkInAt) {
      return staffCheckInRegisteredAttendee(
        { eventId: fx.eventId, attendeeId, now },
        actor,
      );
    }

    async function enableCheckoutSettings(flags: {
      allowCheckOut?: boolean;
      allowReentry?: boolean;
      checkInEnabled?: boolean;
    }) {
      await prisma.eventCheckInSettings.update({
        where: { eventId: fx.eventId },
        data: {
          checkInEnabled: flags.checkInEnabled ?? true,
          allowCheckOut: flags.allowCheckOut ?? true,
          allowReentry: flags.allowReentry ?? true,
        },
      });
    }

    it("checks out a present attendee when allowCheckOut is enabled", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      const checkedIn = await presentAttendee(fx.guestAttendeeId);

      const result = await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: checkOutAt,
        },
        actor,
      );

      expect(result).toMatchObject({
        attendanceId: checkedIn.attendanceId,
        eventId: fx.eventId,
        attendeeId: fx.guestAttendeeId,
        status: "CHECKED_OUT",
        checkInCount: 1,
        outcome: "CHECKED_OUT",
      });
      expect(result.checkedOutAt?.toISOString()).toBe(checkOutAt.toISOString());
      expect(result.firstCheckedInAt?.toISOString()).toBe(checkInAt.toISOString());
      expect(result.lastCheckedInAt?.toISOString()).toBe(checkInAt.toISOString());
      expect(result).not.toHaveProperty("email");
      expect(result).not.toHaveProperty("firstName");
      expect(result).not.toHaveProperty("version");

      const row = await prisma.eventAttendanceRecord.findUniqueOrThrow({
        where: { id: result.attendanceId },
      });
      expect(row.status).toBe("CHECKED_OUT");
      expect(row.checkInCount).toBe(1);

      const actions = await prisma.eventAttendanceAction.findMany({
        where: { attendanceId: result.attendanceId },
        orderBy: { occurredAt: "asc" },
      });
      expect(actions.map((a) => a.action)).toEqual(["CHECKED_IN", "CHECKED_OUT"]);

      const audits = await prisma.auditEvent.findMany({
        where: {
          organizationId: fx.organizationId,
          entityId: result.attendanceId,
          action: "EVENT_STAFF_ATTENDEE_CHECKED_OUT",
        },
      });
      expect(audits).toHaveLength(1);
    });

    it("rejects disabled check-out", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({ allowCheckOut: false, allowReentry: false });
      await presentAttendee(fx.guestAttendeeId);

      await expect(
        staffCheckOutRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            now: checkOutAt,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "CHECK_OUT_DISABLED" });
    });

    it("rejects check-out when attendance is not PRESENT", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});

      await expect(
        staffCheckOutRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            now: checkOutAt,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "VALIDATION" });

      await presentAttendee(fx.guestAttendeeId);
      await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: checkOutAt,
        },
        actor,
      );

      // Already checked out is idempotent, not a validation error.
      const again = await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: new Date("2030-01-15T16:10:00.000Z"),
        },
        actor,
      );
      expect(again.outcome).toBe("ALREADY_CHECKED_OUT");
      expect(again.checkedOutAt?.toISOString()).toBe(checkOutAt.toISOString());
    });

    it("treats sequential duplicate check-out as idempotent", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      await presentAttendee(fx.guestAttendeeId);
      const first = await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: checkOutAt,
        },
        actor,
      );
      const second = await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: new Date("2030-01-15T16:15:00.000Z"),
        },
        actor,
      );

      expect(second.outcome).toBe("ALREADY_CHECKED_OUT");
      expect(second.checkedOutAt?.toISOString()).toBe(
        first.checkedOutAt?.toISOString(),
      );
      expect(
        await prisma.eventAttendanceAction.count({
          where: { attendanceId: first.attendanceId, action: "CHECKED_OUT" },
        }),
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            organizationId: fx.organizationId,
            entityId: first.attendanceId,
            action: "EVENT_STAFF_ATTENDEE_CHECKED_OUT",
          },
        }),
      ).toBe(1);
    });

    it("handles simultaneous check-out with one effective transition", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      await presentAttendee(fx.otherAttendeeId);
      const input = {
        eventId: fx.eventId,
        attendeeId: fx.otherAttendeeId,
        now: checkOutAt,
      };

      const [a, b] = await Promise.all([
        staffCheckOutRegisteredAttendee(input, actor),
        staffCheckOutRegisteredAttendee(input, actor),
      ]);

      expect(a.attendanceId).toBe(b.attendanceId);
      expect(
        [a.outcome, b.outcome].filter((o) => o === "CHECKED_OUT"),
      ).toHaveLength(1);
      expect(
        [a.outcome, b.outcome].filter((o) => o === "ALREADY_CHECKED_OUT"),
      ).toHaveLength(1);

      expect(
        await prisma.eventAttendanceAction.count({
          where: { attendanceId: a.attendanceId, action: "CHECKED_OUT" },
        }),
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            organizationId: fx.organizationId,
            entityId: a.attendanceId,
            action: "EVENT_STAFF_ATTENDEE_CHECKED_OUT",
          },
        }),
      ).toBe(1);
    });

    it("re-enters a checked-out attendee when allowReentry is enabled", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      await presentAttendee(fx.guestAttendeeId);
      await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: checkOutAt,
        },
        actor,
      );

      const result = await staffReenterRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: reentryAt,
        },
        actor,
      );

      expect(result).toMatchObject({
        status: "PRESENT",
        checkInCount: 2,
        outcome: "REENTERED",
        checkedOutAt: null,
      });
      expect(result.firstCheckedInAt?.toISOString()).toBe(checkInAt.toISOString());
      expect(result.lastCheckedInAt?.toISOString()).toBe(reentryAt.toISOString());

      const actions = await prisma.eventAttendanceAction.findMany({
        where: { attendanceId: result.attendanceId },
        orderBy: { occurredAt: "asc" },
      });
      expect(actions.map((a) => a.action)).toEqual([
        "CHECKED_IN",
        "CHECKED_OUT",
        "REENTERED",
      ]);
      expect(
        await prisma.auditEvent.count({
          where: {
            organizationId: fx.organizationId,
            entityId: result.attendanceId,
            action: "EVENT_STAFF_ATTENDEE_REENTERED",
          },
        }),
      ).toBe(1);

      // Does not mutate attendee/registration rows
      const attendee = await prisma.eventAttendee.findUniqueOrThrow({
        where: { id: fx.guestAttendeeId },
      });
      expect(attendee.status).not.toBe("CHECKED_IN");
    });

    it("rejects disabled re-entry", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({ allowCheckOut: true, allowReentry: false });
      await presentAttendee(fx.guestAttendeeId);
      await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: checkOutAt,
        },
        actor,
      );

      await expect(
        staffReenterRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            now: reentryAt,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "REENTRY_DISABLED" });
    });

    it("rejects re-entry when check-out flags are off (DB forbids reentry without checkout)", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      await presentAttendee(fx.guestAttendeeId);
      await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: checkOutAt,
        },
        actor,
      );
      // Schema invariant: allowReentry cannot be true when allowCheckOut is false.
      await enableCheckoutSettings({ allowCheckOut: false, allowReentry: false });

      await expect(
        staffReenterRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            now: reentryAt,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "CHECK_OUT_DISABLED" });

      await enableCheckoutSettings({});
    });

    it("rejects re-entry for EXPECTED / non-checked-out states", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});

      await expect(
        staffReenterRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            now: reentryAt,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "VALIDATION" });

      // PRESENT → already-present (not a substitute first check-in path)
      await presentAttendee(fx.guestAttendeeId);
      const present = await staffReenterRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: reentryAt,
        },
        actor,
      );
      expect(present.outcome).toBe("ALREADY_PRESENT");
      expect(present.checkInCount).toBe(1);
    });

    it("treats sequential duplicate re-entry as idempotent without incrementing again", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      await presentAttendee(fx.guestAttendeeId);
      await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: checkOutAt,
        },
        actor,
      );
      const first = await staffReenterRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: reentryAt,
        },
        actor,
      );
      const second = await staffReenterRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: new Date("2030-01-15T16:45:00.000Z"),
        },
        actor,
      );

      expect(first.outcome).toBe("REENTERED");
      expect(second.outcome).toBe("ALREADY_PRESENT");
      expect(second.checkInCount).toBe(2);
      expect(second.lastCheckedInAt?.toISOString()).toBe(reentryAt.toISOString());
      expect(
        await prisma.eventAttendanceAction.count({
          where: { attendanceId: first.attendanceId, action: "REENTERED" },
        }),
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            organizationId: fx.organizationId,
            entityId: first.attendanceId,
            action: "EVENT_STAFF_ATTENDEE_REENTERED",
          },
        }),
      ).toBe(1);
    });

    it("handles simultaneous re-entry with one effective increment", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      await presentAttendee(fx.otherAttendeeId);
      await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.otherAttendeeId,
          now: checkOutAt,
        },
        actor,
      );

      const input = {
        eventId: fx.eventId,
        attendeeId: fx.otherAttendeeId,
        now: reentryAt,
      };
      const [a, b] = await Promise.all([
        staffReenterRegisteredAttendee(input, actor),
        staffReenterRegisteredAttendee(input, actor),
      ]);

      expect(a.attendanceId).toBe(b.attendanceId);
      expect(a.checkInCount).toBe(2);
      expect(b.checkInCount).toBe(2);
      expect(
        [a.outcome, b.outcome].filter((o) => o === "REENTERED"),
      ).toHaveLength(1);
      expect(
        await prisma.eventAttendanceAction.count({
          where: { attendanceId: a.attendanceId, action: "REENTERED" },
        }),
      ).toBe(1);
    });

    it("serializes opposing check-out and re-entry into a consistent state/history", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      await presentAttendee(fx.guestAttendeeId);

      const [outResult, inResult] = await Promise.all([
        staffCheckOutRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            now: checkOutAt,
          },
          actor,
        ),
        staffReenterRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            now: reentryAt,
          },
          actor,
        ),
      ]);

      const row = await prisma.eventAttendanceRecord.findFirstOrThrow({
        where: {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
        },
      });
      const actions = await prisma.eventAttendanceAction.findMany({
        where: { attendanceId: row.id },
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      });
      const actionTypes = actions.map((a) => a.action);

      expect(["PRESENT", "CHECKED_OUT"]).toContain(row.status);
      expect(actionTypes[0]).toBe("CHECKED_IN");

      if (row.status === "CHECKED_OUT") {
        // Re-entry saw PRESENT → ALREADY_PRESENT; checkout committed.
        expect(outResult.outcome).toBe("CHECKED_OUT");
        expect(inResult.outcome).toBe("ALREADY_PRESENT");
        expect(row.checkedOutAt).not.toBeNull();
        expect(actionTypes).toEqual(["CHECKED_IN", "CHECKED_OUT"]);
        expect(row.checkInCount).toBe(1);
      } else {
        // Checkout then re-entry committed.
        expect(outResult.outcome).toBe("CHECKED_OUT");
        expect(inResult.outcome).toBe("REENTERED");
        expect(row.checkedOutAt).toBeNull();
        expect(actionTypes).toEqual([
          "CHECKED_IN",
          "CHECKED_OUT",
          "REENTERED",
        ]);
        expect(row.checkInCount).toBe(2);
      }
    });

    it("rejects cancelled and foreign-tenant attendees safely", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      await presentAttendee(fx.otherAttendeeId);

      await prisma.eventAttendee.update({
        where: { id: fx.otherAttendeeId },
        data: { status: "CANCELLED" },
      });
      await expect(
        staffCheckOutRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.otherAttendeeId,
            now: checkOutAt,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "ATTENDEE_CANCELLED" });
      await prisma.eventAttendee.update({
        where: { id: fx.otherAttendeeId },
        data: { status: "REGISTERED" },
      });

      await expect(
        staffCheckOutRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.foreignAttendeeId,
            now: checkOutAt,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "ATTENDEE_NOT_FOUND" });
    });

    it("rejects unauthorized actors without requiring correction permission", async () => {
      mocks.requireEventPermission.mockRejectedValueOnce(
        new Error("You do not have permission to check out attendees."),
      );
      await expect(
        staffCheckOutRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            now: checkOutAt,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.requireEventPermission).toHaveBeenCalled();
    });

    it("attributes optional active station and rejects closed/cross-scope stations", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      const station = await createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: `Checkout Station ${randomUUID().slice(0, 8)}`,
        openedByUserId: fx.createdByUserId,
        openedAt: checkInAt,
        lastActivityAt: checkInAt,
      });
      const foreignStation = await createActiveStation({
        organizationId: fx.otherOrganizationId,
        eventId: fx.foreignEventId,
        name: `Foreign Station ${randomUUID().slice(0, 8)}`,
        openedByUserId: fx.createdByUserId,
        openedAt: checkInAt,
        lastActivityAt: checkInAt,
      });

      const checkedIn = await staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          stationId: station.id,
          now: checkInAt,
        },
        actor,
      );

      const beforeActivity = (
        await prisma.eventCheckInStation.findUniqueOrThrow({
          where: { id: station.id },
        })
      ).lastActivityAt;

      const checkedOut = await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          stationId: station.id,
          now: checkOutAt,
        },
        actor,
      );
      expect(checkedOut.outcome).toBe("CHECKED_OUT");

      const afterCheckout = await prisma.eventAttendanceRecord.findUniqueOrThrow({
        where: { id: checkedIn.attendanceId },
      });
      // Entry station preserved on the current-state row.
      expect(afterCheckout.stationId).toBe(station.id);

      const checkoutAction = await prisma.eventAttendanceAction.findFirstOrThrow({
        where: { attendanceId: checkedIn.attendanceId, action: "CHECKED_OUT" },
      });
      expect(checkoutAction.stationId).toBe(station.id);

      const touched = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });
      expect(touched.lastActivityAt?.getTime()).toBeGreaterThanOrEqual(
        beforeActivity?.getTime() ?? 0,
      );

      await expect(
        staffReenterRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            stationId: foreignStation.id,
            now: reentryAt,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      await prisma.$transaction(async (tx) => {
        await closeStationIfActive(
          {
            organizationId: fx.organizationId,
            eventId: fx.eventId,
            stationId: station.id,
            closedByUserId: fx.createdByUserId,
            closedAt: new Date("2030-01-15T16:05:00.000Z"),
          },
          tx,
        );
      });
      await expect(
        staffReenterRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            stationId: station.id,
            now: reentryAt,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "STATION_CLOSED" });

      const reopened = await createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: `Reentry Station ${randomUUID().slice(0, 8)}`,
        openedByUserId: fx.createdByUserId,
        openedAt: reentryAt,
        lastActivityAt: reentryAt,
      });
      const reentered = await staffReenterRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          stationId: reopened.id,
          now: reentryAt,
        },
        actor,
      );
      expect(reentered.outcome).toBe("REENTERED");
      const afterReentry = await prisma.eventAttendanceRecord.findUniqueOrThrow({
        where: { id: reentered.attendanceId },
      });
      expect(afterReentry.stationId).toBe(reopened.id);
    });

    it("rolls back state, action, and audit when the transaction fails", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      await presentAttendee(fx.memberAttendeeId);
      const badActor = { userAccountId: randomUUID(), email: null };

      await expect(
        staffCheckOutRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.memberAttendeeId,
            now: checkOutAt,
          },
          badActor,
        ),
      ).rejects.toThrow();

      const row = await prisma.eventAttendanceRecord.findFirstOrThrow({
        where: {
          eventId: fx.eventId,
          attendeeId: fx.memberAttendeeId,
        },
      });
      expect(row.status).toBe("PRESENT");
      expect(row.checkedOutAt).toBeNull();
      expect(
        await prisma.eventAttendanceAction.count({
          where: { attendanceId: row.id, action: "CHECKED_OUT" },
        }),
      ).toBe(0);
      expect(
        await prisma.auditEvent.count({
          where: {
            organizationId: fx.organizationId,
            entityId: row.id,
            action: "EVENT_STAFF_ATTENDEE_CHECKED_OUT",
          },
        }),
      ).toBe(0);
    });

    it("keeps first-time staff check-in behavior unchanged", async () => {
      await wipeAttendance();
      await enableCheckoutSettings({});
      const result = await staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: checkInAt,
        },
        actor,
      );
      expect(result).toMatchObject({
        status: "PRESENT",
        checkInCount: 1,
        alreadyPresent: false,
      });
      // Still rejects CHECKED_OUT via first-check-in path (use re-entry service).
      await staffCheckOutRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now: checkOutAt,
        },
        actor,
      );
      await expect(
        staffCheckInRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            now: reentryAt,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "REENTRY_DISABLED" });
    });
  },
);
