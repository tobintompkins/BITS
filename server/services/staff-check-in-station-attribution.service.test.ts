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
import {
  staffCheckInRegisteredAttendee,
  staffCheckInSelectedParty,
} from "@/server/services/staff-check-in.service";
import { closeCheckInStationLifecycle } from "@/server/services/check-in-station-lifecycle.service";

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const dbReady = await canReachDatabase();

describe.runIf(dbReady)(
  "Blueprint 7.3M station attribution in staff check-in (database)",
  () => {
    let fx: AttendanceFoundationFixture;
    const actor = { userAccountId: "" as string, email: "staff@example.com" };
    const now = new Date("2030-01-15T15:30:00.000Z");

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
        data: { status: "CONFIRMED", partySize: 2 },
      });
    });

    afterAll(async () => {
      if (!fx) return;
      await wipeAll();
      await fx.cleanup();
      await prisma.$disconnect();
    });

    beforeEach(() => {
      mocks.findPrimaryOrganization.mockResolvedValue({ id: fx.organizationId });
      mocks.requireEventPermission.mockResolvedValue({
        canOperateCheckIn: true,
        canManageCheckIn: true,
        userAccountId: actor.userAccountId,
      });
      mocks.assertActionAllowed.mockResolvedValue(undefined);
    });

    async function wipeAll() {
      const eventIds = [fx.eventId, fx.altEventId, fx.foreignEventId];
      const stationIds = (
        await prisma.eventCheckInStation.findMany({
          where: { eventId: { in: eventIds } },
          select: { id: true },
        })
      ).map((row) => row.id);
      const attendanceIds = (
        await prisma.eventAttendanceRecord.findMany({
          where: { eventId: { in: eventIds } },
          select: { id: true },
        })
      ).map((row) => row.id);

      // Scope audit deletes to this fixture's entities — shared primary org.
      const auditFilters = [
        {
          action: "EVENT_STAFF_PARTY_CHECKED_IN" as const,
          entityId: fx.registrationId,
        },
        ...(attendanceIds.length > 0
          ? [
              {
                action: "EVENT_STAFF_ATTENDEE_CHECKED_IN" as const,
                entityId: { in: attendanceIds },
              },
            ]
          : []),
        ...(stationIds.length > 0
          ? [
              {
                action: {
                  in: [
                    "EVENT_CHECK_IN_STATION_OPENED" as const,
                    "EVENT_CHECK_IN_STATION_CLOSED" as const,
                  ],
                },
                entityId: { in: stationIds },
              },
            ]
          : []),
      ];
      await prisma.auditEvent.deleteMany({
        where: {
          organizationId: fx.organizationId,
          OR: auditFilters,
        },
      });

      await prisma.eventAttendanceAction.deleteMany({
        where: { eventId: { in: eventIds } },
      });
      await prisma.eventAttendanceRecord.deleteMany({
        where: { eventId: { in: eventIds } },
      });
      await prisma.eventCheckInIdempotency.deleteMany({
        where: { eventId: fx.eventId },
      });
      if (stationIds.length > 0) {
        await prisma.eventCheckInStation.deleteMany({
          where: { id: { in: stationIds } },
        });
      }
    }

    async function openStation(name: string, eventId = fx.eventId) {
      return createActiveStation({
        organizationId: fx.organizationId,
        eventId,
        name,
        openedByUserId: fx.createdByUserId,
        openedAt: now,
        lastActivityAt: now,
      });
    }

    it("attributes a single check-in to an active same-tenant station and updates activity", async () => {
      await wipeAll();
      const station = await openStation("Attribution Desk");
      const earlier = station.lastActivityAt;

      const result = await staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          stationId: station.id,
          now: new Date("2030-01-15T15:40:00.000Z"),
        },
        actor,
      );

      expect(result.alreadyPresent).toBe(false);
      expect(result).not.toHaveProperty("stationId");
      expect(result).not.toHaveProperty("deviceLabel");

      const attendance = await prisma.eventAttendanceRecord.findUniqueOrThrow({
        where: { id: result.attendanceId },
      });
      expect(attendance.stationId).toBe(station.id);

      const action = await prisma.eventAttendanceAction.findFirstOrThrow({
        where: { attendanceId: result.attendanceId, action: "CHECKED_IN" },
      });
      expect(action.stationId).toBe(station.id);

      const refreshed = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });
      expect(refreshed.lastActivityAt?.toISOString()).toBe(
        "2030-01-15T15:40:00.000Z",
      );
      expect(refreshed.lastActivityAt?.getTime()).toBeGreaterThan(
        earlier?.getTime() ?? 0,
      );

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: {
          organizationId: fx.organizationId,
          entityId: result.attendanceId,
          action: "EVENT_STAFF_ATTENDEE_CHECKED_IN",
        },
      });
      const meta = JSON.stringify(audit.changeMetadata);
      expect(meta).toContain(station.id);
      expect(meta).not.toMatch(/deviceLabel|ipAddress|fingerprint|userAgent/i);
    });

    it("keeps unattributed behavior when stationId is omitted", async () => {
      await wipeAll();
      const result = await staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          now,
        },
        actor,
      );
      const action = await prisma.eventAttendanceAction.findFirstOrThrow({
        where: { attendanceId: result.attendanceId },
      });
      expect(action.stationId).toBeNull();
      const attendance = await prisma.eventAttendanceRecord.findUniqueOrThrow({
        where: { id: result.attendanceId },
      });
      expect(attendance.stationId).toBeNull();
    });

    it("rejects closed, cross-event, cross-tenant, and missing stations", async () => {
      await wipeAll();
      const active = await openStation("Reject Desk");
      await prisma.$transaction(async (tx) => {
        await closeStationIfActive(
          {
            organizationId: fx.organizationId,
            eventId: fx.eventId,
            stationId: active.id,
            closedByUserId: fx.createdByUserId,
            closedAt: new Date("2030-01-15T15:35:00.000Z"),
          },
          tx,
        );
      });

      await expect(
        staffCheckInRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            stationId: active.id,
            now,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "STATION_CLOSED" });

      const otherEventStation = await openStation("Alt Desk", fx.altEventId);
      await expect(
        staffCheckInRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            stationId: otherEventStation.id,
            now,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      const foreignStation = await createActiveStation({
        organizationId: fx.otherOrganizationId,
        eventId: fx.foreignEventId,
        name: "Foreign Desk",
        openedByUserId: fx.createdByUserId,
        openedAt: now,
        lastActivityAt: now,
      });
      await expect(
        staffCheckInRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            stationId: foreignStation.id,
            now,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      await expect(
        staffCheckInRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            stationId: randomUUID(),
            now,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("does not rewrite attribution or activity on already-present", async () => {
      await wipeAll();
      const station = await openStation("Idempotent Desk");
      const first = await staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          stationId: station.id,
          now,
        },
        actor,
      );
      const afterFirst = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });

      const second = await staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          stationId: station.id,
          now: new Date("2030-01-15T16:00:00.000Z"),
        },
        actor,
      );
      expect(second.alreadyPresent).toBe(true);

      const actions = await prisma.eventAttendanceAction.findMany({
        where: { attendanceId: first.attendanceId },
      });
      expect(actions).toHaveLength(1);
      expect(actions[0]?.stationId).toBe(station.id);

      const afterSecond = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });
      expect(afterSecond.lastActivityAt?.toISOString()).toBe(
        afterFirst.lastActivityAt?.toISOString(),
      );
    });

    it("attributes party newly-effective actions and updates activity once", async () => {
      await wipeAll();
      const station = await openStation("Party Desk");
      const result = await staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId, fx.memberAttendeeId],
          stationId: station.id,
          now: new Date("2030-01-15T15:50:00.000Z"),
        },
        actor,
      );
      expect(result.newlyCheckedInCount).toBe(2);

      const actions = await prisma.eventAttendanceAction.findMany({
        where: {
          eventId: fx.eventId,
          action: "CHECKED_IN",
        },
      });
      expect(actions).toHaveLength(2);
      expect(actions.every((row) => row.stationId === station.id)).toBe(true);

      const refreshed = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });
      expect(refreshed.lastActivityAt?.toISOString()).toBe(
        "2030-01-15T15:50:00.000Z",
      );
    });

    it("does not update activity for an all-already-present party", async () => {
      await wipeAll();
      const station = await openStation("Already Desk");
      await staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId, fx.memberAttendeeId],
          stationId: station.id,
          now,
        },
        actor,
      );
      const afterFirst = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });

      await staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId, fx.memberAttendeeId],
          stationId: station.id,
          now: new Date("2030-01-15T16:10:00.000Z"),
        },
        actor,
      );
      const afterSecond = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });
      expect(afterSecond.lastActivityAt?.toISOString()).toBe(
        afterFirst.lastActivityAt?.toISOString(),
      );
    });

    it("handles mixed new/already-present party attribution correctly", async () => {
      await wipeAll();
      const station = await openStation("Mixed Desk");
      await staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          stationId: station.id,
          now,
        },
        actor,
      );

      const result = await staffCheckInSelectedParty(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeIds: [fx.guestAttendeeId, fx.memberAttendeeId],
          stationId: station.id,
          now: new Date("2030-01-15T15:55:00.000Z"),
        },
        actor,
      );
      expect(result.newlyCheckedInCount).toBe(1);
      expect(result.alreadyPresentCount).toBe(1);

      const memberAttendance = await prisma.eventAttendanceRecord.findFirstOrThrow({
        where: { eventId: fx.eventId, attendeeId: fx.memberAttendeeId },
      });
      expect(memberAttendance.stationId).toBe(station.id);

      const guestActions = await prisma.eventAttendanceAction.count({
        where: {
          eventId: fx.eventId,
          action: "CHECKED_IN",
          attendance: { attendeeId: fx.guestAttendeeId },
        },
      });
      expect(guestActions).toBe(1);
    });

    it("rejects check-in when the station closes concurrently under lock order", async () => {
      await wipeAll();
      const station = await openStation("Race Desk");

      // Hold a transaction that closes the station after check-in has begun
      // by racing close against check-in; one must lose safely.
      const checkInPromise = staffCheckInRegisteredAttendee(
        {
          eventId: fx.eventId,
          attendeeId: fx.guestAttendeeId,
          stationId: station.id,
          now: new Date("2030-01-15T15:41:00.000Z"),
        },
        actor,
      );
      const closePromise = closeCheckInStationLifecycle(
        {
          eventId: fx.eventId,
          stationId: station.id,
          now: new Date("2030-01-15T15:41:00.000Z"),
        },
        actor,
      );

      const settled = await Promise.allSettled([checkInPromise, closePromise]);
      const checkIn = settled[0];
      const close = settled[1];

      expect(close.status).toBe("fulfilled");

      const finalStation = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });
      expect(finalStation.status).toBe("CLOSED");

      if (checkIn.status === "fulfilled") {
        // Check-in won the race: attribution happened while ACTIVE, then close.
        const action = await prisma.eventAttendanceAction.findFirstOrThrow({
          where: {
            eventId: fx.eventId,
            action: "CHECKED_IN",
          },
        });
        expect(action.stationId).toBe(station.id);
      } else {
        // Close won: check-in must fail without attributing to a closed station.
        expect(checkIn.reason).toMatchObject({ code: "STATION_CLOSED" });
        const actions = await prisma.eventAttendanceAction.count({
          where: { eventId: fx.eventId, stationId: station.id },
        });
        expect(actions).toBe(0);
      }
    });

    it("allows two simultaneous attributed check-ins without losing actions", async () => {
      await wipeAll();
      const station = await openStation("Concurrent Desk");
      const [a, b] = await Promise.all([
        staffCheckInRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            stationId: station.id,
            now,
          },
          actor,
        ),
        staffCheckInRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.memberAttendeeId,
            stationId: station.id,
            now,
          },
          actor,
        ),
      ]);

      expect(a.alreadyPresent).toBe(false);
      expect(b.alreadyPresent).toBe(false);

      const actions = await prisma.eventAttendanceAction.count({
        where: { eventId: fx.eventId, stationId: station.id, action: "CHECKED_IN" },
      });
      expect(actions).toBe(2);
    });

    it("database composite FK rejects cross-event station linkage", async () => {
      await wipeAll();
      const station = await openStation("Constraint Desk", fx.altEventId);
      await expect(
        prisma.eventAttendanceRecord.create({
          data: {
            organizationId: fx.organizationId,
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            registrationId: fx.registrationId,
            status: "PRESENT",
            source: "STAFF_SEARCH",
            stationId: station.id,
            checkInCount: 1,
            firstCheckedInAt: now,
            lastCheckedInAt: now,
          },
        }),
      ).rejects.toThrow();
    });

    it("leaves historical actions null and rolls back failed attributed check-ins", async () => {
      await wipeAll();
      const station = await openStation("Rollback Desk");
      const historicalAttendance = await prisma.eventAttendanceRecord.create({
        data: {
          organizationId: fx.organizationId,
          eventId: fx.eventId,
          attendeeId: fx.otherAttendeeId,
          registrationId: fx.otherRegistrationId,
          status: "PRESENT",
          source: "STAFF_SEARCH",
          checkInCount: 1,
          firstCheckedInAt: now,
          lastCheckedInAt: now,
        },
      });
      const historical = await prisma.eventAttendanceAction.create({
        data: {
          organizationId: fx.organizationId,
          eventId: fx.eventId,
          attendanceId: historicalAttendance.id,
          action: "CHECKED_IN",
          source: "STAFF_SEARCH",
          stationId: null,
          occurredAt: now,
        },
      });
      expect(historical.stationId).toBeNull();

      const beforeActivity = (
        await prisma.eventCheckInStation.findUniqueOrThrow({
          where: { id: station.id },
        })
      ).lastActivityAt;

      await expect(
        staffCheckInRegisteredAttendee(
          {
            eventId: fx.eventId,
            attendeeId: fx.guestAttendeeId,
            stationId: station.id,
            now,
          },
          { userAccountId: randomUUID(), email: null },
        ),
      ).rejects.toThrow();

      expect(
        await prisma.eventAttendanceRecord.count({
          where: { eventId: fx.eventId, attendeeId: fx.guestAttendeeId },
        }),
      ).toBe(0);
      expect(
        await prisma.eventAttendanceAction.count({
          where: {
            eventId: fx.eventId,
            stationId: station.id,
          },
        }),
      ).toBe(0);

      const after = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });
      expect(after.lastActivityAt?.toISOString()).toBe(
        beforeActivity?.toISOString(),
      );
    });
  },
);
