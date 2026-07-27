import type {
  EventAttendanceSource,
  EventAttendanceStatus,
  Prisma,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  createActiveStation,
  findStationByEventId,
  listStationsForEvent,
} from "@/server/repositories/event-check-in-station.repository";

export async function lockCheckInSettingsForEvent(
  eventId: string,
  tx: Prisma.TransactionClient,
) {
  await tx.$executeRaw`
    SELECT id FROM event_check_in_settings
    WHERE "eventId" = ${eventId}::uuid
    FOR UPDATE
  `;
}

export async function findCheckInSettings(
  organizationId: string,
  eventId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventCheckInSettings.findFirst({
    where: { organizationId, eventId },
  });
}

export async function upsertCheckInSettings(
  organizationId: string,
  eventId: string,
  data: {
    checkInEnabled: boolean;
    checkInOpensAt: Date | null;
    checkInClosesAt: Date | null;
    allowSelfCheckIn: boolean;
    allowWalkIns: boolean;
    allowCheckOut: boolean;
    allowReentry: boolean;
    requireRegistration: boolean;
    qrPassEnabled: boolean;
    stationNameRequired: boolean;
  },
) {
  return prisma.eventCheckInSettings.upsert({
    where: { eventId },
    create: { organizationId, eventId, ...data },
    update: { ...data, organizationId },
  });
}

export async function findEventForCheckIn(
  organizationId: string,
  eventId: string,
) {
  return prisma.event.findFirst({
    where: { organizationId, id: eventId },
    select: {
      id: true,
      organizationId: true,
      title: true,
      slug: true,
      eventStatus: true,
      visibility: true,
      startDateTime: true,
      endDateTime: true,
      timezone: true,
      checkInSettings: true,
      registrationSettings: {
        select: { capacity: true, isEnabled: true },
      },
    },
  });
}

export async function findActiveStation(
  organizationId: string,
  eventId: string,
  stationId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return findStationByEventId(organizationId, eventId, stationId, tx);
}

export async function openStationRecord(input: {
  organizationId: string;
  eventId: string;
  name: string;
  deviceLabel?: string | null;
  openedByUserId: string;
}) {
  return createActiveStation(input);
}

export async function closeStationRecord(
  organizationId: string,
  stationId: string,
  closedByUserId: string,
) {
  return prisma.eventCheckInStation.updateMany({
    where: { organizationId, id: stationId, status: "ACTIVE" },
    data: {
      status: "CLOSED",
      closedByUserId,
      closedAt: new Date(),
    },
  });
}

export async function listStations(organizationId: string, eventId: string) {
  const result = await listStationsForEvent(organizationId, eventId);
  return result.items;
}

export async function findAttendanceByAttendee(
  organizationId: string,
  eventId: string,
  attendeeId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventAttendanceRecord.findFirst({
    where: { organizationId, eventId, attendeeId },
    include: {
      attendee: true,
      registration: { select: { id: true, status: true, confirmationCode: true } },
      station: { select: { id: true, name: true, status: true } },
      actions: { orderBy: { occurredAt: "desc" }, take: 20 },
    },
  });
}

export async function findAttendanceById(
  organizationId: string,
  attendanceId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventAttendanceRecord.findFirst({
    where: { organizationId, id: attendanceId },
    include: {
      attendee: true,
      registration: { select: { id: true, status: true, confirmationCode: true } },
      station: { select: { id: true, name: true } },
      actions: { orderBy: { occurredAt: "desc" }, take: 50 },
    },
  });
}

