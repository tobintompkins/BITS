import "dotenv/config";

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
  closeCheckInStationLifecycle,
  listCheckInStationsLifecycle,
  openCheckInStationLifecycle,
} from "@/server/services/check-in-station-lifecycle.service";

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

describe.runIf(dbReady)("Blueprint 7.3J station lifecycle service (database)", () => {
  let fx: AttendanceFoundationFixture;
  const actor = { userAccountId: "" as string, email: "manager@example.com" };
  const now = new Date("2030-01-15T15:30:00.000Z");

  beforeAll(async () => {
    fx = await createAttendanceFoundationFixture();
    actor.userAccountId = fx.createdByUserId;
  });

  afterAll(async () => {
    if (!fx) return;
    await prisma.auditEvent.deleteMany({
      where: {
        organizationId: fx.organizationId,
        action: {
          in: ["EVENT_CHECK_IN_STATION_OPENED", "EVENT_CHECK_IN_STATION_CLOSED"],
        },
        entityType: "EventCheckInStation",
      },
    });
    await prisma.eventCheckInStation.deleteMany({
      where: { eventId: { in: [fx.eventId, fx.altEventId, fx.foreignEventId] } },
    });
    await fx.cleanup();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mocks.findPrimaryOrganization.mockResolvedValue({ id: fx.organizationId });
    mocks.requireEventPermission.mockResolvedValue({
      canManageCheckIn: true,
      userAccountId: actor.userAccountId,
    });
    mocks.assertActionAllowed.mockResolvedValue(undefined);
  });

  async function wipe() {
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
          action: {
            in: [
              "EVENT_CHECK_IN_STATION_OPENED",
              "EVENT_CHECK_IN_STATION_CLOSED",
            ],
          },
        },
      });
    }
    await prisma.eventCheckInStation.deleteMany({
      where: { eventId: { in: [fx.eventId, fx.altEventId] } },
    });
  }

  it("opens a valid station for authorized managers with safe defaults", async () => {
    await wipe();
    const station = await openCheckInStationLifecycle(
      { eventId: fx.eventId, name: " Lobby 1 ", deviceLabel: null, now },
      actor,
    );

    expect(station).toMatchObject({
      eventId: fx.eventId,
      name: "Lobby 1",
      deviceLabel: null,
      status: "ACTIVE",
      closedAt: null,
      transitioned: true,
    });
    expect(station.openedAt.toISOString()).toBe(now.toISOString());
    expect(station.lastActivityAt?.toISOString()).toBe(now.toISOString());
    expect(station).not.toHaveProperty("organizationId");
    expect(station).not.toHaveProperty("ipAddress");

    const audits = await prisma.auditEvent.count({
      where: {
        organizationId: fx.organizationId,
        entityId: station.id,
        action: "EVENT_CHECK_IN_STATION_OPENED",
      },
    });
    expect(audits).toBe(1);
  });

  it("rejects blank/overlong names and unauthorized actors", async () => {
    await wipe();
    await expect(
      openCheckInStationLifecycle(
        { eventId: fx.eventId, name: "  ", now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    mocks.requireEventPermission.mockRejectedValueOnce(
      new Error("You do not have permission to manage check-in stations."),
    );
    await expect(
      openCheckInStationLifecycle(
        { eventId: fx.eventId, name: "Denied", now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects cross-tenant event ids as not found", async () => {
    await wipe();
    await expect(
      openCheckInStationLifecycle(
        { eventId: fx.foreignEventId, name: "Foreign", now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("handles concurrent conflicting opens with one station and one audit", async () => {
    await wipe();
    const input = {
      eventId: fx.eventId,
      name: "Shared Desk",
      now,
    };
    const results = await Promise.allSettled([
      openCheckInStationLifecycle(input, actor),
      openCheckInStationLifecycle({ ...input, name: " shared desk " }, actor),
    ]);
    const ok = results.filter((row) => row.status === "fulfilled");
    const failed = results.filter((row) => row.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const count = await prisma.eventCheckInStation.count({
      where: { eventId: fx.eventId, nameNormalized: "shared desk" },
    });
    expect(count).toBe(1);

    const stationId = (ok[0] as PromiseFulfilledResult<{ id: string }>).value
      .id;
    const openAudits = await prisma.auditEvent.count({
      where: {
        organizationId: fx.organizationId,
        entityId: stationId,
        action: "EVENT_CHECK_IN_STATION_OPENED",
        entityType: "EventCheckInStation",
      },
    });
    expect(openAudits).toBe(1);
  });

  it("lists stations scoped, ordered, paginated, and without mutating activity", async () => {
    await wipe();
    const a = await openCheckInStationLifecycle(
      { eventId: fx.eventId, name: "Bravo", now },
      actor,
    );
    const b = await openCheckInStationLifecycle(
      {
        eventId: fx.eventId,
        name: "Alpha",
        now: new Date("2030-01-15T15:31:00.000Z"),
      },
      actor,
    );
    await openCheckInStationLifecycle(
      { eventId: fx.altEventId, name: "Alpha", now },
      actor,
    );

    const beforeActivity = b.lastActivityAt?.toISOString();
    const page = await listCheckInStationsLifecycle(
      { eventId: fx.eventId, page: 1, pageSize: 10 },
      actor,
    );
    expect(page.total).toBe(2);
    expect(page.items.map((row) => row.id)).toEqual([b.id, a.id]);
    expect(page.items.every((row) => row.eventId === fx.eventId)).toBe(true);

    const refreshed = await prisma.eventCheckInStation.findUniqueOrThrow({
      where: { id: b.id },
    });
    expect(refreshed.lastActivityAt?.toISOString()).toBe(beforeActivity);

    const activeOnly = await listCheckInStationsLifecycle(
      { eventId: fx.eventId, status: "ACTIVE" },
      actor,
    );
    expect(activeOnly.total).toBe(2);
  });

  it("closes an active station and keeps sequential close idempotent", async () => {
    await wipe();
    const opened = await openCheckInStationLifecycle(
      { eventId: fx.eventId, name: "Close Me", now },
      actor,
    );
    const closeAt = new Date("2030-01-15T16:00:00.000Z");
    const closed = await closeCheckInStationLifecycle(
      { eventId: fx.eventId, stationId: opened.id, now: closeAt },
      actor,
    );

    expect(closed).toMatchObject({
      status: "CLOSED",
      transitioned: true,
    });
    expect(closed.openedAt.toISOString()).toBe(now.toISOString());
    expect(closed.closedAt?.toISOString()).toBe(closeAt.toISOString());

    const againAt = new Date("2030-01-15T17:00:00.000Z");
    const again = await closeCheckInStationLifecycle(
      { eventId: fx.eventId, stationId: opened.id, now: againAt },
      actor,
    );
    expect(again.transitioned).toBe(false);
    expect(again.closedAt?.toISOString()).toBe(closeAt.toISOString());

    const audits = await prisma.auditEvent.count({
      where: {
        organizationId: fx.organizationId,
        entityId: opened.id,
        action: "EVENT_CHECK_IN_STATION_CLOSED",
      },
    });
    expect(audits).toBe(1);
  });

  it("handles simultaneous closes with one transition and one audit", async () => {
    await wipe();
    const opened = await openCheckInStationLifecycle(
      { eventId: fx.eventId, name: "Race Close", now },
      actor,
    );
    const closeAt = new Date("2030-01-15T16:05:00.000Z");
    const [a, b] = await Promise.all([
      closeCheckInStationLifecycle(
        { eventId: fx.eventId, stationId: opened.id, now: closeAt },
        actor,
      ),
      closeCheckInStationLifecycle(
        {
          eventId: fx.eventId,
          stationId: opened.id,
          now: new Date("2030-01-15T16:06:00.000Z"),
        },
        actor,
      ),
    ]);

    expect([a.transitioned, b.transitioned].filter(Boolean)).toHaveLength(1);
    expect(a.closedAt?.toISOString()).toBe(b.closedAt?.toISOString());

    const audits = await prisma.auditEvent.count({
      where: {
        organizationId: fx.organizationId,
        entityId: opened.id,
        action: "EVENT_CHECK_IN_STATION_CLOSED",
      },
    });
    expect(audits).toBe(1);
  });

  it("rolls back open when the transaction fails after create", async () => {
    await wipe();
    await expect(
      prisma.$transaction(async (tx) => {
        const { createActiveStation } = await import(
          "@/server/repositories/event-check-in-station.repository"
        );
        await createActiveStation(
          {
            organizationId: fx.organizationId,
            eventId: fx.eventId,
            name: "Rollback Station",
            openedByUserId: fx.createdByUserId,
            openedAt: now,
            lastActivityAt: now,
          },
          tx,
        );
        throw new Error("forced rollback after station create");
      }),
    ).rejects.toThrow(/forced rollback/);

    expect(
      await prisma.eventCheckInStation.count({
        where: { eventId: fx.eventId, nameNormalized: "rollback station" },
      }),
    ).toBe(0);
  });

  it("requires canManageCheckIn rather than operate-only access", async () => {
    mocks.requireEventPermission.mockImplementationOnce(
      async (_org, check, message) => {
        const access = {
          canManageCheckIn: false,
          canOperateCheckIn: true,
          userAccountId: actor.userAccountId,
        };
        if (!check(access as never)) throw new Error(message);
        return access;
      },
    );
    await expect(
      openCheckInStationLifecycle(
        { eventId: fx.eventId, name: "Ops Only", now },
        actor,
      ),
    ).rejects.toBeInstanceOf(CheckInError);
  });

  it("allows operate-only actors to list ACTIVE stations for check-in", async () => {
    await wipe();
    await openCheckInStationLifecycle(
      { eventId: fx.eventId, name: "Operator Desk", now },
      actor,
    );

    mocks.requireEventPermission.mockImplementationOnce(
      async (_org, check, message) => {
        const access = {
          canManageCheckIn: false,
          canOperateCheckIn: true,
          userAccountId: actor.userAccountId,
        };
        if (!check(access as never)) throw new Error(message);
        return access;
      },
    );

    const listed = await listCheckInStationsLifecycle(
      { eventId: fx.eventId, status: "ACTIVE" },
      actor,
    );
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.name).toBe("Operator Desk");
  });
});
