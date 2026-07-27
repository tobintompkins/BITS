import type {
  EventAttendanceSource,
  EventAttendanceStatus,
  Prisma,
} from "@/app/generated/prisma/client";
import {
  getEventAccess,
  requireEventPermission,
} from "@/lib/auth/event-permissions";
import { ELIGIBLE_REGISTRATION_STATUSES_FOR_CHECK_IN } from "@/lib/constants/event-check-in";
import { CheckInError } from "@/lib/errors/check-in-errors";
import {
  buildQrPassPayload,
  generateQrFallbackCode,
  generateQrPassToken,
  hashQrFallbackCode,
  hashQrPassToken,
  parseQrPassPayload,
} from "@/lib/events/qr-pass-token";
import { assertActionAllowed } from "@/lib/security/rate-limit";
import {
  buildSafeAuditChanges,
  generateCheckInToken,
  generateConfirmationCode,
} from "@/lib/validation/event-registration";
import {
  assertCheckInSettingsInvariants,
  buildCheckInSettingsAuditChanges,
  type CheckInAttendeeInput,
  type CheckInSettingsInput,
  type CorrectAttendanceInput,
  type OpenStationInput,
  type PartyCheckInInput,
  type WalkInInput,
} from "@/lib/validation/event-check-in";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  closeStationRecord,
  findActiveQrPassByFallback,
  findActiveQrPassByHash,
  findActiveStation,
  findAttendanceById,
  findCheckInSettings,
  findEventForCheckIn,
  getAttendanceSummaryCounts,
  listAttendanceRecords,
  listStations,
  lockCheckInSettingsForEvent,
  openStationRecord,
  prisma,
  searchEligibleAttendees,
  upsertCheckInSettings,
} from "@/server/repositories/event-check-in.repository";
import {
  countCapacityUsed,
  createMemberAttendanceForCheckIn,
  lockRegistrationSettingsForEvent,
} from "@/server/repositories/event-registration.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type Actor = { userAccountId: string | null; email: string | null };

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) throw new CheckInError("EVENT_NOT_FOUND", "Organization not found.");
  return organization.id;
}

async function audit(
  organizationId: string,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  changes: Array<{ field: string; oldValue: string | null; newValue: string | null }>,
) {
  await createAuditEvent({
    organizationId,
    actorUserAccountId: actor.userAccountId,
    action,
    entityType,
    entityId,
    changes:
      changes.length > 0
        ? changes
        : [{ field: "actorEmail", oldValue: null, newValue: actor.email }],
  });
}

function parseOptionalDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assertCheckInWindow(settings: {
  checkInEnabled: boolean;
  checkInOpensAt: Date | null;
  checkInClosesAt: Date | null;
}) {
  if (!settings.checkInEnabled) {
    throw new CheckInError("CHECK_IN_DISABLED", "Check-in is disabled for this event.");
  }
  const now = new Date();
  if (settings.checkInOpensAt && now < settings.checkInOpensAt) {
    throw new CheckInError("CHECK_IN_NOT_OPEN", "Check-in has not opened yet.");
  }
  if (settings.checkInClosesAt && now > settings.checkInClosesAt) {
    throw new CheckInError("CHECK_IN_CLOSED", "Check-in has closed.");
  }
}

function isEligibleRegistrationStatus(status: string) {
  return (ELIGIBLE_REGISTRATION_STATUSES_FOR_CHECK_IN as readonly string[]).includes(
    status,
  );
}

export async function getOrCreateCheckInSettings(eventId: string) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canReadCheckIn || a.canManageCheckIn || a.canView,
    "You do not have permission to view check-in settings.",
  );

  const existing = await findCheckInSettings(organizationId, eventId);
  if (existing) return existing;

  const event = await findEventForCheckIn(organizationId, eventId);
  if (!event) throw new CheckInError("EVENT_NOT_FOUND", "Event not found.");

  return upsertCheckInSettings(organizationId, eventId, {
    checkInEnabled: false,
    checkInOpensAt: null,
    checkInClosesAt: null,
    allowSelfCheckIn: false,
    allowWalkIns: false,
    allowCheckOut: false,
    allowReentry: false,
    requireRegistration: true,
    qrPassEnabled: true,
    stationNameRequired: false,
  });
}

