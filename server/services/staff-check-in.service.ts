/**
 * Blueprint 7.3C — single-attendee staff check-in
 * Blueprint 7.3F — selected-party staff check-in (same transaction helpers)
 * Blueprint 7.3M — optional station attribution on newly effective CHECKED_IN actions
 *
 * Narrower than ops `checkInAttendeeById`:
 * - source always STAFF_SEARCH
 * - optional ACTIVE same-tenant/event station attribution (no UI/API in 7.3M)
 * - no QR or walk-ins
 * - check-out / re-entry live in `staff-check-out.service.ts` (7.3W)
 * - does not mutate registration/attendee rows
 *
 * Lock order (document for deadlock avoidance):
 * 1. Event check-in settings (`FOR UPDATE`)
 * 2. Station row when attributing (`FOR UPDATE`, tenant+event scoped)
 * 3. Attendance row(s) (`FOR UPDATE`, sorted by attendee id for parties)
 */
import type { Prisma } from "@/app/generated/prisma/client";
import { requireEventPermission } from "@/lib/auth/event-permissions";
import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";
import {
  STAFF_CHECK_IN_ELIGIBLE_ATTENDEE_STATUSES,
  STAFF_CHECK_IN_ELIGIBLE_REGISTRATION_STATUSES,
} from "@/lib/constants/staff-check-in";
import { CheckInError } from "@/lib/errors/check-in-errors";
import { sanitizeAttendanceActionMetadata } from "@/lib/events/attendance-action-metadata";
import { assertActionAllowed } from "@/lib/security/rate-limit";
import { buildSafeAuditChanges } from "@/lib/validation/event-registration";
import {
  normalizeStaffPartyAttendeeIds,
  staffPartyCheckInInputSchema,
} from "@/lib/validation/staff-party-check-in";
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

type Actor = { userAccountId: string | null; email: string | null };
type DbClient = Prisma.TransactionClient;

export type StaffCheckInResult = {
  attendanceId: string;
  eventId: string;
  attendeeId: string;
  status: "PRESENT";
  firstCheckedInAt: Date | null;
  lastCheckedInAt: Date | null;
  checkInCount: number;
  alreadyPresent: boolean;
};

export type StaffPartyAttendeeResult = {
  attendeeId: string;
  attendanceId: string;
  status: "PRESENT";
  firstCheckedInAt: Date | null;
  lastCheckedInAt: Date | null;
  checkInCount: number;
  outcome: "CHECKED_IN" | "ALREADY_PRESENT";
};

export type StaffPartyCheckInResult = {
  eventId: string;
  registrationId: string;
  requestedCount: number;
  newlyCheckedInCount: number;
  alreadyPresentCount: number;
  attendees: StaffPartyAttendeeResult[];
};

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

/**
 * Window convention:
 * - open boundary inclusive (`now >= opensAt`)
 * - close boundary exclusive (`now > closesAt` is closed)
 */
export function assertStaffCheckInWindow(
  settings: {
    checkInEnabled: boolean;
    checkInOpensAt: Date | null;
    checkInClosesAt: Date | null;
  },
  now: Date,
) {
  if (!settings.checkInEnabled) {
    throw new CheckInError(
      "CHECK_IN_DISABLED",
      "Check-in is disabled for this event.",
    );
  }
  if (settings.checkInOpensAt && now < settings.checkInOpensAt) {
    throw new CheckInError(
      "CHECK_IN_NOT_OPEN",
      "Check-in has not opened yet.",
    );
  }
  if (settings.checkInClosesAt && now > settings.checkInClosesAt) {
    throw new CheckInError("CHECK_IN_CLOSED", "Check-in has closed.");
  }
}

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new CheckInError("EVENT_NOT_FOUND", "Organization not found.");
  }
  return organization.id;
}

