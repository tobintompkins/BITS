/**
 * Blueprint 7.3J — check-in station lifecycle service (internal only).
 *
 * Formal open / list / close over the 7.3I foundation.
 * Open/close require canManageCheckIn.
 * ACTIVE-only list also allows canOperateCheckIn (7.3O staff selector).
 * Existing ops open/close paths remain; this service is the blueprint contract.
 */
import { requireEventPermission } from "@/lib/auth/event-permissions";
import {
  EVENT_CHECK_IN_STATION_LIST_DEFAULT_PAGE_SIZE,
  EVENT_CHECK_IN_STATION_LIST_MAX_PAGE_SIZE,
  EVENT_CHECK_IN_STATION_STATUSES,
  type EventCheckInStationStatus,
} from "@/lib/constants/event-check-in-station";
import { CheckInError } from "@/lib/errors/check-in-errors";
import { assertActionAllowed } from "@/lib/security/rate-limit";
import { buildSafeAuditChanges } from "@/lib/validation/event-registration";
import { createActiveStationInputSchema } from "@/lib/validation/event-check-in-station";
import {
  closeStationIfActive,
  createActiveStation,
  listStationsForEvent,
  StationFoundationError,
} from "@/server/repositories/event-check-in-station.repository";
import { prisma } from "@/lib/db/prisma";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type Actor = { userAccountId: string | null; email: string | null };

export type StationLifecycleDto = {
  id: string;
  eventId: string;
  name: string;
  deviceLabel: string | null;
  status: EventCheckInStationStatus;
  openedAt: Date;
  closedAt: Date | null;
  lastActivityAt: Date | null;
  transitioned: boolean;
};

export type StationLifecycleListResult = {
  items: StationLifecycleDto[];
  total: number;
  page: number;
  pageSize: number;
};

function toDto(
  station: {
    id: string;
    eventId: string;
    name: string;
    deviceLabel: string | null;
    status: string;
    openedAt: Date;
    closedAt: Date | null;
    lastActivityAt: Date | null;
  },
  transitioned: boolean,
): StationLifecycleDto {
  if (
    station.status !== "ACTIVE" &&
    station.status !== "CLOSED"
  ) {
    throw new CheckInError("VALIDATION", "Unexpected station status.");
  }
  return {
    id: station.id,
    eventId: station.eventId,
    name: station.name,
    deviceLabel: station.deviceLabel,
    status: station.status,
    openedAt: station.openedAt,
    closedAt: station.closedAt,
    lastActivityAt: station.lastActivityAt,
    transitioned,
  };
}

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new CheckInError("EVENT_NOT_FOUND", "Organization not found.");
  }
  return organization.id;
}

function mapFoundationError(error: unknown): never {
  if (error instanceof StationFoundationError) {
    if (error.code === "DUPLICATE") {
      throw new CheckInError("VALIDATION", error.message);
    }
    if (error.code === "VALIDATION") {
      throw new CheckInError("VALIDATION", error.message);
    }
    throw new CheckInError("NOT_FOUND", error.message);
  }
  throw error;
}

async function requireManageCheckIn(organizationId: string) {
  return requireEventPermission(
    organizationId,
    (access) => access.canManageCheckIn,
    "You do not have permission to manage check-in stations.",
  );
}

/** ACTIVE station lists are usable by check-in operators; broader lists stay manage-only. */
async function requireListStationsAccess(
  organizationId: string,
  status?: EventCheckInStationStatus,
) {
  if (status === "ACTIVE") {
    return requireEventPermission(
      organizationId,
      (access) => access.canOperateCheckIn || access.canManageCheckIn,
      "You do not have permission to list check-in stations.",
    );
  }
  return requireManageCheckIn(organizationId);
}

/**
 * Open one ACTIVE station for an event.
 */