export async function updateCheckInSettings(
  input: CheckInSettingsInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageCheckIn,
    "You do not have permission to manage check-in settings.",
  );

  const event = await findEventForCheckIn(organizationId, input.eventId);
  if (!event) throw new CheckInError("EVENT_NOT_FOUND", "Event not found.");

  const proposed = {
    checkInEnabled: input.checkInEnabled,
    checkInOpensAt: parseOptionalDate(input.checkInOpensAt),
    checkInClosesAt: parseOptionalDate(input.checkInClosesAt),
    allowSelfCheckIn: input.allowSelfCheckIn,
    allowWalkIns: input.allowWalkIns,
    allowCheckOut: input.allowCheckOut,
    allowReentry: input.allowReentry,
    requireRegistration: input.requireRegistration,
    qrPassEnabled: input.qrPassEnabled,
    stationNameRequired: input.stationNameRequired,
  };

  try {
    assertCheckInSettingsInvariants(proposed);
  } catch (error) {
    throw new CheckInError(
      "VALIDATION",
      error instanceof Error ? error.message : "Invalid check-in settings.",
    );
  }

  const before = await findCheckInSettings(organizationId, input.eventId);
  const settings = await upsertCheckInSettings(organizationId, input.eventId, proposed);

  // Keep 7.2 registration settings flags loosely in sync for legacy UI
  await prisma.eventRegistrationSettings.updateMany({
    where: { organizationId, eventId: input.eventId },
    data: {
      checkInEnabled: settings.checkInEnabled,
      qrCheckInEnabled: settings.qrPassEnabled && settings.checkInEnabled,
    },
  });

  const auditChanges = buildCheckInSettingsAuditChanges(
    before
      ? {
          checkInEnabled: before.checkInEnabled,
          checkInOpensAt: before.checkInOpensAt?.toISOString() ?? null,
          checkInClosesAt: before.checkInClosesAt?.toISOString() ?? null,
          allowSelfCheckIn: before.allowSelfCheckIn,
          allowWalkIns: before.allowWalkIns,
          allowCheckOut: before.allowCheckOut,
          allowReentry: before.allowReentry,
          requireRegistration: before.requireRegistration,
          qrPassEnabled: before.qrPassEnabled,
          stationNameRequired: before.stationNameRequired,
        }
      : null,
    {
      checkInEnabled: settings.checkInEnabled,
      checkInOpensAt: settings.checkInOpensAt?.toISOString() ?? null,
      checkInClosesAt: settings.checkInClosesAt?.toISOString() ?? null,
      allowSelfCheckIn: settings.allowSelfCheckIn,
      allowWalkIns: settings.allowWalkIns,
      allowCheckOut: settings.allowCheckOut,
      allowReentry: settings.allowReentry,
      requireRegistration: settings.requireRegistration,
      qrPassEnabled: settings.qrPassEnabled,
      stationNameRequired: settings.stationNameRequired,
    },
  );

  // Only audit material changes; rejected updates never reach here.
  if (auditChanges.length > 0) {
    await audit(
      organizationId,
      actor,
      "EVENT_CHECK_IN_SETTINGS_UPDATED",
      "EventCheckInSettings",
      settings.id,
      auditChanges,
    );
  }

  return settings;
}

/** Safe DTO for Blueprint 7.3A settings read — no operational secrets. */
export async function getCheckInSettingsDto(eventId: string) {
  const settings = await getOrCreateCheckInSettings(eventId);
  const organizationId = await getOrganizationId();
  const event = await findEventForCheckIn(organizationId, eventId);
  if (!event) throw new CheckInError("EVENT_NOT_FOUND", "Event not found.");

  return {
    event: {
      id: event.id,
      title: event.title,
      timezone: event.timezone,
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
    },
    settings: {
      checkInEnabled: settings.checkInEnabled,
      checkInOpensAt: settings.checkInOpensAt,
      checkInClosesAt: settings.checkInClosesAt,
      allowSelfCheckIn: settings.allowSelfCheckIn,
      allowWalkIns: settings.allowWalkIns,
      allowCheckOut: settings.allowCheckOut,
      allowReentry: settings.allowReentry,
      requireRegistration: settings.requireRegistration,
      qrPassEnabled: settings.qrPassEnabled,
      stationNameRequired: settings.stationNameRequired,
    },
  };
}

export async function openCheckInStation(input: OpenStationInput, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canManageCheckIn || a.canOperateCheckIn,
    "You do not have permission to open a check-in station.",
  );
  if (!actor.userAccountId && !access.userAccountId) {
    throw new CheckInError("FORBIDDEN", "Sign in is required to open a station.");
  }

  const settings = await getOrCreateCheckInSettings(input.eventId);
  assertCheckInWindow(settings);

  const station = await openStationRecord({
    organizationId,
    eventId: input.eventId,
    name: input.name,
    deviceLabel: input.deviceLabel,
    openedByUserId: actor.userAccountId ?? access.userAccountId!,
  });

  await audit(
    organizationId,
    actor,
    "EVENT_CHECK_IN_STATION_OPENED",
    "EventCheckInStation",
    station.id,
    buildSafeAuditChanges({ name: station.name, eventId: input.eventId }),
  );

  return station;
}

export async function closeCheckInStation(stationId: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canManageCheckIn || a.canOperateCheckIn,
    "You do not have permission to close a check-in station.",
  );

  const station = await prisma.eventCheckInStation.findFirst({
    where: { organizationId, id: stationId },
  });
  if (!station) throw new CheckInError("NOT_FOUND", "Station not found.");

  await closeStationRecord(
    organizationId,
    stationId,
    actor.userAccountId ?? access.userAccountId!,
  );

  await audit(
    organizationId,
    actor,
    "EVENT_CHECK_IN_STATION_CLOSED",
    "EventCheckInStation",
    stationId,
    buildSafeAuditChanges({ name: station.name }),
  );

  return { id: stationId, status: "CLOSED" as const };
}

export async function getCheckInStations(eventId: string) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canReadCheckIn || a.canOperateCheckIn,
    "You do not have permission to view check-in stations.",
  );
  return listStations(organizationId, eventId);
}

export async function getLiveAttendanceSummary(eventId: string) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canReadCheckIn || a.canOperateCheckIn || a.canView,
    "You do not have permission to view attendance totals.",
  );
  return getAttendanceSummaryCounts(organizationId, eventId);
}

export async function searchCheckInAttendees(
  eventId: string,
  query: string,
  page = 1,
  pageSize = 25,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canOperateCheckIn || a.canReadCheckIn,
    "You do not have permission to search check-in attendees.",
  );
  return searchEligibleAttendees(organizationId, eventId, query, page, pageSize);
}

