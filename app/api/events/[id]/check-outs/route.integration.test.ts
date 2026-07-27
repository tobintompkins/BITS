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

import { POST as checkInPost } from "@/app/api/events/[id]/check-ins/route";
import { POST as checkOutPost } from "@/app/api/events/[id]/check-outs/route";
import { POST as reEnterPost } from "@/app/api/events/[id]/re-entries/route";
import { prisma } from "@/lib/db/prisma";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";
import {
  closeStationIfActive,
  createActiveStation,
} from "@/server/repositories/event-check-in-station.repository";

const hasDatabase = Boolean(process.env.DATABASE_URL);

function apiRequest(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost",
      origin: "http://localhost",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

describe.runIf(hasDatabase)(
  "Blueprint 7.3X check-out / re-entry API integration",
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
      if (!fx) return;
      await wipe();
      await prisma.eventCheckInStation.deleteMany({
        where: { eventId: { in: [fx.eventId, fx.foreignEventId] } },
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

    async function wipe() {
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

    async function openCheckoutWindow() {
      const now = new Date();
      await prisma.eventCheckInSettings.update({
        where: { eventId: fx.eventId },
        data: {
          checkInEnabled: true,
          checkInOpensAt: new Date(now.getTime() - 60_000),
          checkInClosesAt: new Date(now.getTime() + 60 * 60_000),
          allowCheckOut: true,
          allowReentry: true,
        },
      });
    }

    async function checkIn(attendeeId: string) {
      const response = await checkInPost(
        apiRequest(`/api/events/${fx.eventId}/check-ins`, { attendeeId }),
        { params: Promise.resolve({ id: fx.eventId }) },
      );
      expect(response.status).toBeLessThan(300);
      return response.json();
    }

    it("checks out and re-enters through the thin API", async () => {
      await wipe();
      await openCheckoutWindow();
      await checkIn(fx.guestAttendeeId);

      const out = await checkOutPost(
        apiRequest(`/api/events/${fx.eventId}/check-outs`, {
          attendeeId: fx.guestAttendeeId,
        }),
        { params: Promise.resolve({ id: fx.eventId }) },
      );
      expect(out.status).toBe(201);
      const outJson = await out.json();
      expect(outJson.data.outcome).toBe("CHECKED_OUT");
      expect(outJson.data.status).toBe("CHECKED_OUT");

      const again = await checkOutPost(
        apiRequest(`/api/events/${fx.eventId}/check-outs`, {
          attendeeId: fx.guestAttendeeId,
        }),
        { params: Promise.resolve({ id: fx.eventId }) },
      );
      expect(again.status).toBe(200);
      expect((await again.json()).data.outcome).toBe("ALREADY_CHECKED_OUT");

      const reenter = await reEnterPost(
        apiRequest(`/api/events/${fx.eventId}/re-entries`, {
          attendeeId: fx.guestAttendeeId,
        }),
        { params: Promise.resolve({ id: fx.eventId }) },
      );
      expect(reenter.status).toBe(201);
      const reJson = await reenter.json();
      expect(reJson.data.outcome).toBe("REENTERED");
      expect(reJson.data.checkInCount).toBe(2);
      expect(reJson.data.checkedOutAt).toBeNull();
    });

    it("requires canOperateCheckIn and masks cross-tenant misses", async () => {
      await wipe();
      await openCheckoutWindow();
      await checkIn(fx.guestAttendeeId);

      mocks.requireEventPermission.mockRejectedValueOnce(
        new Error("You do not have permission to check out attendees."),
      );
      const forbidden = await checkOutPost(
        apiRequest(`/api/events/${fx.eventId}/check-outs`, {
          attendeeId: fx.guestAttendeeId,
        }),
        { params: Promise.resolve({ id: fx.eventId }) },
      );
      expect(forbidden.status).toBe(403);

      const missing = await checkOutPost(
        apiRequest(`/api/events/${fx.eventId}/check-outs`, {
          attendeeId: fx.foreignAttendeeId,
        }),
        { params: Promise.resolve({ id: fx.eventId }) },
      );
      expect(missing.status).toBe(404);
      expect((await missing.json()).code).toBe("NOT_FOUND");
    });

    it("maps disabled settings and closed stations safely", async () => {
      await wipe();
      await openCheckoutWindow();
      await checkIn(fx.guestAttendeeId);

      await prisma.eventCheckInSettings.update({
        where: { eventId: fx.eventId },
        data: { allowCheckOut: false, allowReentry: false },
      });
      const disabled = await checkOutPost(
        apiRequest(`/api/events/${fx.eventId}/check-outs`, {
          attendeeId: fx.guestAttendeeId,
        }),
        { params: Promise.resolve({ id: fx.eventId }) },
      );
      expect(disabled.status).toBe(409);
      expect((await disabled.json()).code).toBe("CHECK_OUT_DISABLED");

      await openCheckoutWindow();
      const station = await createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: `Api Checkout ${Date.now()}`,
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
      const closed = await checkOutPost(
        apiRequest(`/api/events/${fx.eventId}/check-outs`, {
          attendeeId: fx.guestAttendeeId,
          stationId: station.id,
        }),
        { params: Promise.resolve({ id: fx.eventId }) },
      );
      expect(closed.status).toBe(409);
      expect((await closed.json()).code).toBe("STATION_CLOSED");
    });

    it("handles simultaneous duplicate check-outs with one effective transition", async () => {
      await wipe();
      await openCheckoutWindow();
      await checkIn(fx.otherAttendeeId);

      const body = { attendeeId: fx.otherAttendeeId };
      const [a, b] = await Promise.all([
        checkOutPost(
          apiRequest(`/api/events/${fx.eventId}/check-outs`, body),
          { params: Promise.resolve({ id: fx.eventId }) },
        ),
        checkOutPost(
          apiRequest(`/api/events/${fx.eventId}/check-outs`, body),
          { params: Promise.resolve({ id: fx.eventId }) },
        ),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 201]);
      const payloads = await Promise.all([a.json(), b.json()]);
      const outcomes = payloads.map((p) => p.data.outcome).sort();
      expect(outcomes).toEqual(["ALREADY_CHECKED_OUT", "CHECKED_OUT"]);

      const attendanceId = payloads[0].data.attendanceId as string;
      expect(
        await prisma.eventAttendanceAction.count({
          where: { attendanceId, action: "CHECKED_OUT" },
        }),
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            organizationId: fx.organizationId,
            entityId: attendanceId,
            action: "EVENT_STAFF_ATTENDEE_CHECKED_OUT",
          },
        }),
      ).toBe(1);
    });

    it("serializes opposing check-out and re-entry endpoint calls", async () => {
      await wipe();
      await openCheckoutWindow();
      await checkIn(fx.guestAttendeeId);

      const [outRes, inRes] = await Promise.all([
        checkOutPost(
          apiRequest(`/api/events/${fx.eventId}/check-outs`, {
            attendeeId: fx.guestAttendeeId,
          }),
          { params: Promise.resolve({ id: fx.eventId }) },
        ),
        reEnterPost(
          apiRequest(`/api/events/${fx.eventId}/re-entries`, {
            attendeeId: fx.guestAttendeeId,
          }),
          { params: Promise.resolve({ id: fx.eventId }) },
        ),
      ]);

      expect(outRes.status).toBeLessThan(300);
      expect(inRes.status).toBeLessThan(300);

      const row = await prisma.eventAttendanceRecord.findFirstOrThrow({
        where: { eventId: fx.eventId, attendeeId: fx.guestAttendeeId },
      });
      const actions = await prisma.eventAttendanceAction.findMany({
        where: { attendanceId: row.id },
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      });
      const types = actions.map((a) => a.action);
      expect(types[0]).toBe("CHECKED_IN");
      expect(["PRESENT", "CHECKED_OUT"]).toContain(row.status);

      if (row.status === "CHECKED_OUT") {
        expect(types).toEqual(["CHECKED_IN", "CHECKED_OUT"]);
        expect(row.checkInCount).toBe(1);
      } else {
        expect(types).toEqual(["CHECKED_IN", "CHECKED_OUT", "REENTERED"]);
        expect(row.checkInCount).toBe(2);
        expect(row.checkedOutAt).toBeNull();
      }
    });
  },
);