function toSafeResult(
  attendance: {
    id: string;
    eventId: string;
    attendeeId: string | null;
    status: string;
    firstCheckedInAt: Date | null;
    lastCheckedInAt: Date | null;
    checkInCount: number;
  },
  alreadyPresent: boolean,
): StaffCheckInResult {
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
    checkInCount: attendance.checkInCount,
    alreadyPresent,
  };
}

async function loadEligibleAttendee(
  organizationId: string,
  eventId: string,
  attendeeId: string,
  tx: DbClient,
  registrationId?: string,
) {
  const attendee = await tx.eventAttendee.findFirst({
    where: {
      organizationId,
      eventId,
      id: attendeeId,
      ...(registrationId ? { registrationId } : {}),
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

  if (registrationId && attendee.registrationId !== registrationId) {
    throw new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found.");
  }

  if (attendee.status === "CANCELLED" || attendee.registration.status === "CANCELLED") {
    throw new CheckInError(
      "ATTENDEE_CANCELLED",
      "Cancelled attendees cannot check in.",
    );
  }

  if (
    attendee.status === "WAITLISTED" ||
    attendee.registration.status === "WAITLISTED" ||
    attendee.registration.status === "OFFERED"
  ) {
    throw new CheckInError(
      "ATTENDEE_WAITLISTED",
      "Waitlisted attendees cannot check in.",
    );
  }

  if (
    !isEligibleAttendeeStatus(attendee.status) ||
    !isEligibleRegistrationStatus(attendee.registration.status)
  ) {
    throw new CheckInError(
      "REGISTRATION_NOT_ELIGIBLE",
      "Registration is not eligible for check-in.",
    );
  }

  return attendee;
}

type LoadedAttendee = Awaited<ReturnType<typeof loadEligibleAttendee>>;

/**
 * Transaction-bound domain helper shared by 7.3C and 7.3F.
 * Does not open its own transaction and does not write general audit events.
 */
export async function applyStaffAttendeeCheckInInTx(
  input: {
    organizationId: string;
    eventId: string;
    attendee: LoadedAttendee;
    actor: Actor;
    now: Date;
    /** Pre-resolved ACTIVE station id, or null when unattributed. */
    stationId?: string | null;
  },
  tx: DbClient,
): Promise<{ attendance: {
  id: string;
  eventId: string;
  attendeeId: string | null;
  status: string;
  firstCheckedInAt: Date | null;
  lastCheckedInAt: Date | null;
  checkInCount: number;
  stationId: string | null;
}; alreadyPresent: boolean }> {
  const { organizationId, eventId, attendee, actor, now } = input;
  const stationId = input.stationId ?? null;

  await lockAttendanceForEventAttendee(
    organizationId,
    eventId,
    attendee.id,
    tx,
  );

  let attendance = await findAttendanceByEventAttendee(
    organizationId,
    eventId,
    attendee.id,
    tx,
  );

  if (attendance?.status === "PRESENT") {
    return { attendance, alreadyPresent: true };
  }

  if (attendance?.status === "CHECKED_OUT") {
    throw new CheckInError(
      "REENTRY_DISABLED",
      "Re-entry is out of scope for staff check-in foundation.",
    );
  }

  if (attendance?.status === "CANCELLED") {
    throw new CheckInError(
      "ATTENDEE_CANCELLED",
      "Cancelled attendance cannot check in.",
    );
  }

  if (attendance) {
    attendance = await tx.eventAttendanceRecord.update({
      where: { id: attendance.id },
      data: {
        status: "PRESENT",
        source: "STAFF_SEARCH",
        firstCheckedInAt: attendance.firstCheckedInAt ?? now,
        lastCheckedInAt: now,
        checkedOutAt: null,
        checkInCount: 1,
        checkedInByUserId: actor.userAccountId,
        stationId,
      },
    });
  } else {
    try {
      attendance = await tx.eventAttendanceRecord.create({
        data: {
          organizationId,
          eventId,
          registrationId: attendee.registrationId,
          attendeeId: attendee.id,
          memberId: attendee.memberId,
          status: "PRESENT",
          source: "STAFF_SEARCH",
          firstCheckedInAt: now,
          lastCheckedInAt: now,
          checkInCount: 1,
          checkedInByUserId: actor.userAccountId,
          stationId,
        },
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        await lockAttendanceForEventAttendee(
          organizationId,
          eventId,
          attendee.id,
          tx,
        );
        const raced = await findAttendanceByEventAttendee(
          organizationId,
          eventId,
          attendee.id,
          tx,
        );
        if (raced?.status === "PRESENT") {
          return { attendance: raced, alreadyPresent: true };
        }
        throw new CheckInError(
          "VALIDATION",
          "Unable to complete concurrent check-in.",
        );
      }
      throw error;
    }
  }

  await tx.eventAttendanceAction.create({
    data: {
      organizationId,
      eventId,
      attendanceId: attendance.id,
      action: "CHECKED_IN",
      source: "STAFF_SEARCH",
      stationId,
      actorUserId: actor.userAccountId,
      occurredAt: now,
      metadata:
        sanitizeAttendanceActionMetadata({
          note: "staff-check-in",
          from: "EXPECTED",
          to: "PRESENT",
        }) ?? undefined,
    },
  });

  return { attendance, alreadyPresent: false };
}

async function assertEventCheckInReady(
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

/**
 * Resolve an optional attribution station inside the open transaction.
 * Omitted/null preserves prior unattributed behavior.
 */
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

/**
 * Blueprint 7.3C — check in one registered attendee.
 */
export async function staffCheckInRegisteredAttendee(
  input: {
    eventId: string;
    attendeeId: string;
    /** Optional ACTIVE same-tenant/event station; omitted keeps prior behavior. */
    stationId?: string | null;
    operationKey?: string;
    now?: Date;
  },
  actor: Actor,
): Promise<StaffCheckInResult> {
  const organizationId = await getOrganizationId();
  const now = input.now ?? new Date();
  const operationKey = input.operationKey?.trim().slice(0, 120) || undefined;

  try {
    await requireEventPermission(
      organizationId,
      (access) => access.canOperateCheckIn,
      "You do not have permission to check in attendees.",
    );
    await assertActionAllowed("event.staff-checkin", actor.userAccountId);

    const outcome = await prisma.$transaction(async (tx) => {
      await assertEventCheckInReady(organizationId, input.eventId, now, tx);

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
            return { attendance: existing, alreadyPresent: true as const };
          }
        }
      }

      // Lock order: settings → station (optional) → attendance.
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

      const applied = await applyStaffAttendeeCheckInInTx(
        {
          organizationId,
          eventId: input.eventId,
          attendee,
          actor,
          now,
          stationId: station?.id ?? null,
        },
        tx,
      );

      if (!applied.alreadyPresent) {
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
            action: "EVENT_STAFF_ATTENDEE_CHECKED_IN",
            entityType: "EventAttendanceRecord",
            entityId: applied.attendance.id,
            changeMetadata: {
              changes: buildSafeAuditChanges({
                eventId: input.eventId,
                attendeeId: attendee.id,
                attendanceId: applied.attendance.id,
                source: "STAFF_SEARCH",
                result: "PRESENT",
                ...(station ? { stationId: station.id } : {}),
              }),
            },
          },
        });
      }

      if (operationKey && !applied.alreadyPresent) {
        try {
          await tx.eventCheckInIdempotency.create({
            data: {
              organizationId,
              eventId: input.eventId,
              operationKey,
              attendanceId: applied.attendance.id,
              resultSummary: "CHECKED_IN",
            },
          });
        } catch {
          // Concurrent duplicate key — safe within this transaction.
        }
      }

      return applied;
    });

    return toSafeResult(outcome.attendance, outcome.alreadyPresent);
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof Error && error.message.includes("permission")) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}