export async function listEventAttendance(
  eventId: string,
  options: {
    status?: EventAttendanceStatus;
    source?: EventAttendanceSource;
    query?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canReadCheckIn || a.canOperateCheckIn,
    "You do not have permission to list attendance.",
  );
  return listAttendanceRecords(organizationId, eventId, {
    status: options.status,
    source: options.source,
    query: options.query,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 25,
  });
}

async function ensureStationActive(
  organizationId: string,
  eventId: string,
  stationId: string | undefined,
  settings: { stationNameRequired: boolean },
  tx: Prisma.TransactionClient,
) {
  if (!stationId) {
    if (settings.stationNameRequired) {
      throw new CheckInError("STATION_CLOSED", "An active station is required.");
    }
    return null;
  }
  const station = await findActiveStation(organizationId, eventId, stationId, tx);
  if (!station || station.status !== "ACTIVE") {
    throw new CheckInError("STATION_CLOSED", "This check-in station is closed.");
  }
  return station;
}

async function recordIdempotency(
  organizationId: string,
  eventId: string,
  operationKey: string | undefined,
  attendanceId: string,
  summary: string,
  tx: Prisma.TransactionClient,
) {
  if (!operationKey) return null;
  try {
    return await tx.eventCheckInIdempotency.create({
      data: {
        organizationId,
        eventId,
        operationKey: operationKey.slice(0, 120),
        attendanceId,
        resultSummary: summary,
      },
    });
  } catch {
    const existing = await tx.eventCheckInIdempotency.findFirst({
      where: { organizationId, eventId, operationKey: operationKey.slice(0, 120) },
    });
    return existing;
  }
}

