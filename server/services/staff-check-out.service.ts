/**
 * Blueprint 7.3W — transaction-safe single-attendee check-out and re-entry.
 *
 * Sibling to `staff-check-in.service.ts` (7.3C/7.3F/7.3M). Does not replace
 * ops `checkOutAttendance` / ops re-entry inside `checkInAttendeeById`.
 *
 * Semantics (documented + tested):
 * - `checkedOutAt` = current/most recent checkout time while status is
 *   `CHECKED_OUT`; cleared to null on effective re-entry (not currently out).
 *   Immutable `EventAttendanceAction` history is authoritative for past exits.
 * - `stationId` on the attendance row = station of the most recent effective
 *   entry (`CHECKED_IN` / `REENTERED`). Check-out does not rewrite it.
 * - `checkInCount`: first check-in sets 1; each effective re-entry +1;
 *   check-out never increments.
 * - `firstCheckedInAt` never changes after first set.
 * - `lastCheckedInAt` updates only on effective re-entry (not on check-out).
 *
 * Lock order (deadlock avoidance; matches 7.3C/7.3M):
 * 1. Event check-in settings (`FOR UPDATE`)
 * 2. Station row when attributing (`FOR UPDATE`)
 * 3. Attendance row (`FOR UPDATE`)
 *
 * No API or UI in this patch.
 */
import type { Prisma } from "@/app/generated/prisma/client";
import { requireEventPermission } from "@/lib/auth/event-permissions";
import {
  STAFF_CHECK_IN_ELIGIBLE_ATTENDEE_STATUSES,
  STAFF_CHECK_IN_ELIGIBLE_REGISTRATION_STATUSES,
} from "@/lib/constants/staff-check-in";
import { CheckInError } from "@/lib/errors/check-in-errors";
import { sanitizeAttendanceActionMetadata } from "@/lib/events/attendance-action-metadata";
import { assertActionAllowed } from "@/lib/security/rate-limit";
import { buildSafeAuditChanges } from "@/lib/validation/event-registration";
import {
  findAttendanceByEventAttendee,
  lockAttendanceForEventAttendee,
} from "@/server/repositories/event-attendance.repository";
import {
  findCheckInSettings,
  lockCheckInSettingsForEvent,
  prisma,
} from "@/server/repositories/event-check-in.repository";
import {
  lockStationForUpdate,
  touchStationLastActivity,
} from "@/server/repositories/event-check-in-station.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { assertStaffCheckInWindow } from "@/server/services/staff-check-in.service";

type Actor = { userAccountId: string | null; email: string | null };
type DbClient = Prisma.TransactionClient;

export type StaffCheckOutResult = {
  attendanceId: string;
  eventId: string;
  attendeeId: string;
  status: "CHECKED_OUT";
  firstCheckedInAt: Date | null;
  lastCheckedInAt: Date | null;
  checkedOutAt: Date | null;
  checkInCount: number;
  outcome: "CHECKED_OUT" | "ALREADY_CHECKED_OUT";
};

export type StaffReentryResult = {
  attendanceId: string;
  eventId: string;
  attendeeId: string;
  status: "PRESENT";
  firstCheckedInAt: Date | null;
  lastCheckedInAt: Date | null;
  checkedOutAt: Date | null;
  checkInCount: number;
  outcome: "REENTERED" | "ALREADY_PRESENT";
};

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new CheckInError("EVENT_NOT_FOUND", "Organization not found.");
  }
  return organization.id;
}

function isEligibleRegistrationStatus(status: string) {
  return (
    STAFF_CHECK_IN_ELIGIBLE_REGISTRATION_STATUSES as readonly string[]
  ).includes(status);
}

function isEligibleAttendeeStatus(status: string) {
  return (
    STAFF_CHECK_IN_ELIGIBLE_ATTENDEE_STATUSES as readonly string[]
  ).includes(status);
}

async function assertEventOperational(
  organizationId: string,
  eventId: string,
  now: Date,
  tx: DbClient,
) {
  await lockCheckInSettingsForEvent(eventId, tx);
  const settings = await findCheckInSettings(organizationId, eventId, tx);
  if (!settings) {
    throw new CheckInError("CHECK_IN_DISABLED", "Check-in is not configured.");
  }
  assertStaffCheckInWindow(settings, now);
  return settings;
}

