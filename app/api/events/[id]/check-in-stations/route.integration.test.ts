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

import { GET, POST } from "@/app/api/events/[id]/check-in-stations/route";
import { POST as CLOSE } from "@/app/api/events/[id]/check-in-stations/[stationId]/close/route";
import { prisma } from "@/lib/db/prisma";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";

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
  "check-in-stations API integration",
  () => {
    let fx: AttendanceFoundationFixture;

    beforeAll(async () => {
      fx = await createAttendanceFoundationFixture();
    });

    afterAll(async () => {
      if (!fx) return;
      const stationIds = (
        await prisma.eventCheckInStation.findMany({
          where: { eventId: { in: [fx.eventId, fx.altEventId] } },
          select: { id: true },
        })
      ).map((row) => row.id);
      if (stationIds.length > 0) {
        await prisma.auditEvent.deleteMany({
          where: {
            organizationId: fx.organizationId,
            entityId: { in: stationIds },
          },
        });
      }
      await prisma.eventCheckInStation.deleteMany({
        where: { eventId: { in: [fx.eventId, fx.altEventId] } },
      });
      await fx.cleanup();
      await prisma.$disconnect();
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.auth.mockResolvedValue({ userId: "clerk_1" });
      mocks.currentUser.mockResolvedValue({
        primaryEmailAddress: { emailAddress: "mgr@example.com" },
      });
      mocks.getOrCreateUserAccount.mockResolvedValue({
        id: fx.createdByUserId,
        primaryEmail: "mgr@example.com",
      });
      mocks.findPrimaryOrganization.mockResolvedValue({
        id: fx.organizationId,
      });
      mocks.requireEventPermission.mockResolvedValue({
        canManageCheckIn: true,
        userAccountId: fx.createdByUserId,
      });
      mocks.assertActionAllowed.mockResolvedValue(undefined);
    });

    async function wipe() {
      const stationIds = (
        await prisma.eventCheckInStation.findMany({
          where: { eventId: fx.eventId },
          select: { id: true },
        })
      ).map((row) => row.id);
      if (stationIds.length > 0) {
        await prisma.auditEvent.deleteMany({
          where: {
            organizationId: fx.organizationId,
            entityId: { in: stationIds },
          },
        });
      }
      await prisma.eventCheckInStation.deleteMany({
        where: { eventId: fx.eventId },
      });
    }

    function open(name: string) {
      return POST(
        new Request(
          `http://localhost/api/events/${fx.eventId}/check-in-stations`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              host: "localhost",
              origin: "http://localhost",
            },
            body: JSON.stringify({ name }),
          },
        ),
        { params: Promise.resolve({ id: fx.eventId }) },
      );
    }

    function close(stationId: string) {
      return CLOSE(
        new Request(
          `http://localhost/api/events/${fx.eventId}/check-in-stations/${stationId}/close`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              host: "localhost",
              origin: "http://localhost",
            },
            body: "{}",
          },
        ),
        {
          params: Promise.resolve({
            id: fx.eventId,
            stationId,
          }),
        },
      );
    }

    it("opens, lists, and closes end-to-end", async () => {
      await wipe();
      const created = await open("API Desk");
      expect(created.status).toBe(201);
      const body = await created.json();
      expect(body.data.outcome).toBe("CREATED");

      const listed = await GET(
        new Request(
          `http://localhost/api/events/${fx.eventId}/check-in-stations?status=ACTIVE`,
        ),
        { params: Promise.resolve({ id: fx.eventId }) },
      );
      expect(listed.status).toBe(200);
      const listBody = await listed.json();
      expect(listBody.data.total).toBe(1);
      expect(listBody.data.items[0].id).toBe(body.data.id);

      const closed = await close(body.data.id);
      expect(closed.status).toBe(200);
      expect((await closed.json()).data.outcome).toBe("CLOSED");

      const again = await close(body.data.id);
      expect((await again.json()).data.outcome).toBe("ALREADY_CLOSED");
    });

    it("maps concurrent conflicting opens safely", async () => {
      await wipe();
      const [a, b] = await Promise.all([
        open("Conflict Desk"),
        open(" conflict desk "),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 409]);
      expect(
        await prisma.eventCheckInStation.count({
          where: { eventId: fx.eventId, nameNormalized: "conflict desk" },
        }),
      ).toBe(1);
    });

    it("handles simultaneous closes with one effective transition", async () => {
      await wipe();
      const created = await open("Race Close Desk");
      const id = (await created.json()).data.id as string;
      const [a, b] = await Promise.all([close(id), close(id)]);
      const outcomes = [
        (await a.json()).data.outcome,
        (await b.json()).data.outcome,
      ];
      expect(outcomes.sort()).toEqual(["ALREADY_CLOSED", "CLOSED"]);
      expect(
        await prisma.auditEvent.count({
          where: {
            organizationId: fx.organizationId,
            entityId: id,
            action: "EVENT_CHECK_IN_STATION_CLOSED",
          },
        }),
      ).toBe(1);
    });

    it("returns not-found for foreign event opens", async () => {
      const response = await POST(
        new Request(
          `http://localhost/api/events/${fx.foreignEventId}/check-in-stations`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              host: "localhost",
              origin: "http://localhost",
            },
            body: JSON.stringify({ name: "Foreign" }),
          },
        ),
        { params: Promise.resolve({ id: fx.foreignEventId }) },
      );
      expect(response.status).toBe(404);
    });
  },
);