export async function checkInAttendeeById(
  input: CheckInAttendeeInput,
  actor: Actor,
  options?: { skipPermission?: boolean; isSelf?: boolean },
) {
  const organizationId = await getOrganizationId();
  if (!options?.skipPermission) {
    await requireEventPermission(
      organizationId,
      (a) => a.canOperateCheckIn,
      "You do not have permission to check in attendees.",
    );
  }

  await assertActionAllowed("event.checkin", actor.userAccountId);

  const result = await prisma.$transaction(async (tx) => {
    await lockCheckInSettingsForEvent(input.eventId, tx);
    const settings = await findCheckInSettings(organizationId, input.eventId, tx);
    if (!settings) {
      throw new CheckInError("CHECK_IN_DISABLED", "Check-in is not configured.");
    }
    assertCheckInWindow(settings);
    if (options?.isSelf && !settings.allowSelfCheckIn) {
      throw new CheckInError("FORBIDDEN", "Self check-in is disabled.");
    }

    const station = await ensureStationActive(
      organizationId,
      input.eventId,
      input.stationId,
      settings,
      tx,
    );

    if (input.operationKey) {
      const prior = await tx.eventCheckInIdempotency.findFirst({
        where: {
          organizationId,
          eventId: input.eventId,
          operationKey: input.operationKey.slice(0, 120),
        },
      });
      if (prior?.attendanceId) {
        const existing = await findAttendanceById(
          organizationId,
          prior.attendanceId,
          tx,
        );
        if (existing) {
          return { attendance: existing, alreadyPresent: true as const };
        }
      }
    }

    const attendee = await tx.eventAttendee.findFirst({
      where: {
        organizationId,
        eventId: input.eventId,
        id: input.attendeeId,
      },
      include: { registration: true },
    });
    if (!attendee) {
      throw new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found.");
    }
    if (attendee.status === "CANCELLED" || attendee.registration.status === "CANCELLED") {
      throw new CheckInError("ATTENDEE_CANCELLED", "Cancelled attendees cannot check in.");
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
    if (!isEligibleRegistrationStatus(attendee.registration.status)) {
      throw new CheckInError(
        "REGISTRATION_NOT_ELIGIBLE",
        "Registration is not eligible for check-in.",
      );
    }

    const now = new Date();
    const source = (input.source ?? "STAFF_SEARCH") as EventAttendanceSource;
    let attendance = await tx.eventAttendanceRecord.findFirst({
      where: {
        organizationId,
        eventId: input.eventId,
        attendeeId: attendee.id,
      },
    });

    if (attendance?.status === "PRESENT") {
      return {
        attendance: await findAttendanceById(organizationId, attendance.id, tx),
        alreadyPresent: true as const,
      };
    }

    if (attendance?.status === "CHECKED_OUT") {
      if (!settings.allowReentry) {
        throw new CheckInError("REENTRY_DISABLED", "Re-entry is disabled.");
      }
      attendance = await tx.eventAttendanceRecord.update({
        where: { id: attendance.id },
        data: {
          status: "PRESENT",
          source,
          lastCheckedInAt: now,
          checkedOutAt: null,
          checkInCount: { increment: 1 },
          stationId: station?.id ?? attendance.stationId,
          checkedInByUserId: actor.userAccountId,
        },
      });
      await tx.eventAttendanceAction.create({
        data: {
          organizationId,
          eventId: input.eventId,
          attendanceId: attendance.id,
          action: "REENTERED",
          source,
          stationId: station?.id ?? null,
          actorUserId: actor.userAccountId,
          occurredAt: now,
        },
      });
    } else if (attendance) {
      attendance = await tx.eventAttendanceRecord.update({
        where: { id: attendance.id },
        data: {
          status: "PRESENT",
          source,
          firstCheckedInAt: attendance.firstCheckedInAt ?? now,
          lastCheckedInAt: now,
          checkedOutAt: null,
          checkInCount: Math.max(1, attendance.checkInCount + 1),
          stationId: station?.id ?? null,
          checkedInByUserId: actor.userAccountId,
        },
      });
      await tx.eventAttendanceAction.create({
        data: {
          organizationId,
          eventId: input.eventId,
          attendanceId: attendance.id,
          action: "CHECKED_IN",
          source,
          stationId: station?.id ?? null,
          actorUserId: actor.userAccountId,
          occurredAt: now,
        },
      });
    } else {
      attendance = await tx.eventAttendanceRecord.create({
        data: {
          organizationId,
          eventId: input.eventId,
          registrationId: attendee.registrationId,
          attendeeId: attendee.id,
          memberId: attendee.memberId,
          status: "PRESENT",
          source,
          firstCheckedInAt: now,
          lastCheckedInAt: now,
          checkInCount: 1,
          stationId: station?.id ?? null,
          checkedInByUserId: actor.userAccountId,
        },
      });
      await tx.eventAttendanceAction.create({
        data: {
          organizationId,
          eventId: input.eventId,
          attendanceId: attendance.id,
          action: "CHECKED_IN",
          source,
          stationId: station?.id ?? null,
          actorUserId: actor.userAccountId,
          occurredAt: now,
        },
      });
    }

    await tx.eventAttendee.update({
      where: { id: attendee.id },
      data: {
        status: "CHECKED_IN",
        checkedInAt: now,
        checkedInByUserId: actor.userAccountId,
      },
    });

    if (station) {
      await tx.eventCheckInStation.update({
        where: { id: station.id },
        data: { lastActivityAt: now },
      });
    }

    await recordIdempotency(
      organizationId,
      input.eventId,
      input.operationKey,
      attendance.id,
      "CHECKED_IN",
      tx,
    );

    return {
      attendance: await findAttendanceById(organizationId, attendance.id, tx),
      alreadyPresent: false as const,
      attendee,
    };
  });

  if (!result.alreadyPresent && result.attendee?.memberId) {
    const event = await findEventForCheckIn(organizationId, input.eventId);
    if (event) {
      const attendanceDate = new Date(event.startDateTime);
      attendanceDate.setUTCHours(0, 0, 0, 0);
      await createMemberAttendanceForCheckIn({
        organizationId,
        memberId: result.attendee.memberId,
        eventId: input.eventId,
        serviceName: event.title,
        attendanceDate,
        checkedInByUserId: actor.userAccountId,
      }).catch(() => null);
    }
  }

  if (!result.alreadyPresent) {
    await audit(
      organizationId,
      actor,
      "EVENT_ATTENDEE_CHECKED_IN",
      "EventAttendanceRecord",
      result.attendance!.id,
      buildSafeAuditChanges({
        attendeeId: input.attendeeId,
        eventId: input.eventId,
        source: input.source ?? "STAFF_SEARCH",
      }),
    );
  }

  return {
    attendance: result.attendance!,
    alreadyPresent: result.alreadyPresent,
  };
}

export async function checkInParty(input: PartyCheckInInput, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canOperateCheckIn,
    "You do not have permission to check in parties.",
  );

  const results = [];
  for (const attendeeId of input.attendeeIds) {
    const outcome = await checkInAttendeeById(
      {
        eventId: input.eventId,
        attendeeId,
        stationId: input.stationId,
        source: "STAFF_SEARCH",
        operationKey: input.operationKey
          ? `${input.operationKey}:${attendeeId}`
          : undefined,
      },
      actor,
      { skipPermission: true },
    );
    results.push({ attendeeId, ...outcome });
  }

  await audit(
    organizationId,
    actor,
    "EVENT_PARTY_CHECKED_IN",
    "EventRegistration",
    input.registrationId,
    buildSafeAuditChanges({
      eventId: input.eventId,
      attendeeCount: input.attendeeIds.length,
    }),
  );

  return results;
}

export async function checkOutAttendance(
  eventId: string,
  attendanceId: string,
  actor: Actor,
  options?: { stationId?: string; operationKey?: string },
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canOperateCheckIn,
    "You do not have permission to check out attendees.",
  );

  const result = await prisma.$transaction(async (tx) => {
    await lockCheckInSettingsForEvent(eventId, tx);
    const settings = await findCheckInSettings(organizationId, eventId, tx);
    if (!settings) throw new CheckInError("CHECK_IN_DISABLED", "Check-in not configured.");
    if (!settings.allowCheckOut) {
      throw new CheckInError("CHECK_OUT_DISABLED", "Check-out is disabled.");
    }
    await ensureStationActive(
      organizationId,
      eventId,
      options?.stationId,
      settings,
      tx,
    );

    const attendance = await findAttendanceById(organizationId, attendanceId, tx);
    if (!attendance || attendance.eventId !== eventId) {
      throw new CheckInError("NOT_FOUND", "Attendance record not found.");
    }
    if (attendance.status === "CHECKED_OUT") {
      return { attendance, alreadyCheckedOut: true as const };
    }
    if (attendance.status !== "PRESENT") {
      throw new CheckInError("VALIDATION", "Only present attendees can check out.");
    }

    const now = new Date();
    const updated = await tx.eventAttendanceRecord.update({
      where: { id: attendance.id },
      data: {
        status: "CHECKED_OUT",
        checkedOutAt: now,
        checkedOutByUserId: actor.userAccountId,
      },
    });
    await tx.eventAttendanceAction.create({
      data: {
        organizationId,
        eventId,
        attendanceId: attendance.id,
        action: "CHECKED_OUT",
        source: "STAFF_SEARCH",
        stationId: options?.stationId ?? null,
        actorUserId: actor.userAccountId,
        occurredAt: now,
      },
    });
    await recordIdempotency(
      organizationId,
      eventId,
      options?.operationKey,
      attendance.id,
      "CHECKED_OUT",
      tx,
    );
    return {
      attendance: await findAttendanceById(organizationId, updated.id, tx),
      alreadyCheckedOut: false as const,
    };
  });

  if (!result.alreadyCheckedOut) {
    await audit(
      organizationId,
      actor,
      "EVENT_ATTENDEE_CHECKED_OUT",
      "EventAttendanceRecord",
      attendanceId,
      buildSafeAuditChanges({ eventId }),
    );
  }

  return result;
}