async function resolveActiveStationForAttribution(
  organizationId: string,
  eventId: string,
  stationId: string | null | undefined,
  tx: DbClient,
) {
  if (stationId == null || stationId === "") return null;

  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(stationId)) {
    throw new CheckInError("VALIDATION", "Station id must be a valid UUID.");
  }

  const locked = await lockStationForUpdate(
    organizationId,
    eventId,
    stationId,
    tx,
  );
  if (!locked) {
    throw new CheckInError("NOT_FOUND", "Check-in station not found.");
  }
  if (locked.status !== "ACTIVE") {
    throw new CheckInError(
      "STATION_CLOSED",
      "This check-in station is closed.",
    );
  }
  return locked;
}

async function loadEligibleAttendee(
  organizationId: string,
  eventId: string,
  attendeeId: string,
  tx: DbClient,
) {
  const attendee = await tx.eventAttendee.findFirst({
    where: {
      organizationId,
      eventId,
      id: attendeeId,
    },
    include: {
      registration: {
        select: {
          id: true,
          organizationId: true,
          eventId: true,
          status: true,
        },
      },
    },
  });

  if (!attendee) {
    throw new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found.");
  }

  if (
    attendee.registration.organizationId !== organizationId ||
    attendee.registration.eventId !== eventId
  ) {
    throw new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found.");
  }

  if (
    attendee.status === "CANCELLED" ||
    attendee.registration.status === "CANCELLED"
  ) {
    throw new CheckInError(
      "ATTENDEE_CANCELLED",
      "Cancelled attendees cannot use check-out or re-entry.",
    );
  }

  if (
    attendee.status === "WAITLISTED" ||
    attendee.registration.status === "WAITLISTED" ||
    attendee.registration.status === "OFFERED"
  ) {
    throw new CheckInError(
      "ATTENDEE_WAITLISTED",
      "Waitlisted attendees cannot use check-out or re-entry.",
    );
  }

  if (
    !isEligibleAttendeeStatus(attendee.status) ||
    !isEligibleRegistrationStatus(attendee.registration.status)
  ) {
    throw new CheckInError(
      "REGISTRATION_NOT_ELIGIBLE",
      "Registration is not eligible for check-out or re-entry.",
    );
  }

  return attendee;
}

function toCheckOutResult(
  attendance: {
    id: string;
    eventId: string;
    attendeeId: string | null;
    status: string;
    firstCheckedInAt: Date | null;
    lastCheckedInAt: Date | null;
    checkedOutAt: Date | null;
    checkInCount: number;
  },
  outcome: StaffCheckOutResult["outcome"],
): StaffCheckOutResult {
  if (!attendance.attendeeId) {
    throw new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found.");
  }
  if (attendance.status !== "CHECKED_OUT") {
    throw new CheckInError("VALIDATION", "Unexpected attendance status.");
  }
  return {
    attendanceId: attendance.id,
    eventId: attendance.eventId,
    attendeeId: attendance.attendeeId,
    status: "CHECKED_OUT",
    firstCheckedInAt: attendance.firstCheckedInAt,
    lastCheckedInAt: attendance.lastCheckedInAt,
    checkedOutAt: attendance.checkedOutAt,
    checkInCount: attendance.checkInCount,
    outcome,
  };
}

function toReentryResult(
  attendance: {
    id: string;
    eventId: string;
    attendeeId: string | null;
    status: string;
    firstCheckedInAt: Date | null;
    lastCheckedInAt: Date | null;
    checkedOutAt: Date | null;
    checkInCount: number;
  },
  outcome: StaffReentryResult["outcome"],
): StaffReentryResult {
  if (!attendance.attendeeId) {
    throw new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found.");
  }
  if (attendance.status !== "PRESENT") {
    throw new CheckInError("VALIDATION", "Unexpected attendance status.");
  }
  return {
    attendanceId: attendance.id,
    eventId: attendance.eventId,
    attendeeId: attendance.attendeeId,
    status: "PRESENT",
    firstCheckedInAt: attendance.firstCheckedInAt,
    lastCheckedInAt: attendance.lastCheckedInAt,
    checkedOutAt: attendance.checkedOutAt,
    checkInCount: attendance.checkInCount,
    outcome,
  };
}

/**
 * Check out one currently `PRESENT` attendee when `allowCheckOut` is enabled.
 */
