import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

const presentMemberLinkedWhere = (
  organizationId: string,
  eventId: string,
): Prisma.EventAttendanceRecordWhereInput => ({
  organizationId,
  eventId,
  status: "PRESENT",
  attendeeId: { not: null },
  attendee: {
    memberId: { not: null },
  },
});

export async function findEventForChildPickup(
  organizationId: string,
  eventId: string,
  tx: DbClient = prisma,
) {
  return tx.event.findFirst({
    where: { id: eventId, organizationId },
    select: {
      id: true,
      title: true,
      checkInSettings: {
        select: {
          allowCheckOut: true,
          checkInEnabled: true,
          stationNameRequired: true,
        },
      },
    },
  });
}

export async function searchPresentMemberLinkedAttendance(input: {
  organizationId: string;
  eventId: string;
  query: string;
  take?: number;
}) {
  const q = input.query.trim();
  return prisma.eventAttendanceRecord.findMany({
    where: {
      ...presentMemberLinkedWhere(input.organizationId, input.eventId),
      attendee: {
        memberId: { not: null },
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      },
    },
    select: {
      id: true,
      attendeeId: true,
      attendee: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: [{ id: "asc" }],
    take: input.take ?? 8,
  });
}

export async function findPresentAttendanceForChildPickup(
  organizationId: string,
  eventId: string,
  attendanceId: string,
  tx: DbClient = prisma,
) {
  return tx.eventAttendanceRecord.findFirst({
    where: {
      id: attendanceId,
      organizationId,
      eventId,
    },
    select: {
      id: true,
      organizationId: true,
      eventId: true,
      status: true,
      attendeeId: true,
      memberId: true,
      attendee: {
        select: {
          id: true,
          memberId: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
}

export async function findActiveApprovedPickupsForMember(
  organizationId: string,
  memberId: string,
  tx: DbClient = prisma,
) {
  return tx.memberApprovedPickup.findMany({
    where: {
      organizationId,
      memberId,
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      relationship: true,
      isActive: true,
      memberId: true,
      organizationId: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function findActiveApprovedPickupForMember(
  organizationId: string,
  memberId: string,
  pickupId: string,
  tx: DbClient = prisma,
) {
  return tx.memberApprovedPickup.findFirst({
    where: {
      id: pickupId,
      organizationId,
      memberId,
      isActive: true,
    },
    select: {
      id: true,
      memberId: true,
      organizationId: true,
      isActive: true,
    },
  });
}

export async function findChildPickupVerificationByAttendance(
  organizationId: string,
  attendanceId: string,
  tx: DbClient = prisma,
) {
  return tx.childPickupCheckoutVerification.findFirst({
    where: { organizationId, attendanceId },
    select: {
      id: true,
      attendanceId: true,
      memberId: true,
      approvedPickupId: true,
    },
  });
}

export async function createChildPickupVerification(
  data: {
    organizationId: string;
    eventId: string;
    attendanceId: string;
    memberId: string;
    approvedPickupId: string;
    verifiedByUserId: string | null;
    verifiedAt: Date;
  },
  tx: DbClient = prisma,
) {
  return tx.childPickupCheckoutVerification.create({
    data,
    select: { id: true, attendanceId: true },
  });
}