export async function createWalkInAndCheckIn(input: WalkInInput, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canCreateWalkIn,
    "You do not have permission to create walk-ins.",
  );

  const outcome = await prisma.$transaction(async (tx) => {
    await lockCheckInSettingsForEvent(input.eventId, tx);
    const settings = await findCheckInSettings(organizationId, input.eventId, tx);
    if (!settings) throw new CheckInError("CHECK_IN_DISABLED", "Check-in not configured.");
    assertCheckInWindow(settings);
    if (!settings.allowWalkIns) {
      throw new CheckInError("WALK_INS_DISABLED", "Walk-ins are disabled.");
    }
    if (settings.requireRegistration) {
      throw new CheckInError(
        "REGISTRATION_REQUIRED",
        "This event requires a prior registration.",
      );
    }

    const station = await ensureStationActive(
      organizationId,
      input.eventId,
      input.stationId,
      settings,
      tx,
    );

    await lockRegistrationSettingsForEvent(input.eventId, tx);
    const regSettings = await tx.eventRegistrationSettings.findFirst({
      where: { organizationId, eventId: input.eventId },
    });
    const used = await countCapacityUsed(organizationId, input.eventId, tx);
    if (regSettings?.capacity != null && used + 1 > regSettings.capacity) {
      throw new CheckInError(
        "CAPACITY_UNAVAILABLE",
        "Event is at capacity; walk-in rejected.",
      );
    }

    const code = generateConfirmationCode();
    const registration = await tx.eventRegistration.create({
      data: {
        organizationId,
        eventId: input.eventId,
        status: "CONFIRMED",
        source: "STAFF",
        confirmationCode: code,
        memberId: input.memberId ?? null,
        registeredByUserId: actor.userAccountId,
        primaryContactName: `${input.firstName} ${input.lastName}`.trim(),
        primaryContactEmail: input.email?.toLowerCase() ?? null,
        primaryContactPhone: input.phone ?? null,
        notes: input.notes ?? null,
        partySize: 1,
        confirmedAt: new Date(),
      },
    });

    const attendee = await tx.eventAttendee.create({
      data: {
        organizationId,
        eventId: input.eventId,
        registrationId: registration.id,
        status: "CONFIRMED",
        attendeeType: input.memberId ? "MEMBER" : "GUEST",
        memberId: input.memberId ?? null,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email?.toLowerCase() ?? null,
        phone: input.phone ?? null,
        isGuest: !input.memberId,
        checkInToken: generateCheckInToken(),
      },
    });

    const now = new Date();
    const attendance = await tx.eventAttendanceRecord.create({
      data: {
        organizationId,
        eventId: input.eventId,
        registrationId: registration.id,
        attendeeId: attendee.id,
        memberId: input.memberId ?? null,
        status: "PRESENT",
        source: "WALK_IN",
        firstCheckedInAt: now,
        lastCheckedInAt: now,
        checkInCount: 1,
        stationId: station?.id ?? null,
        checkedInByUserId: actor.userAccountId,
        walkInFirstName: input.firstName,
        walkInLastName: input.lastName,
        walkInEmail: input.email?.toLowerCase() ?? null,
        walkInPhone: input.phone ?? null,
        notes: input.notes ?? null,
      },
    });
    await tx.eventAttendanceAction.create({
      data: {
        organizationId,
        eventId: input.eventId,
        attendanceId: attendance.id,
        action: "CHECKED_IN",
        source: "WALK_IN",
        stationId: station?.id ?? null,
        actorUserId: actor.userAccountId,
        occurredAt: now,
      },
    });
    await tx.eventAttendee.update({
      where: { id: attendee.id },
      data: {
        status: "CHECKED_IN",
        checkedInAt: now,
        checkedInByUserId: actor.userAccountId,
      },
    });

    return { registration, attendee, attendance };
  });

  await audit(
    organizationId,
    actor,
    "EVENT_WALK_IN_CREATED",
    "EventAttendanceRecord",
    outcome.attendance.id,
    buildSafeAuditChanges({
      eventId: input.eventId,
      confirmationCode: outcome.registration.confirmationCode,
    }),
  );

  return outcome;
}