/**
 * Blueprint 7.3F — check in an explicitly selected subset of one registration.
 * One transaction for the whole selection; unselected party members are untouched.
 */
export async function staffCheckInSelectedParty(
  input: {
    eventId: string;
    registrationId: string;
    attendeeIds: string[];
    /** Optional ACTIVE same-tenant/event station; omitted keeps prior behavior. */
    stationId?: string | null;
    operationKey?: string;
    now?: Date;
  },
  actor: Actor,
): Promise<StaffPartyCheckInResult> {
  const organizationId = await getOrganizationId();
  const now = input.now ?? new Date();

  const normalizedIds = normalizeStaffPartyAttendeeIds(input.attendeeIds);
  const parsed = staffPartyCheckInInputSchema.safeParse({
    eventId: input.eventId,
    registrationId: input.registrationId,
    attendeeIds: normalizedIds,
    operationKey: input.operationKey,
  });
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Invalid party check-in request.";
    throw new CheckInError("VALIDATION", message);
  }
  if (normalizedIds.length > STAFF_PARTY_CHECK_IN_MAX_ATTENDEES) {
    throw new CheckInError(
      "VALIDATION",
      `At most ${STAFF_PARTY_CHECK_IN_MAX_ATTENDEES} attendees can be checked in at once.`,
    );
  }

  const operationKey = parsed.data.operationKey;

  try {
    await requireEventPermission(
      organizationId,
      (access) => access.canOperateCheckIn,
      "You do not have permission to check in attendees.",
    );
    await assertActionAllowed("event.staff-party-checkin", actor.userAccountId);

    return await prisma.$transaction(async (tx) => {
      await assertEventCheckInReady(organizationId, parsed.data.eventId, now, tx);
      const station = await resolveActiveStationForAttribution(
        organizationId,
        parsed.data.eventId,
        input.stationId,
        tx,
      );

      const registration = await tx.eventRegistration.findFirst({
        where: {
          organizationId,
          eventId: parsed.data.eventId,
          id: parsed.data.registrationId,
        },
        select: { id: true, status: true, eventId: true, organizationId: true },
      });
      if (!registration) {
        throw new CheckInError("NOT_FOUND", "Registration not found.");
      }
      if (!isEligibleRegistrationStatus(registration.status)) {
        throw new CheckInError(
          "REGISTRATION_NOT_ELIGIBLE",
          "Registration is not eligible for check-in.",
        );
      }

      // Validate all selected attendees first; any missing / wrong party → reject all.
      const byId = new Map<string, LoadedAttendee>();
      for (const attendeeId of normalizedIds) {
        const attendee = await loadEligibleAttendee(
          organizationId,
          parsed.data.eventId,
          attendeeId,
          tx,
          parsed.data.registrationId,
        );
        byId.set(attendee.id, attendee);
      }

      // Apply transitions in deterministic attendee-ID order to reduce deadlocks.
      const appliedById = new Map<
        string,
        { attendance: Awaited<ReturnType<typeof applyStaffAttendeeCheckInInTx>>["attendance"]; alreadyPresent: boolean }
      >();
      for (const attendeeId of [...normalizedIds].sort()) {
        const attendee = byId.get(attendeeId);
        if (!attendee) {
          throw new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found.");
        }
        const applied = await applyStaffAttendeeCheckInInTx(
          {
            organizationId,
            eventId: parsed.data.eventId,
            attendee,
            actor,
            now,
            stationId: station?.id ?? null,
          },
          tx,
        );
        appliedById.set(attendeeId, applied);
      }

      // Return results in request order.
      const results: StaffPartyAttendeeResult[] = [];
      let newlyCheckedInCount = 0;
      let alreadyPresentCount = 0;
      for (const attendeeId of normalizedIds) {
        const applied = appliedById.get(attendeeId);
        if (!applied) {
          throw new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found.");
        }
        if (applied.alreadyPresent) {
          alreadyPresentCount += 1;
        } else {
          newlyCheckedInCount += 1;
        }
        const safe = toSafeResult(applied.attendance, applied.alreadyPresent);
        results.push({
          attendeeId: safe.attendeeId,
          attendanceId: safe.attendanceId,
          status: "PRESENT",
          firstCheckedInAt: safe.firstCheckedInAt,
          lastCheckedInAt: safe.lastCheckedInAt,
          checkInCount: safe.checkInCount,
          outcome: applied.alreadyPresent ? "ALREADY_PRESENT" : "CHECKED_IN",
        });
      }

      if (newlyCheckedInCount > 0) {
        if (station) {
          await touchStationLastActivity(
            organizationId,
            parsed.data.eventId,
            station.id,
            now,
            tx,
          );
        }
        await tx.auditEvent.create({
          data: {
            organizationId,
            actorUserAccountId: actor.userAccountId,
            action: "EVENT_STAFF_PARTY_CHECKED_IN",
            entityType: "EventRegistration",
            entityId: parsed.data.registrationId,
            changeMetadata: {
              changes: buildSafeAuditChanges({
                eventId: parsed.data.eventId,
                registrationId: parsed.data.registrationId,
                source: "STAFF_SEARCH",
                requestedCount: normalizedIds.length,
                newlyCheckedInCount,
                alreadyPresentCount,
                ...(station ? { stationId: station.id } : {}),
              }),
            },
          },
        });
      }

      if (operationKey && newlyCheckedInCount > 0) {
        try {
          await tx.eventCheckInIdempotency.create({
            data: {
              organizationId,
              eventId: parsed.data.eventId,
              operationKey,
              attendanceId: results[0]?.attendanceId,
              resultSummary: `PARTY:${newlyCheckedInCount}:${alreadyPresentCount}`,
            },
          });
        } catch {
          // Concurrent duplicate key — safe.
        }
      }

      return {
        eventId: parsed.data.eventId,
        registrationId: parsed.data.registrationId,
        requestedCount: normalizedIds.length,
        newlyCheckedInCount,
        alreadyPresentCount,
        attendees: results,
      };
    });
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof Error && error.message.includes("permission")) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}