export async function staffCheckOutRegisteredAttendee(
  input: {
    eventId: string;
    attendeeId: string;
    /** Optional ACTIVE same-tenant/event station for the CHECKED_OUT action. */
    stationId?: string | null;
    operationKey?: string;
    now?: Date;
  },
  actor: Actor,
): Promise<StaffCheckOutResult> {
  const organizationId = await getOrganizationId();
  const now = input.now ?? new Date();
  const operationKey = input.operationKey?.trim().slice(0, 120) || undefined;

  try {
    await requireEventPermission(
      organizationId,
      (access) => access.canOperateCheckIn,
      "You do not have permission to check out attendees.",
    );
    await assertActionAllowed("event.staff-checkout", actor.userAccountId);

    const outcome = await prisma.$transaction(async (tx) => {
      const settings = await assertEventOperational(
        organizationId,
        input.eventId,
        now,
        tx,
      );
      if (!settings.allowCheckOut) {
        throw new CheckInError("CHECK_OUT_DISABLED", "Check-out is disabled.");
      }

      if (operationKey) {
        const prior = await tx.eventCheckInIdempotency.findFirst({
          where: { organizationId, eventId: input.eventId, operationKey },
        });
        if (prior?.attendanceId) {
          const existing = await tx.eventAttendanceRecord.findFirst({
            where: {
              organizationId,
              eventId: input.eventId,
              id: prior.attendanceId,
            },
          });
          if (existing?.status === "CHECKED_OUT" && existing.attendeeId) {
            return {
              attendance: existing,
              outcome: "ALREADY_CHECKED_OUT" as const,
            };
          }
        }
      }

      const station = await resolveActiveStationForAttribution(
        organizationId,
        input.eventId,
        input.stationId,
        tx,
      );

      const attendee = await loadEligibleAttendee(
        organizationId,
        input.eventId,
        input.attendeeId,
        tx,
      );

      await lockAttendanceForEventAttendee(
        organizationId,
        input.eventId,
        attendee.id,
        tx,
      );

      const attendance = await findAttendanceByEventAttendee(
        organizationId,
        input.eventId,
        attendee.id,
        tx,
      );

      if (!attendance) {
        throw new CheckInError(
          "VALIDATION",
          "Only present attendees can check out.",
        );
      }

      if (attendance.status === "CHECKED_OUT") {
        return {
          attendance,
          outcome: "ALREADY_CHECKED_OUT" as const,
        };
      }

      if (attendance.status !== "PRESENT") {
        throw new CheckInError(
          "VALIDATION",
          "Only present attendees can check out.",
        );
      }

      const updated = await tx.eventAttendanceRecord.update({
        where: { id: attendance.id },
        data: {
          status: "CHECKED_OUT",
          checkedOutAt: now,
          checkedOutByUserId: actor.userAccountId,
          // Preserve first/last check-in times, count, and entry station.
        },
      });

      await tx.eventAttendanceAction.create({
        data: {
          organizationId,
          eventId: input.eventId,
          attendanceId: updated.id,
          action: "CHECKED_OUT",
          source: "STAFF_SEARCH",
          stationId: station?.id ?? null,
          actorUserId: actor.userAccountId,
          occurredAt: now,
          metadata:
            sanitizeAttendanceActionMetadata({
              note: "staff-check-out",
              from: "PRESENT",
              to: "CHECKED_OUT",
            }) ?? undefined,
        },
      });

      if (station) {
        await touchStationLastActivity(
          organizationId,
          input.eventId,
          station.id,
          now,
          tx,
        );
      }

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserAccountId: actor.userAccountId,
          action: "EVENT_STAFF_ATTENDEE_CHECKED_OUT",
          entityType: "EventAttendanceRecord",
          entityId: updated.id,
          changeMetadata: {
            changes: buildSafeAuditChanges({
              eventId: input.eventId,
              attendeeId: attendee.id,
              attendanceId: updated.id,
              source: "STAFF_SEARCH",
              result: "CHECKED_OUT",
              checkInCount: updated.checkInCount,
              ...(station ? { stationId: station.id } : {}),
            }),
          },
        },
      });

      if (operationKey) {
        try {
          await tx.eventCheckInIdempotency.create({
            data: {
              organizationId,
              eventId: input.eventId,
              operationKey,
              attendanceId: updated.id,
              resultSummary: "CHECKED_OUT",
            },
          });
        } catch {
          // Concurrent duplicate key — safe within this transaction.
        }
      }

      return { attendance: updated, outcome: "CHECKED_OUT" as const };
    });

    return toCheckOutResult(outcome.attendance, outcome.outcome);
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof Error && error.message.includes("permission")) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}

/**
 * Re-enter one `CHECKED_OUT` attendee when check-out and re-entry are enabled.
 * Prefer dedicated `REENTERED` action (not a second `CHECKED_IN`).
 */