export async function searchEligibleAttendees(
  organizationId: string,
  eventId: string,
  query: string,
  page: number,
  pageSize: number,
) {
  const q = query.trim();
  const where: Prisma.EventAttendeeWhereInput = {
    organizationId,
    eventId,
    status: { notIn: ["CANCELLED", "WAITLISTED"] },
    registration: {
      status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] },
    },
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            {
              registration: {
                confirmationCode: { contains: q.toUpperCase(), mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.eventAttendee.count({ where }),
    prisma.eventAttendee.findMany({
      where,
      include: {
        registration: {
          select: {
            id: true,
            confirmationCode: true,
            status: true,
            primaryContactName: true,
          },
        },
        attendanceRecords: {
          where: { eventId },
          take: 1,
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { total, items, page, pageSize };
}

export async function getAttendanceSummaryCounts(
  organizationId: string,
  eventId: string,
) {
  const grouped = await prisma.eventAttendanceRecord.groupBy({
    by: ["status"],
    where: { organizationId, eventId },
    _count: { _all: true },
  });

  const counts = {
    expected: 0,
    present: 0,
    checkedOut: 0,
    noShow: 0,
    cancelled: 0,
    walkIns: 0,
    totalCheckedInPeople: 0,
  };

  for (const row of grouped) {
    const n = row._count._all;
    if (row.status === "EXPECTED") counts.expected = n;
    if (row.status === "PRESENT") counts.present = n;
    if (row.status === "CHECKED_OUT") counts.checkedOut = n;
    if (row.status === "NO_SHOW") counts.noShow = n;
    if (row.status === "CANCELLED") counts.cancelled = n;
  }

  counts.totalCheckedInPeople = counts.present + counts.checkedOut;
  counts.walkIns = await prisma.eventAttendanceRecord.count({
    where: {
      organizationId,
      eventId,
      source: "WALK_IN",
      status: { in: ["PRESENT", "CHECKED_OUT", "EXPECTED"] },
    },
  });

  const eligibleWithoutRecord = await prisma.eventAttendee.count({
    where: {
      organizationId,
      eventId,
      status: { notIn: ["CANCELLED", "WAITLISTED"] },
      registration: { status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] } },
      attendanceRecords: { none: { eventId } },
    },
  });
  counts.expected += eligibleWithoutRecord;

  return counts;
}

export async function listAttendanceRecords(
  organizationId: string,
  eventId: string,
  options: {
    status?: EventAttendanceStatus;
    source?: EventAttendanceSource;
    page: number;
    pageSize: number;
    query?: string;
  },
) {
  const q = options.query?.trim();
  const where: Prisma.EventAttendanceRecordWhereInput = {
    organizationId,
    eventId,
    ...(options.status ? { status: options.status } : {}),
    ...(options.source ? { source: options.source } : {}),
    ...(q
      ? {
          OR: [
            { walkInFirstName: { contains: q, mode: "insensitive" } },
            { walkInLastName: { contains: q, mode: "insensitive" } },
            { attendee: { firstName: { contains: q, mode: "insensitive" } } },
            { attendee: { lastName: { contains: q, mode: "insensitive" } } },
            {
              registration: {
                confirmationCode: { contains: q.toUpperCase(), mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.eventAttendanceRecord.count({ where }),
    prisma.eventAttendanceRecord.findMany({
      where,
      include: {
        attendee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            isGuest: true,
            memberId: true,
          },
        },
        registration: {
          select: { id: true, confirmationCode: true, status: true, source: true },
        },
        station: { select: { id: true, name: true } },
        checkedInBy: { select: { id: true, displayName: true, primaryEmail: true } },
      },
      orderBy: [
        { lastCheckedInAt: "desc" },
        { updatedAt: "desc" },
        { id: "asc" },
      ],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  return { total, items, page: options.page, pageSize: options.pageSize };
}

export async function findActiveQrPassByHash(
  organizationId: string,
  tokenHash: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const now = new Date();
  return tx.eventQrPass.findFirst({
    where: {
      organizationId,
      tokenHash,
      purpose: "EVENT_CHECK_IN",
      status: "ACTIVE",
      revokedAt: null,
      expiresAt: { gt: now },
    },
    include: {
      registration: {
        include: {
          attendees: {
            where: { status: { not: "CANCELLED" } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      attendee: true,
      event: { select: { id: true, title: true, endDateTime: true, eventStatus: true } },
    },
  });
}

export async function findActiveQrPassByFallback(
  organizationId: string,
  fallbackCodeHash: string,
  eventId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const now = new Date();
  return tx.eventQrPass.findFirst({
    where: {
      organizationId,
      eventId,
      fallbackCodeHash,
      purpose: "EVENT_CHECK_IN",
      status: "ACTIVE",
      revokedAt: null,
      expiresAt: { gt: now },
    },
    include: {
      registration: {
        include: {
          attendees: {
            where: { status: { not: "CANCELLED" } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      attendee: true,
      event: { select: { id: true, title: true, endDateTime: true, eventStatus: true } },
    },
  });
}

export { prisma };
