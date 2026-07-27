/**
 * Blueprint 7.3B — attendance data foundation (internal persistence only).
 *
 * Intentionally small surface:
 * - create expected rows
 * - tenant-scoped reads
 * - append-only action history + chronological listing
 *
 * No check-in state machine, no unscoped ID helpers, no action update/delete.
 */
import type {
  EventAttendanceActionType,
  EventAttendanceSource,
  Prisma,
} from "@/app/generated/prisma/client";
import { sanitizeAttendanceActionMetadata } from "@/lib/events/attendance-action-metadata";
import { prisma } from "@/lib/db/prisma";

export class AttendanceFoundationError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "MISMATCH"
      | "DUPLICATE"
      | "VALIDATION",
    message: string,
  ) {
    super(message);
    this.name = "AttendanceFoundationError";
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
    throw new AttendanceFoundationError("NOT_FOUND", "Event not found.");
  }
  return event;
}

/**
 * Create an initial EXPECTED attendance row for a registered attendee.
 * Does not copy attendee PII into the attendance table.
 */
export async function createExpectedAttendance(input: {
  organizationId: string;
  eventId: string;
  registrationId: string;
  attendeeId: string;
  memberId?: string | null;
}) {
  await assertSameTenantEvent(input.organizationId, input.eventId);

  const attendee = await prisma.eventAttendee.findFirst({
    where: {
      id: input.attendeeId,
      organizationId: input.organizationId,
      eventId: input.eventId,
      registrationId: input.registrationId,
    },
    select: {
      id: true,
      memberId: true,
      registrationId: true,
      eventId: true,
      organizationId: true,
    },
  });

  if (!attendee) {
    throw new AttendanceFoundationError(
      "MISMATCH",
      "Attendee does not belong to the referenced registration and event.",
    );
  }

  const memberId =
    input.memberId === undefined ? attendee.memberId : input.memberId;

  if (memberId) {
    const member = await prisma.member.findFirst({
      where: { id: memberId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!member) {
      throw new AttendanceFoundationError(
        "NOT_FOUND",
        "Member not found.",
      );
    }
    if (attendee.memberId && attendee.memberId !== memberId) {
      throw new AttendanceFoundationError(
        "MISMATCH",
        "Member does not match the attendee record.",
      );
    }
  }

  try {
    return await prisma.eventAttendanceRecord.create({
      data: {
        organizationId: input.organizationId,
        eventId: input.eventId,
        registrationId: input.registrationId,
        attendeeId: input.attendeeId,
        memberId: memberId ?? null,
        status: "EXPECTED",
        source: null,
        firstCheckedInAt: null,
        lastCheckedInAt: null,
        checkedOutAt: null,
        checkInCount: 0,
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new AttendanceFoundationError(
        "DUPLICATE",
        "Attendance already exists for this attendee and event.",
      );
    }
    throw error;
  }
}

/** Tenant-scoped lookup by event + attendee. */
export async function findAttendanceByEventAttendee(
  organizationId: string,
  eventId: string,
  attendeeId: string,
  tx: DbClient = prisma,
) {
  return tx.eventAttendanceRecord.findFirst({
    where: { organizationId, eventId, attendeeId },
  });
}

/**
 * Append-only history write. Does not mutate attendance status
 * (state transitions belong to later 7.3 patches / existing ops services).
 */
export async function appendAttendanceAction(input: {
  organizationId: string;
  eventId: string;
  attendanceId: string;
  action: EventAttendanceActionType;
  source: EventAttendanceSource;
  actorUserId?: string | null;
  occurredAt?: Date;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}) {
  await assertSameTenantEvent(input.organizationId, input.eventId);

  let safeMetadata: ReturnType<typeof sanitizeAttendanceActionMetadata>;
  try {
    safeMetadata = sanitizeAttendanceActionMetadata(input.metadata);
  } catch (error) {
    throw new AttendanceFoundationError(
      "VALIDATION",
      error instanceof Error
        ? error.message
        : "Attendance action metadata is invalid.",
    );
  }

  const attendance = await prisma.eventAttendanceRecord.findFirst({
    where: {
      id: input.attendanceId,
      organizationId: input.organizationId,
      eventId: input.eventId,
    },
    select: { id: true },
  });
  if (!attendance) {
    throw new AttendanceFoundationError(
      "NOT_FOUND",
      "Attendance record not found.",
    );
  }

  return prisma.eventAttendanceAction.create({
    data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      attendanceId: input.attendanceId,
      action: input.action,
      source: input.source,
      actorUserId: input.actorUserId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      reason: input.reason ?? null,
      metadata: safeMetadata ?? undefined,
    },
  });
}

/** Chronological action history (occurredAt asc, id asc as tie-breaker). */
export async function listAttendanceActions(
  organizationId: string,
  attendanceId: string,
) {
  const attendance = await prisma.eventAttendanceRecord.findFirst({
    where: { organizationId, id: attendanceId },
    select: { id: true },
  });
  if (!attendance) {
    throw new AttendanceFoundationError(
      "NOT_FOUND",
      "Attendance record not found.",
    );
  }

  return prisma.eventAttendanceAction.findMany({
    where: { organizationId, attendanceId },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
}

/** Row lock for Blueprint 7.3C atomic staff check-in. */
export async function lockAttendanceForEventAttendee(
  organizationId: string,
  eventId: string,
  attendeeId: string,
  tx: Prisma.TransactionClient,
) {
  await tx.$executeRaw`
    SELECT id FROM event_attendance_records
    WHERE "organizationId" = ${organizationId}::uuid
      AND "eventId" = ${eventId}::uuid
      AND "attendeeId" = ${attendeeId}::uuid
    FOR UPDATE
  `;
}

/** Stable export surface for authorization-boundary tests. */
export const eventAttendanceFoundationApi = {
  createExpectedAttendance,
  findAttendanceByEventAttendee,
  appendAttendanceAction,
  listAttendanceActions,
} as const;