export async function openCheckInStationLifecycle(
  input: {
    eventId: string;
    name: string;
    deviceLabel?: string | null;
    now?: Date;
  },
  actor: Actor,
): Promise<StationLifecycleDto> {
  const organizationId = await getOrganizationId();
  const now = input.now ?? new Date();

  try {
    const access = await requireManageCheckIn(organizationId);
    const openedByUserId = actor.userAccountId ?? access.userAccountId;
    if (!openedByUserId) {
      throw new CheckInError(
        "FORBIDDEN",
        "Sign in is required to open a station.",
      );
    }
    await assertActionAllowed("event.station-open", openedByUserId);

    const parsed = createActiveStationInputSchema.safeParse({
      organizationId,
      eventId: input.eventId,
      name: input.name,
      deviceLabel: input.deviceLabel,
      openedByUserId,
      openedAt: now,
      lastActivityAt: now,
    });
    if (!parsed.success) {
      throw new CheckInError(
        "VALIDATION",
        parsed.error.issues[0]?.message ?? "Invalid station input.",
      );
    }

    return await prisma.$transaction(async (tx) => {
      let station;
      try {
        station = await createActiveStation(
          {
            organizationId,
            eventId: parsed.data.eventId,
            name: parsed.data.name,
            deviceLabel: parsed.data.deviceLabel,
            openedByUserId,
            openedAt: now,
            lastActivityAt: now,
          },
          tx,
        );
      } catch (error) {
        mapFoundationError(error);
      }

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserAccountId: openedByUserId,
          action: "EVENT_CHECK_IN_STATION_OPENED",
          entityType: "EventCheckInStation",
          entityId: station.id,
          changeMetadata: {
            changes: buildSafeAuditChanges({
              eventId: station.eventId,
              stationId: station.id,
              name: station.name,
              status: station.status,
              result: "OPENED",
            }),
          },
        },
      });

      return toDto(station, true);
    });
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof StationFoundationError) mapFoundationError(error);
    if (error instanceof Error && /permission/i.test(error.message)) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}

/**
 * List stations for one tenant-scoped event (read-only; does not touch activity).
 */
export async function listCheckInStationsLifecycle(
  input: {
    eventId: string;
    status?: EventCheckInStationStatus;
    page?: number;
    pageSize?: number;
  },
  actor: Actor,
): Promise<StationLifecycleListResult> {
  const organizationId = await getOrganizationId();

  try {
    if (
      input.status &&
      !(EVENT_CHECK_IN_STATION_STATUSES as readonly string[]).includes(
        input.status,
      )
    ) {
      throw new CheckInError("VALIDATION", "Invalid station status filter.");
    }

    const access = await requireListStationsAccess(
      organizationId,
      input.status,
    );
    await assertActionAllowed(
      "event.station-list",
      actor.userAccountId ?? access.userAccountId,
    );

    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(
      EVENT_CHECK_IN_STATION_LIST_MAX_PAGE_SIZE,
      Math.max(
        1,
        input.pageSize ?? EVENT_CHECK_IN_STATION_LIST_DEFAULT_PAGE_SIZE,
      ),
    );

    const result = await listStationsForEvent(organizationId, input.eventId, {
      status: input.status,
      page,
      pageSize,
    });

    return {
      items: result.items.map((row) => toDto(row, false)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof StationFoundationError) mapFoundationError(error);
    if (error instanceof Error && /permission/i.test(error.message)) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}

/**
 * Close one station (idempotent if already CLOSED).
 */
export async function closeCheckInStationLifecycle(
  input: {
    eventId: string;
    stationId: string;
    now?: Date;
  },
  actor: Actor,
): Promise<StationLifecycleDto> {
  const organizationId = await getOrganizationId();
  const now = input.now ?? new Date();

  try {
    const access = await requireManageCheckIn(organizationId);
    const closedByUserId = actor.userAccountId ?? access.userAccountId;
    if (!closedByUserId) {
      throw new CheckInError(
        "FORBIDDEN",
        "Sign in is required to close a station.",
      );
    }
    await assertActionAllowed("event.station-close", closedByUserId);

    return await prisma.$transaction(async (tx) => {
      let outcome;
      try {
        outcome = await closeStationIfActive(
          {
            organizationId,
            eventId: input.eventId,
            stationId: input.stationId,
            closedByUserId,
            closedAt: now,
          },
          tx,
        );
      } catch (error) {
        mapFoundationError(error);
      }

      if (!outcome.alreadyClosed) {
        await tx.auditEvent.create({
          data: {
            organizationId,
            actorUserAccountId: closedByUserId,
            action: "EVENT_CHECK_IN_STATION_CLOSED",
            entityType: "EventCheckInStation",
            entityId: outcome.station.id,
            changeMetadata: {
              changes: buildSafeAuditChanges({
                eventId: outcome.station.eventId,
                stationId: outcome.station.id,
                name: outcome.station.name,
                status: outcome.station.status,
                result: "CLOSED",
              }),
            },
          },
        });
      }

      return toDto(outcome.station, !outcome.alreadyClosed);
    });
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof StationFoundationError) mapFoundationError(error);
    if (error instanceof Error && /permission/i.test(error.message)) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}
