import "dotenv/config";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  requireEventPermission: vi.fn(),
  assertActionAllowed: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
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

import { POST } from "@/app/api/events/[id]/check-ins/route";
import { prisma } from "@/lib/db/prisma";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";
import {
  closeStationIfActive,
  createActiveStation,
} from "@/server/repositories/event-check-in-station.repository";
import { closeCheckInStationLifecycle } from "@/server/services/check-in-station-lifecycle.service";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)(
  "POST /api/events/[id]/check-ins integration",
  () => {
    let fx: AttendanceFoundationFixture;

    beforeAll(async () => {
      fx = await createAttendanceFoundationFixture();
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
      await prisma.eventCheckInIdempotency.deleteMany({
        where: { eventId: fx.eventId },
      });
      await fx.cleanup();
      await prisma.$disconnect();
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.auth.mockResolvedValue({ userId: "clerk_1" });
      mocks.currentUser.mockResolvedValue({
        primaryEmailAddress: { emailAddress: "staff@example.com" },
      });
      mocks.getOrCreateUserAccount.mockResolvedValue({
        id: fx.createdByUserId,
        primaryEmail: "staff@example.com",
      });
      mocks.findPrimaryOrganization.mockResolvedValue({
        id: fx.organizationId,
      });
      mocks.requireEventPermission.mockResolvedValue({
        canOperateCheckIn: true,
        canManageCheckIn: true,
        userAccountId: fx.createdByUserId,
      });
      mocks.assertActionAllowed.mockResolvedValue(undefined);
    });

    async function openWindowAroundNow() {
      const now = new Date();
      await prisma.eventCheckInSettings.update({
        where: { eventId: fx.eventId },
        data: {
          checkInEnabled: true,
          checkInOpensAt: new Date(now.getTime() - 60_000),
          checkInClosesAt: new Date(now.getTime() + 60_000),
        },
      });
    }

    async function wipe() {
      const attendanceIds = (
        await prisma.eventAttendanceRecord.findMany({
          where: { eventId: fx.eventId },
          select: { id: true },
        })
      ).map((row) => row.id);
      const stationIds = (
        await prisma.eventCheckInStation.findMany({
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
      if (stationIds.length > 0) {
        await prisma.auditEvent.deleteMany({
          where: {
            organizationId: fx.organizationId,
            action: {
              in: [
                "EVENT_CHECK_IN_STATION_OPENED",
                "EVENT_CHECK_IN_STATION_CLOSED",
              ],
            },
            entityId: { in: stationIds },
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
      if (stationIds.length > 0) {
        await prisma.eventCheckInStation.deleteMany({
          where: { id: { in: stationIds } },
        });
      }
    }

    function postFor(attendeeId: string, stationId?: string) {
      return POST(
        new Request(`http://localhost/api/events/${fx.eventId}/check-ins`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            host: "localhost",
            origin: "http://localhost",
          },
          body: JSON.stringify(
            stationId ? { attendeeId, stationId } : { attendeeId },
          ),
        }),
        { params: Promise.resolve({ id: fx.eventId }) },
      );
    }

    it("checks in an eligible same-tenant attendee end-to-end", async () => {
      await wipe();
      await openWindowAroundNow();

      const response = await postFor(fx.guestAttendeeId);
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data).toMatchObject({
        eventId: fx.eventId,
        attendeeId: fx.guestAttendeeId,
        status: "PRESENT",
        checkInCount: 1,
        alreadyPresent: false,
      });

      const again = await postFor(fx.guestAttendeeId);
      expect(again.status).toBe(200);
      expect((await again.json()).data.alreadyPresent).toBe(true);

      const actions = await prisma.eventAttendanceAction.count({
        where: {
          eventId: fx.eventId,
          action: "CHECKED_IN",
        },
      });
      expect(actions).toBe(1);
    });

    it("returns indistinguishable not-found for a foreign attendee", async () => {
      await openWindowAroundNow();
      const response = await postFor(fx.foreignAttendeeId);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: "Not found",
        code: "NOT_FOUND",
      });
    });

    it("maps disabled check-in to conflict", async () => {
      await wipe();
      await prisma.eventCheckInSettings.update({
        where: { eventId: fx.eventId },
        data: { checkInEnabled: false },
      });
      const response = await postFor(fx.guestAttendeeId);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: "CHECK_IN_DISABLED",
      });
    });

    it("handles simultaneous endpoint requests with one effective check-in", async () => {
      await wipe();
      await openWindowAroundNow();

      const [a, b] = await Promise.all([
        postFor(fx.otherAttendeeId),
        postFor(fx.otherAttendeeId),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 201].sort());

      const attendance = await prisma.eventAttendanceRecord.findFirstOrThrow({
        where: { eventId: fx.eventId, attendeeId: fx.otherAttendeeId },
      });
      expect(attendance.checkInCount).toBe(1);
      expect(
        await prisma.eventAttendanceAction.count({
          where: { attendanceId: attendance.id, action: "CHECKED_IN" },
        }),
      ).toBe(1);
    });

    it("attributes through an active station and leaves omitted station unattributed", async () => {
      await wipe();
      await openWindowAroundNow();
      const station = await createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: "API Desk",
        openedByUserId: fx.createdByUserId,
      });

      const attributed = await postFor(fx.guestAttendeeId, station.id);
      expect(attributed.status).toBe(201);
      expect((await attributed.json()).data).not.toHaveProperty("stationId");

      const action = await prisma.eventAttendanceAction.findFirstOrThrow({
        where: {
          eventId: fx.eventId,
          action: "CHECKED_IN",
          attendance: { attendeeId: fx.guestAttendeeId },
        },
      });
      expect(action.stationId).toBe(station.id);

      const refreshed = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });
      expect(refreshed.lastActivityAt).not.toBeNull();

      const unattributed = await postFor(fx.memberAttendeeId);
      expect(unattributed.status).toBe(201);
      const plain = await prisma.eventAttendanceAction.findFirstOrThrow({
        where: {
          eventId: fx.eventId,
          action: "CHECKED_IN",
          attendance: { attendeeId: fx.memberAttendeeId },
        },
      });
      expect(plain.stationId).toBeNull();
    });

    it("rejects closed stations and does not rewrite attribution on already-present", async () => {
      await wipe();
      await openWindowAroundNow();
      const station = await createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: "Closed API Desk",
        openedByUserId: fx.createdByUserId,
      });
      await prisma.$transaction(async (tx) => {
        await closeStationIfActive(
          {
            organizationId: fx.organizationId,
            eventId: fx.eventId,
            stationId: station.id,
            closedByUserId: fx.createdByUserId,
            closedAt: new Date(),
          },
          tx,
        );
      });

      const closed = await postFor(fx.guestAttendeeId, station.id);
      expect(closed.status).toBe(409);
      expect(await closed.json()).toMatchObject({ code: "STATION_CLOSED" });

      await wipe();
      await openWindowAroundNow();
      const active = await createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: "Idempotent API Desk",
        openedByUserId: fx.createdByUserId,
      });
      const first = await postFor(fx.guestAttendeeId, active.id);
      expect(first.status).toBe(201);
      const afterFirst = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: active.id },
      });

      const second = await postFor(fx.guestAttendeeId, active.id);
      expect(second.status).toBe(200);
      const afterSecond = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: active.id },
      });
      expect(afterSecond.lastActivityAt?.toISOString()).toBe(
        afterFirst.lastActivityAt?.toISOString(),
      );
      expect(
        await prisma.eventAttendanceAction.count({
          where: {
            eventId: fx.eventId,
            action: "CHECKED_IN",
            attendance: { attendeeId: fx.guestAttendeeId },
          },
        }),
      ).toBe(1);
    });

    it("keeps station-close/check-in races safe through the endpoint", async () => {
      await wipe();
      await openWindowAroundNow();
      const station = await createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: "Race API Desk",
        openedByUserId: fx.createdByUserId,
      });

      const settled = await Promise.allSettled([
        postFor(fx.guestAttendeeId, station.id),
        closeCheckInStationLifecycle(
          { eventId: fx.eventId, stationId: station.id },
          {
            userAccountId: fx.createdByUserId,
            email: "staff@example.com",
          },
        ),
      ]);

      const checkIn = settled[0];
      expect(settled[1].status).toBe("fulfilled");
      const finalStation = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });
      expect(finalStation.status).toBe("CLOSED");

      if (checkIn.status === "fulfilled") {
        if (checkIn.value.status === 201 || checkIn.value.status === 200) {
          const action = await prisma.eventAttendanceAction.findFirst({
            where: { eventId: fx.eventId, stationId: station.id },
          });
          expect(action?.stationId).toBe(station.id);
        } else {
          expect(checkIn.value.status).toBe(409);
        }
      }
    });
  },
);