export async function correctAttendance(
  input: CorrectAttendanceInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canCorrectAttendance,
    "You do not have permission to correct attendance.",
  );
  if (!input.reason.trim()) {
    throw new CheckInError(
      "CORRECTION_REASON_REQUIRED",
      "A reason is required for corrections.",
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const attendance = await findAttendanceById(
      organizationId,
      input.attendanceId,
      tx,
    );
    if (!attendance || attendance.eventId !== input.eventId) {
      throw new CheckInError("NOT_FOUND", "Attendance record not found.");
    }

    const now = new Date();
    const next = await tx.eventAttendanceRecord.update({
      where: { id: attendance.id },
      data: {
        status: input.status,
        source: "ADMIN_CORRECTION",
        ...(input.status === "PRESENT"
          ? {
              lastCheckedInAt: now,
              firstCheckedInAt: attendance.firstCheckedInAt ?? now,
              checkedOutAt: null,
            }
          : {}),
        ...(input.status === "CHECKED_OUT" ? { checkedOutAt: now } : {}),
        ...(input.status === "EXPECTED" || input.status === "NO_SHOW"
          ? { checkedOutAt: null }
          : {}),
      },
    });

    const actionType =
      input.status === "PRESENT" && attendance.status === "PRESENT"
        ? "STATUS_CORRECTED"
        : input.status === "NO_SHOW"
          ? "MARKED_NO_SHOW"
          : input.status === "EXPECTED"
            ? "UNDO_CHECK_IN"
            : "STATUS_CORRECTED";

    await tx.eventAttendanceAction.create({
      data: {
        organizationId,
        eventId: input.eventId,
        attendanceId: attendance.id,
        action: actionType,
        source: "ADMIN_CORRECTION",
        actorUserId: actor.userAccountId,
        occurredAt: now,
        reason: input.reason,
        metadata: {
          from: attendance.status,
          to: input.status,
        },
      },
    });

    return next;
  });

  await audit(
    organizationId,
    actor,
    "EVENT_ATTENDANCE_CORRECTED",
    "EventAttendanceRecord",
    updated.id,
    buildSafeAuditChanges({
      status: input.status,
      reason: input.reason,
    }),
  );

  return updated;
}

export async function finalizeNoShows(eventId: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canCorrectAttendance || a.canManageCheckIn,
    "You do not have permission to finalize no-shows.",
  );

  const settings = await findCheckInSettings(organizationId, eventId);
  if (!settings) throw new CheckInError("CHECK_IN_DISABLED", "Check-in not configured.");
  const now = new Date();
  if (settings.checkInClosesAt && now < settings.checkInClosesAt) {
    throw new CheckInError(
      "CHECK_IN_NOT_OPEN",
      "No-show finalization cannot run before check-in closes.",
    );
  }
  if (!settings.checkInClosesAt) {
    const event = await findEventForCheckIn(organizationId, eventId);
    if (event && now < event.endDateTime) {
      throw new CheckInError(
        "CHECK_IN_NOT_OPEN",
        "No-show finalization cannot run before the event ends when no close time is set.",
      );
    }
  }

  const eligible = await prisma.eventAttendee.findMany({
    where: {
      organizationId,
      eventId,
      status: { notIn: ["CANCELLED", "WAITLISTED", "CHECKED_IN"] },
      registration: { status: { in: ["PENDING", "CONFIRMED"] } },
      OR: [
        { attendanceRecords: { none: { eventId } } },
        {
          attendanceRecords: {
            some: { eventId, status: "EXPECTED" },
          },
        },
      ],
    },
    select: { id: true, registrationId: true, memberId: true },
  });

  let marked = 0;
  for (const attendee of eligible) {
    await prisma.$transaction(async (tx) => {
      let attendance = await tx.eventAttendanceRecord.findFirst({
        where: { organizationId, eventId, attendeeId: attendee.id },
      });
      if (attendance?.status === "NO_SHOW") return;
      if (attendance?.status === "PRESENT" || attendance?.status === "CHECKED_OUT") {
        return;
      }
      if (!attendance) {
        attendance = await tx.eventAttendanceRecord.create({
          data: {
            organizationId,
            eventId,
            registrationId: attendee.registrationId,
            attendeeId: attendee.id,
            memberId: attendee.memberId,
            status: "NO_SHOW",
            source: "ADMIN_CORRECTION",
          },
        });
      } else {
        attendance = await tx.eventAttendanceRecord.update({
          where: { id: attendance.id },
          data: { status: "NO_SHOW", source: "ADMIN_CORRECTION" },
        });
      }
      await tx.eventAttendanceAction.create({
        data: {
          organizationId,
          eventId,
          attendanceId: attendance.id,
          action: "MARKED_NO_SHOW",
          source: "ADMIN_CORRECTION",
          actorUserId: actor.userAccountId,
          reason: "Bulk no-show finalization",
        },
      });
      marked += 1;
    });
  }

  await audit(
    organizationId,
    actor,
    "EVENT_ATTENDANCE_MARKED_NO_SHOW",
    "Event",
    eventId,
    buildSafeAuditChanges({ marked }),
  );

  return { marked };
}

