import "dotenv/config";

import { randomUUID } from "node:crypto";
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

import { POST } from "@/app/api/events/[id]/registrations/[registrationId]/check-ins/route";
import { prisma } from "@/lib/db/prisma";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";
import { createActiveStation } from "@/server/repositories/event-check-in-station.repository";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)(
  "POST /api/events/[id]/registrations/[registrationId]/check-ins integration",
  () => {
    let fx: AttendanceFoundationFixture;
    let thirdAttendeeId: string;

    beforeAll(async () => {
      fx = await createAttendanceFoundationFixture();
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
      await prisma.auditEvent.deleteMany({
        where: {
          organizationId: fx.organizationId,
          action: "EVENT_STAFF_PARTY_CHECKED_IN",
          entityId: fx.registrationId,
        },
      });
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

    function postParty(
      attendeeIds: string[],
      options?: { registrationId?: string; stationId?: string },
    ) {
      const registrationId = options?.registrationId ?? fx.registrationId;
      const body: { attendeeIds: string[]; stationId?: string } = {
        attendeeIds,
      };
      if (options?.stationId) body.stationId = options.stationId;
      return POST(
        new Request(
          `http://localhost/api/events/${fx.eventId}/registrations/${registrationId}/check-ins`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              host: "localhost",
              origin: "http://localhost",
            },
            body: JSON.stringify(body),
          },
        ),
        {
          params: Promise.resolve({
            id: fx.eventId,
            registrationId,
          }),
        },
      );
    }

    it("checks in two selected same-tenant attendees end-to-end", async () => {
      await wipe();
      await openWindowAroundNow();

      const response = await postParty([
        fx.guestAttendeeId,
        fx.memberAttendeeId,
      ]);
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.data).toMatchObject({
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        requestedCount: 2,
        newlyCheckedInCount: 2,
        alreadyPresentCount: 0,
      });
      expect(json.data.attendees).toHaveLength(2);

      const unselected = await prisma.eventAttendanceRecord.findFirst({
        where: { eventId: fx.eventId, attendeeId: thirdAttendeeId },
      });
      expect(unselected).toBeNull();
    });

    it("returns indistinguishable not-found for foreign or mixed registration lists", async () => {
      await wipe();
      await openWindowAroundNow();

      const foreign = await postParty([fx.foreignAttendeeId]);
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).toMatchObject({
        error: "Not found",
        code: "NOT_FOUND",
      });

      const mixed = await postParty([
        fx.guestAttendeeId,
        fx.otherAttendeeId,
      ]);
      expect(mixed.status).toBe(404);
      expect(
        await prisma.eventAttendanceRecord.count({
          where: { eventId: fx.eventId },
        }),
      ).toBe(0);
    });

    it("maps disabled check-in and ineligible registration to conflict", async () => {
      await wipe();
      await prisma.eventCheckInSettings.update({
        where: { eventId: fx.eventId },
        data: { checkInEnabled: false },
      });
      const disabled = await postParty([fx.guestAttendeeId]);
      expect(disabled.status).toBe(409);
      expect(await disabled.json()).toMatchObject({
        code: "CHECK_IN_DISABLED",
      });

      await openWindowAroundNow();
      await prisma.eventRegistration.update({
        where: { id: fx.registrationId },
        data: { status: "PENDING" },
      });
      const pending = await postParty([fx.guestAttendeeId]);
      expect(pending.status).toBe(409);
      expect(await pending.json()).toMatchObject({
        code: "REGISTRATION_NOT_ELIGIBLE",
      });
      await prisma.eventRegistration.update({
        where: { id: fx.registrationId },
        data: { status: "CONFIRMED" },
      });
    });

    it("returns mixed already-present + new outcomes and is idempotent on repeat", async () => {
      await wipe();
      await openWindowAroundNow();

      const first = await postParty([fx.guestAttendeeId]);
      expect(first.status).toBe(201);

      const second = await postParty([
        fx.guestAttendeeId,
        fx.memberAttendeeId,
      ]);
      expect(second.status).toBe(201);
      const mixed = await second.json();
      expect(mixed.data.newlyCheckedInCount).toBe(1);
      expect(mixed.data.alreadyPresentCount).toBe(1);
      expect(mixed.data.attendees[0].outcome).toBe("ALREADY_PRESENT");
      expect(mixed.data.attendees[1].outcome).toBe("CHECKED_IN");

      const again = await postParty([
        fx.guestAttendeeId,
        fx.memberAttendeeId,
      ]);
      expect(again.status).toBe(200);
      expect((await again.json()).data.newlyCheckedInCount).toBe(0);

      const actions = await prisma.eventAttendanceAction.count({
        where: { eventId: fx.eventId, action: "CHECKED_IN" },
      });
      expect(actions).toBe(2);
    });

    it("handles overlapping simultaneous party requests without double-counting", async () => {
      await wipe();
      await openWindowAroundNow();

      const [left, right] = await Promise.all([
        postParty([fx.guestAttendeeId, fx.memberAttendeeId]),
        postParty([fx.memberAttendeeId, thirdAttendeeId]),
      ]);

      expect([left.status, right.status].every((s) => s === 200 || s === 201)).toBe(
        true,
      );

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
        expect(
          await prisma.eventAttendanceAction.count({
            where: { attendanceId: rows[0]!.id, action: "CHECKED_IN" },
          }),
        ).toBe(1);
      }
    });

    it("rolls back atomically when one selected attendee is cancelled", async () => {
      await wipe();
      await openWindowAroundNow();
      await prisma.eventAttendee.update({
        where: { id: fx.memberAttendeeId },
        data: { status: "CANCELLED" },
      });

      const response = await postParty([
        fx.guestAttendeeId,
        fx.memberAttendeeId,
      ]);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: "ATTENDEE_CANCELLED",
      });
      expect(
        await prisma.eventAttendanceRecord.count({
          where: { eventId: fx.eventId },
        }),
      ).toBe(0);

      await prisma.eventAttendee.update({
        where: { id: fx.memberAttendeeId },
        data: { status: "REGISTERED" },
      });
    });

    it("attributes selected-party check-ins to an active station once", async () => {
      await wipe();
      await openWindowAroundNow();
      const station = await createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: "Party API Desk",
        openedByUserId: fx.createdByUserId,
      });

      const response = await postParty(
        [fx.guestAttendeeId, fx.memberAttendeeId],
        { stationId: station.id },
      );
      expect(response.status).toBe(201);
      expect((await response.json()).data).not.toHaveProperty("stationId");

      const actions = await prisma.eventAttendanceAction.findMany({
        where: { eventId: fx.eventId, action: "CHECKED_IN" },
      });
      expect(actions).toHaveLength(2);
      expect(actions.every((row) => row.stationId === station.id)).toBe(true);

      const refreshed = await prisma.eventCheckInStation.findUniqueOrThrow({
        where: { id: station.id },
      });
      expect(refreshed.lastActivityAt).not.toBeNull();
    });
  },
);
