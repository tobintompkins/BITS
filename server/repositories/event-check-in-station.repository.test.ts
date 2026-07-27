import "dotenv/config";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { EVENT_CHECK_IN_STATION_STATUSES } from "@/lib/constants/event-check-in-station";
import {
  createActiveStation,
  eventCheckInStationFoundationApi,
  findStationByEventId,
  listStationsForEvent,
  lockStationForUpdate,
  StationFoundationError,
} from "@/server/repositories/event-check-in-station.repository";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

async function canReachDatabase() {
  if (!hasDatabaseUrl) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const dbReady = await canReachDatabase();

describe("Blueprint 7.3I station foundation API surface", () => {
  it("exposes only create/read/list/lock helpers (no hard-delete or unscoped find)", () => {
    expect(Object.keys(eventCheckInStationFoundationApi).sort()).toEqual([
      "closeStationIfActive",
      "createActiveStation",
      "findStationByEventId",
      "listStationsForEvent",
      "lockStationForUpdate",
      "touchStationLastActivity",
    ]);
    expect(eventCheckInStationFoundationApi).not.toHaveProperty("deleteStation");
    expect(eventCheckInStationFoundationApi).not.toHaveProperty("findById");
    expect(EVENT_CHECK_IN_STATION_STATUSES).toEqual(["ACTIVE", "CLOSED"]);
  });

  it("does not introduce IP/fingerprint/geolocation/user-agent fields", () => {
    const keys = Object.keys(eventCheckInStationFoundationApi.createActiveStation);
    expect(JSON.stringify(keys)).not.toMatch(
      /ipAddress|fingerprint|geo|userAgent|macAddress/i,
    );
  });
});

describe.runIf(dbReady)("Blueprint 7.3I station foundation (database)", () => {
  let fx: AttendanceFoundationFixture;

  beforeAll(async () => {
    fx = await createAttendanceFoundationFixture();
  });

  afterAll(async () => {
    if (!fx) return;
    await prisma.eventCheckInStation.deleteMany({
      where: { eventId: { in: [fx.eventId, fx.altEventId, fx.foreignEventId] } },
    });
    await fx.cleanup();
    await prisma.$disconnect();
  });

  async function wipeStations() {
    await prisma.eventCheckInStation.deleteMany({
      where: { eventId: { in: [fx.eventId, fx.altEventId, fx.foreignEventId] } },
    });
  }

  it("persists a valid ACTIVE station with safe defaults", async () => {
    await wipeStations();
    const station = await createActiveStation({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      name: " Lobby A ",
      deviceLabel: null,
      openedByUserId: fx.createdByUserId,
    });

    expect(station.status).toBe("ACTIVE");
    expect(station.name).toBe("Lobby A");
    expect(station.nameNormalized).toBe("lobby a");
    expect(station.closedAt).toBeNull();
    expect(station.closedByUserId).toBeNull();
    expect(station.deviceLabel).toBeNull();
    expect(station).not.toHaveProperty("ipAddress");
    expect(station).not.toHaveProperty("userAgent");
  });

  it("rejects blank/overlong names and overlong device labels", async () => {
    await wipeStations();
    await expect(
      createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: "   ",
        openedByUserId: fx.createdByUserId,
      }),
    ).rejects.toBeInstanceOf(StationFoundationError);

    await expect(
      createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: "x".repeat(81),
        openedByUserId: fx.createdByUserId,
      }),
    ).rejects.toBeInstanceOf(StationFoundationError);

    await expect(
      createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: "Door",
        deviceLabel: "d".repeat(81),
        openedByUserId: fx.createdByUserId,
      }),
    ).rejects.toBeInstanceOf(StationFoundationError);
  });

  it("enforces ACTIVE/CLOSED close-field combinations at the database", async () => {
    await wipeStations();
    const station = await createActiveStation({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      name: "Gate 1",
      openedByUserId: fx.createdByUserId,
    });

    await expect(
      prisma.eventCheckInStation.update({
        where: { id: station.id },
        data: { status: "CLOSED" },
      }),
    ).rejects.toThrow();

    await prisma.eventCheckInStation.update({
      where: { id: station.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedByUserId: fx.createdByUserId,
      },
    });

    await expect(
      prisma.eventCheckInStation.update({
        where: { id: station.id },
        data: { status: "ACTIVE", closedAt: null, closedByUserId: null },
      }),
    ).resolves.toBeTruthy();
  });

  it("rejects closedAt or lastActivityAt before openedAt", async () => {
    await wipeStations();
    const openedAt = new Date("2030-01-15T15:00:00.000Z");
    await expect(
      createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        name: "Early Activity",
        openedByUserId: fx.createdByUserId,
        openedAt,
        lastActivityAt: new Date("2030-01-15T14:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const station = await createActiveStation({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      name: "Close Order",
      openedByUserId: fx.createdByUserId,
      openedAt,
    });

    await expect(
      prisma.eventCheckInStation.update({
        where: { id: station.id },
        data: {
          status: "CLOSED",
          closedByUserId: fx.createdByUserId,
          closedAt: new Date("2030-01-15T14:00:00.000Z"),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects cross-tenant event references", async () => {
    await wipeStations();
    await expect(
      createActiveStation({
        organizationId: fx.organizationId,
        eventId: fx.foreignEventId,
        name: "Foreign Event Station",
        openedByUserId: fx.createdByUserId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("enforces active same-event name uniqueness under concurrency", async () => {
    await wipeStations();
    const input = {
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      name: "Shared Name",
      openedByUserId: fx.createdByUserId,
    };

    const results = await Promise.allSettled([
      createActiveStation(input),
      createActiveStation({ ...input, name: " shared name " }),
    ]);

    const fulfilled = results.filter((row) => row.status === "fulfilled");
    const rejected = results.filter((row) => row.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("allows the same name in another event or after close", async () => {
    await wipeStations();
    const first = await createActiveStation({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      name: "Reusable",
      openedByUserId: fx.createdByUserId,
    });

    await createActiveStation({
      organizationId: fx.organizationId,
      eventId: fx.altEventId,
      name: "Reusable",
      openedByUserId: fx.createdByUserId,
    });

    await prisma.eventCheckInStation.update({
      where: { id: first.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedByUserId: fx.createdByUserId,
      },
    });

    await createActiveStation({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      name: "Reusable",
      openedByUserId: fx.createdByUserId,
    });
  });

  it("requires tenant + event scope for reads and lists stably", async () => {
    await wipeStations();
    const alpha = await createActiveStation({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      name: "Bravo",
      openedByUserId: fx.createdByUserId,
    });
    const beta = await createActiveStation({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      name: "Alpha",
      openedByUserId: fx.createdByUserId,
    });

    expect(
      await findStationByEventId(
        fx.organizationId,
        fx.altEventId,
        alpha.id,
      ),
    ).toBeNull();

    expect(
      await findStationByEventId(
        fx.otherOrganizationId,
        fx.eventId,
        alpha.id,
      ),
    ).toBeNull();

    const listed = await listStationsForEvent(fx.organizationId, fx.eventId);
    expect(listed.items.map((row) => row.id)).toEqual([beta.id, alpha.id]);

    await prisma.$transaction(async (tx) => {
      const locked = await lockStationForUpdate(
        fx.organizationId,
        fx.eventId,
        alpha.id,
        tx,
      );
      expect(locked?.id).toBe(alpha.id);
    });
  });

  it("leaves existing attendance rows unchanged when creating stations", async () => {
    await wipeStations();
    const before = await prisma.eventAttendanceRecord.count({
      where: { eventId: fx.eventId },
    });
    await createActiveStation({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      name: "No Side Effects",
      openedByUserId: fx.createdByUserId,
    });
    const after = await prisma.eventAttendanceRecord.count({
      where: { eventId: fx.eventId },
    });
    expect(after).toBe(before);
  });
});