export async function issueOrGetQrPass(
  registrationId: string,
  actor: Actor,
  options?: { rotate?: boolean; memberOwned?: boolean },
) {
  const organizationId = await getOrganizationId();
  if (!options?.memberOwned) {
    await requireEventPermission(
      organizationId,
      (a) => a.canOperateCheckIn || a.canManageCheckIn || a.canManageRegistration,
      "You do not have permission to issue QR passes.",
    );
  }

  const registration = await prisma.eventRegistration.findFirst({
    where: { organizationId, id: registrationId },
    include: {
      event: { select: { id: true, endDateTime: true, eventStatus: true } },
      attendees: { where: { status: { not: "CANCELLED" } } },
    },
  });
  if (!registration) throw new CheckInError("NOT_FOUND", "Registration not found.");
  if (!isEligibleRegistrationStatus(registration.status)) {
    throw new CheckInError(
      "REGISTRATION_NOT_ELIGIBLE",
      "QR passes are only available for eligible registrations.",
    );
  }

  let settings = await findCheckInSettings(organizationId, registration.eventId);
  if (!settings) {
    settings = await upsertCheckInSettings(organizationId, registration.eventId, {
      checkInEnabled: false,
      checkInOpensAt: null,
      checkInClosesAt: null,
      allowSelfCheckIn: false,
      allowWalkIns: false,
      allowCheckOut: false,
      allowReentry: false,
      requireRegistration: true,
      qrPassEnabled: true,
      stationNameRequired: false,
    });
  }
  if (!settings.qrPassEnabled || !settings.checkInEnabled) {
    throw new CheckInError("CHECK_IN_DISABLED", "QR passes are not enabled.");
  }

  if (!options?.rotate) {
    const existing = await prisma.eventQrPass.findFirst({
      where: {
        organizationId,
        registrationId,
        status: "ACTIVE",
        revokedAt: null,
        expiresAt: { gt: new Date() },
        attendeeId: null,
        purpose: "EVENT_CHECK_IN",
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      // Hash-only storage: raw token/fallback cannot be recovered on reuse.
      return {
        passId: existing.id,
        fallbackCode: null as string | null,
        expiresAt: existing.expiresAt,
        rawToken: null as string | null,
        payload: null as string | null,
        reused: true,
        eventId: registration.eventId,
        confirmationCode: registration.confirmationCode,
        attendees: registration.attendees.map((a) => ({
          id: a.id,
          firstName: a.firstName,
          lastName: a.lastName,
        })),
      };
    }
  }

  if (options?.rotate) {
    const now = new Date();
    await prisma.eventQrPass.updateMany({
      where: {
        organizationId,
        registrationId,
        status: "ACTIVE",
      },
      data: {
        status: "REVOKED",
        revokedAt: now,
        rotatedAt: now,
      },
    });
  }

  const rawToken = generateQrPassToken();
  const tokenHash = hashQrPassToken(rawToken);
  const fallbackCode = generateQrFallbackCode();
  const fallbackCodeHash = hashQrFallbackCode(fallbackCode);
  const expiresAt = new Date(
    Math.max(registration.event.endDateTime.getTime(), Date.now()) +
      24 * 60 * 60 * 1000,
  );

  const pass = await prisma.eventQrPass.create({
    data: {
      organizationId,
      eventId: registration.eventId,
      registrationId,
      tokenHash,
      fallbackCodeHash,
      purpose: "EVENT_CHECK_IN",
      status: "ACTIVE",
      expiresAt,
    },
  });

  await audit(
    organizationId,
    actor,
    options?.rotate ? "EVENT_QR_PASS_ROTATED" : "EVENT_QR_PASS_ISSUED",
    "EventQrPass",
    pass.id,
    buildSafeAuditChanges({
      registrationId,
      eventId: registration.eventId,
      purpose: "EVENT_CHECK_IN",
    }),
  );

  return {
    passId: pass.id,
    fallbackCode,
    expiresAt: pass.expiresAt,
    rawToken,
    payload: buildQrPassPayload(rawToken),
    reused: false,
    attendees: registration.attendees.map((a) => ({
      id: a.id,
      firstName: a.firstName,
      lastName: a.lastName,
    })),
    eventId: registration.eventId,
    confirmationCode: registration.confirmationCode,
  };
}

export async function resolveQrPassForStaff(
  eventId: string,
  tokenOrCode: string,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canOperateCheckIn,
    "You do not have permission to resolve QR passes.",
  );
  await assertActionAllowed("event.qr.resolve", actor.userAccountId);

  const settings = await getOrCreateCheckInSettings(eventId);
  assertCheckInWindow(settings);

  const raw = parseQrPassPayload(tokenOrCode);
  const tokenHash = hashQrPassToken(raw);
  const pass =
    (await findActiveQrPassByHash(organizationId, tokenHash)) ??
    (await findActiveQrPassByFallback(
      organizationId,
      hashQrFallbackCode(raw),
      eventId,
    ));

  if (!pass || pass.eventId !== eventId) {
    throw new CheckInError("INVALID_QR_PASS", "QR pass is invalid.");
  }
  if (pass.revokedAt) {
    throw new CheckInError("QR_PASS_REVOKED", "QR pass has been revoked.");
  }
  if (pass.expiresAt <= new Date()) {
    throw new CheckInError("QR_PASS_EXPIRED", "QR pass has expired.");
  }
  if (pass.event.eventStatus === "CANCELLED") {
    throw new CheckInError("REGISTRATION_NOT_ELIGIBLE", "Event is cancelled.");
  }
  if (!isEligibleRegistrationStatus(pass.registration.status)) {
    throw new CheckInError(
      "REGISTRATION_NOT_ELIGIBLE",
      "Registration is not eligible for check-in.",
    );
  }

  await prisma.eventQrPass.update({
    where: { id: pass.id },
    data: { lastUsedAt: new Date() },
  });

  const attendanceByAttendee = await prisma.eventAttendanceRecord.findMany({
    where: {
      organizationId,
      eventId,
      attendeeId: { in: pass.registration.attendees.map((a) => a.id) },
    },
  });
  const attendanceMap = new Map(
    attendanceByAttendee.map((row) => [row.attendeeId!, row]),
  );

  return {
    registrationId: pass.registrationId,
    confirmationCode: pass.registration.confirmationCode,
    attendees: pass.registration.attendees.map((attendee) => ({
      id: attendee.id,
      firstName: attendee.firstName,
      lastName: attendee.lastName,
      status: attendee.status,
      attendanceStatus: attendanceMap.get(attendee.id)?.status ?? "EXPECTED",
    })),
  };
}

export async function selfCheckInWithQrPass(
  eventId: string,
  tokenOrCode: string,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await assertActionAllowed("event.qr.self", actor.userAccountId);

  const settings = await findCheckInSettings(organizationId, eventId);
  if (!settings) {
    throw new CheckInError("CHECK_IN_DISABLED", "Check-in is not configured.");
  }
  assertCheckInWindow(settings);
  if (!settings.allowSelfCheckIn) {
    throw new CheckInError("FORBIDDEN", "Self check-in is disabled.");
  }

  const raw = parseQrPassPayload(tokenOrCode);
  const pass =
    (await findActiveQrPassByHash(organizationId, hashQrPassToken(raw))) ??
    (await findActiveQrPassByFallback(
      organizationId,
      hashQrFallbackCode(raw),
      eventId,
    ));
  if (!pass || pass.eventId !== eventId) {
    throw new CheckInError("INVALID_QR_PASS", "QR pass is invalid.");
  }
  if (pass.revokedAt) throw new CheckInError("QR_PASS_REVOKED", "QR pass revoked.");
  if (pass.expiresAt <= new Date()) {
    throw new CheckInError("QR_PASS_EXPIRED", "QR pass expired.");
  }
  if (!isEligibleRegistrationStatus(pass.registration.status)) {
    throw new CheckInError(
      "REGISTRATION_NOT_ELIGIBLE",
      "Registration is not eligible for check-in.",
    );
  }

  const results = [];
  for (const attendee of pass.registration.attendees) {
    if (attendee.status === "CANCELLED") continue;
    results.push(
      await checkInAttendeeById(
        {
          eventId,
          attendeeId: attendee.id,
          source: "SELF_QR",
          operationKey: `self:${hashQrPassToken(raw)}:${attendee.id}`,
        },
        actor,
        { skipPermission: true, isSelf: true },
      ),
    );
  }
  return {
    confirmationCode: pass.registration.confirmationCode,
    results,
  };
}

export async function exportAttendanceCsv(eventId: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canExportAttendance,
    "You do not have permission to export attendance.",
  );

  const rows = await prisma.eventAttendanceRecord.findMany({
    where: { organizationId, eventId },
    include: {
      attendee: {
        select: { firstName: true, lastName: true, isGuest: true, memberId: true },
      },
      registration: { select: { confirmationCode: true, status: true, source: true } },
      station: { select: { name: true } },
    },
    orderBy: [{ lastCheckedInAt: "desc" }, { id: "asc" }],
  });

  const header = [
    "confirmationCode",
    "attendeeName",
    "type",
    "registrationStatus",
    "registrationSource",
    "attendanceStatus",
    "attendanceSource",
    "station",
    "firstCheckedInAt",
    "lastCheckedInAt",
    "checkedOutAt",
    "checkInCount",
  ];

  const escape = (value: string) => {
    let text = value;
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [header.join(",")];
  for (const row of rows) {
    const name = row.attendee
      ? `${row.attendee.firstName} ${row.attendee.lastName}`
      : `${row.walkInFirstName ?? ""} ${row.walkInLastName ?? ""}`.trim();
    const type = row.source === "WALK_IN"
      ? "walk-in"
      : row.attendee?.memberId
        ? "member"
        : "guest";
    lines.push(
      [
        row.registration?.confirmationCode ?? "",
        name,
        type,
        row.registration?.status ?? "",
        row.registration?.source ?? "",
        row.status,
        row.source,
        row.station?.name ?? "",
        row.firstCheckedInAt?.toISOString() ?? "",
        row.lastCheckedInAt?.toISOString() ?? "",
        row.checkedOutAt?.toISOString() ?? "",
        String(row.checkInCount),
      ]
        .map((cell) => escape(String(cell)))
        .join(","),
    );
  }

  await audit(
    organizationId,
    actor,
    "EVENT_ATTENDANCE_EXPORTED",
    "Event",
    eventId,
    buildSafeAuditChanges({ rowCount: rows.length }),
  );

  return {
    filename: `event-${eventId}-attendance.csv`,
    csv: lines.join("\n"),
    rowCount: rows.length,
  };
}

export async function getCheckInOperationsBootstrap(eventId: string) {
  const organizationId = await getOrganizationId();
  const access = await getEventAccess(organizationId);
  if (!access.canOperateCheckIn && !access.canReadCheckIn) {
    throw new CheckInError("FORBIDDEN", "You do not have permission for check-in.");
  }

  const [event, settings, stations, summary] = await Promise.all([
    findEventForCheckIn(organizationId, eventId),
    getOrCreateCheckInSettings(eventId),
    listStations(organizationId, eventId),
    getAttendanceSummaryCounts(organizationId, eventId),
  ]);
  if (!event) throw new CheckInError("EVENT_NOT_FOUND", "Event not found.");

  return { event, settings, stations, summary, access };
}