export type StaffCheckInPartyAttendeeDto = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  attendanceStatus: string;
};

export type StaffCheckInPartyDto = {
  eventId: string;
  registrationId: string;
  confirmationCode: string;
  registrationStatus: string;
  attendees: StaffCheckInPartyAttendeeDto[];
};

/**
 * Blueprint 7.3H — load one registration's attendees for staff party selection.
 * Tenant + event scoped; returns only safe display fields (no contact/notes/PII extras).
 * Reuses existing registration lookup; does not add a broad search API.
 */
export async function getStaffCheckInPartyAttendees(
  eventId: string,
  registrationId: string,
): Promise<StaffCheckInPartyDto> {
  const organizationId = await getOrganizationId();

  try {
    await requireEventPermission(
      organizationId,
      (access) => access.canOperateCheckIn,
      "You do not have permission to check in attendees.",
    );

    const registration = await prisma.eventRegistration.findFirst({
      where: {
        organizationId,
        eventId,
        id: registrationId,
      },
      select: {
        id: true,
        eventId: true,
        confirmationCode: true,
        status: true,
        attendees: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!registration) {
      throw new CheckInError("NOT_FOUND", "Registration not found.");
    }

    const attendanceRows = await prisma.eventAttendanceRecord.findMany({
      where: {
        organizationId,
        eventId,
        attendeeId: { in: registration.attendees.map((row) => row.id) },
      },
      select: { attendeeId: true, status: true },
    });
    const attendanceByAttendee = new Map(
      attendanceRows.map((row) => [row.attendeeId!, row.status]),
    );

    return {
      eventId: registration.eventId,
      registrationId: registration.id,
      confirmationCode: registration.confirmationCode,
      registrationStatus: registration.status,
      attendees: registration.attendees.map((attendee) => ({
        id: attendee.id,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        status: attendee.status,
        attendanceStatus: attendanceByAttendee.get(attendee.id) ?? "EXPECTED",
      })),
    };
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof Error && error.message.includes("permission")) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}
