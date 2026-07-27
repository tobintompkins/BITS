/**
 * Blueprint 7.3I — check-in station data foundation (internal persistence only).
 *
 * Reuses existing `EventCheckInStation` from Blueprint 7.3 ops.
 * Minimal surface for future lifecycle services:
 * - create active station
 * - tenant + event scoped read
 * - stable list
 * - lock for future close/activity updates
 *
 * No unscoped findById. No hard-delete helper. No public open/close service here.
 */
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertStationTimestampInvariants,
  createActiveStationInputSchema,
  toStationNameNormalized,
} from "@/lib/validation/event-check-in-station";

export class StationFoundationError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "VALIDATION"
      | "DUPLICATE"
      | "MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "StationFoundationError";
  }
}

type DbClient = Prisma.TransactionClient | typeof prisma;

async function assertSameTenantEvent(
  organizationId: string,
  eventId: string,
  tx: DbClient = prisma,
) {
  const event = await tx.event.findFirst({
    where: { id: eventId, organizationId },
    select: { id: true },
  });
  if (!event) {
    throw new StationFoundationError("NOT_FOUND", "Event not found.");
  }
  return event;
}

async function assertUserAccountExists(userId: string, tx: DbClient = prisma) {
  const user = await tx.userAccount.findFirst({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    throw new StationFoundationError("NOT_FOUND", "User account not found.");
  }
  return user;
}

/**
 * Persist a new ACTIVE station with null close fields.
 */
export async function createActiveStation(
  input: {
    organizationId: string;
    eventId: string;
    name: string;
    deviceLabel?: string | null;
    openedByUserId: string;
    openedAt?: Date;
    lastActivityAt?: Date | null;
  },
  tx: DbClient = prisma,
) {
  const parsed = createActiveStationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new StationFoundationError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid station input.",
    );
  }

  const openedAt = parsed.data.openedAt ?? new Date();
  const lastActivityAt =
    parsed.data.lastActivityAt === undefined
      ? openedAt
      : parsed.data.lastActivityAt;

  try {
    assertStationTimestampInvariants({ openedAt, lastActivityAt });
  } catch (error) {
    throw new StationFoundationError(
      "VALIDATION",
      error instanceof Error ? error.message : "Invalid station timestamps.",
    );
  }

  await assertSameTenantEvent(
    parsed.data.organizationId,
    parsed.data.eventId,
    tx,
  );
  await assertUserAccountExists(parsed.data.openedByUserId, tx);

  const name = parsed.data.name;
  const nameNormalized = toStationNameNormalized(name);

  try {
    return await tx.eventCheckInStation.create({
      data: {
        organizationId: parsed.data.organizationId,
        eventId: parsed.data.eventId,
        name,
        nameNormalized,
        deviceLabel: parsed.data.deviceLabel,
        openedByUserId: parsed.data.openedByUserId,
        openedAt,
        lastActivityAt,
        status: "ACTIVE",
        closedAt: null,
        closedByUserId: null,
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new StationFoundationError(
        "DUPLICATE",
        "An active station with this name already exists for the event.",
      );
    }
    throw error;
  }
}

/** Tenant + event scoped read. Never unscoped. */
export async function findStationByEventId(
  organizationId: string,
  eventId: string,
  stationId: string,
  tx: DbClient = prisma,
) {
  return tx.eventCheckInStation.findFirst({
    where: { organizationId, eventId, id: stationId },
  });
}

/**
 * List stations for one tenant-scoped event.
 * Order: status, normalized name, openedAt, id.
 */
export async function listStationsForEvent(
  organizationId: string,
  eventId: string,
  options: {
    status?: "ACTIVE" | "CLOSED";
    page?: number;
    pageSize?: number;
  } = {},
  tx: DbClient = prisma,
) {
  await assertSameTenantEvent(organizationId, eventId, tx);
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const where = {
    organizationId,
    eventId,
    ...(options.status ? { status: options.status } : {}),
  };

  const [total, items] = await Promise.all([
    tx.eventCheckInStation.count({ where }),
    tx.eventCheckInStation.findMany({
      where,
      orderBy: [
        { status: "asc" },
        { nameNormalized: "asc" },
        { openedAt: "asc" },
        { id: "asc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items, total, page, pageSize };
}

/** Lock a station row for a future close or activity update. */
export async function lockStationForUpdate(
  organizationId: string,
  eventId: string,
  stationId: string,
  tx: Prisma.TransactionClient,
) {
  await tx.$executeRaw`
    SELECT id FROM event_check_in_stations
    WHERE "organizationId" = ${organizationId}::uuid
      AND "eventId" = ${eventId}::uuid
      AND id = ${stationId}::uuid
    FOR UPDATE
  `;
  return findStationByEventId(organizationId, eventId, stationId, tx);
}

/**
 * Update lastActivityAt after a newly effective attributed check-in.
 * Caller must already hold FOR UPDATE and have verified ACTIVE.
 */
export async function touchStationLastActivity(
  organizationId: string,
  eventId: string,
  stationId: string,
  at: Date,
  tx: Prisma.TransactionClient,
) {
  return tx.eventCheckInStation.updateMany({
    where: {
      id: stationId,
      organizationId,
      eventId,
      status: "ACTIVE",
    },
    data: { lastActivityAt: at },
  });
}

/**
 * Close an ACTIVE station inside an open transaction (after lock).
 * Already-CLOSED is a no-op that preserves original closer/time.
 */
export async function closeStationIfActive(
  input: {
    organizationId: string;
    eventId: string;
    stationId: string;
    closedByUserId: string;
    closedAt: Date;
  },
  tx: Prisma.TransactionClient,
) {
  const locked = await lockStationForUpdate(
    input.organizationId,
    input.eventId,
    input.stationId,
    tx,
  );
  if (!locked) {
    throw new StationFoundationError("NOT_FOUND", "Station not found.");
  }
  if (locked.status === "CLOSED") {
    return { station: locked, alreadyClosed: true as const };
  }

  await assertUserAccountExists(input.closedByUserId, tx);
  assertStationTimestampInvariants({
    openedAt: locked.openedAt,
    closedAt: input.closedAt,
    lastActivityAt: locked.lastActivityAt,
  });

  const station = await tx.eventCheckInStation.update({
    where: { id: locked.id },
    data: {
      status: "CLOSED",
      closedAt: input.closedAt,
      closedByUserId: input.closedByUserId,
    },
  });
  return { station, alreadyClosed: false as const };
}

/** Documented foundation surface — no hard-delete / unscoped helpers. */
export const eventCheckInStationFoundationApi = {
  createActiveStation,
  findStationByEventId,
  listStationsForEvent,
  lockStationForUpdate,
  touchStationLastActivity,
  closeStationIfActive,
} as const;