export async function staffReenterRegisteredAttendee(
  input: {
    eventId: string;
    attendeeId: string;
    /** Optional ACTIVE same-tenant/event station for the REENTERED action/entry. */
    stationId?: string | null;
    operationKey?: string;
    now?: Date;
  },
  actor: Actor,
): Promise<StaffReentryResult> {
  const organizationId = await getOrganizationId();
  const now = input.now ?? new Date();
  const operationKey = input.operationKey?.trim().slice(0, 120) || undefined;

  try {
    await requireEventPermission(
      organizationId,
      (access) => access.canOperateCheckIn,
      "You do not have permission to re-enter attendees.",
    );
    await assertActionAllowed("event.staff-reentry", actor.userAccountId);

    const outcome = await prisma.$transaction(async (tx) => {
      const settings = await assertEventOperational(
        organizationId,
        input.eventId,
        now,
        tx,
      );
      if (!settings.allowCheckOut) {
        throw new CheckInError(
          "CHECK_OUT_DISABLED",
          "Check-out must be enabled for re-entry.",
        );
      }
      if (!settings.allowReentry) {
        throw new CheckInError("REENTRY_DISABLED", "Re-entry is disabled.");
      }

      if (operationKey) {
        const prior = await tx.eventCheckInIdempotency.findFirst({
          where: { organizationId, eventId: input.eventId, operationKey },
        });
        if (prior?.attendanceId) {
          const existing = await tx.eventAttendanceRecord.findFirst({
            where: {
              organizationId,
              eventId: input.eventId,
              id: prior.attendanceId,
            },
          });
          if (existing?.status === "PRESENT" && existing.attendeeId) {
            return {
              attendance: existing,
              outcome: "ALREADY_PRESENT" as const,
            };
          }
        }
      }

      const station = await resolveActiveStationForAttribution(
        organizationId,
        input.eventId,
        input.stationId,
        tx,
      );

      const attendee = await loadEligibleAttendee(
        organizationId,
        input.eventId,
        input.attendeeId,
        tx,
      );

      await lockAttendanceForEventAttendee(
        organizationId,
        input.eventId,
        attendee.id,
        tx,
      );

      const attendance = await findAttendanceByEventAttendee(
        organizationId,
        input.eventId,
        attendee.id,
        tx,
      );

      if (!attendance) {
        throw new CheckInError(
          "VALIDATION",
          "Only checked-out attendees can re-enter.",
        );
      }

      if (attendance.status === "PRESENT") {
        return {
          attendance,
          outcome: "ALREADY_PRESENT" as const,
        };
      }

      if (attendance.status !== "CHECKED_OUT") {
        throw new CheckInError(
          "VALIDATION",
          "Only checked-out attendees can re-enter.",
        );
      }

      const entryStationId = station?.id ?? attendance.stationId ?? null;

      const updated = await tx.eventAttendanceRecord.update({
        where: { id: attendance.id },
        data: {
          status: "PRESENT",
          source: "STAFF_SEARCH",
          // Preserve firstCheckedInAt; update last entry time; clear current checkout.
          lastCheckedInAt: now,
          checkedOutAt: null,
          checkInCount: { increment: 1 },
          checkedInByUserId: actor.userAccountId,
          stationId: entryStationId,
        },
      });

      await tx.eventAttendanceAction.create({
        data: {
          organizationId,
          eventId: input.eventId,
          attendanceId: updated.id,
          action: "REENTERED",
          source: "STAFF_SEARCH",
          stationId: station?.id ?? null,
          actorUserId: actor.userAccountId,
          occurredAt: now,
          metadata:
            sanitizeAttendanceActionMetadata({
              note: "staff-reentry",
              from: "CHECKED_OUT",
              to: "PRESENT",
            }) ?? undefined,
        },
      });

      if (station) {
        await touchStationLastActivity(
          organizationId,
          input.eventId,
          station.id,
          now,
          tx,
        );
      }

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserAccountId: actor.userAccountId,
          action: "EVENT_STAFF_ATTENDEE_REENTERED",
          entityType: "EventAttendanceRecord",
          entityId: updated.id,
          changeMetadata: {
            changes: buildSafeAuditChanges({
              eventId: input.eventId,
              attendeeId: attendee.id,
              attendanceId: updated.id,
              source: "STAFF_SEARCH",
              result: "REENTERED",
              checkInCount: updated.checkInCount,
              ...(station ? { stationId: station.id } : {}),
            }),
          },
        },
      });

      if (operationKey) {
        try {
          await tx.eventCheckInIdempotency.create({
            data: {
              organizationId,
              eventId: input.eventId,
              operationKey,
              attendanceId: updated.id,
              resultSummary: "REENTERED",
            },
          });
        } catch {
          // Concurrent duplicate key — safe within this transaction.
        }
      }

      return { attendance: updated, outcome: "REENTERED" as const };
    });

    return toReentryResult(outcome.attendance, outcome.outcome);
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof Error && error.message.includes("permission")) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}
