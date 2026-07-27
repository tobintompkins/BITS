import type {
  AttendanceType,
  CommunicationDirection,
  CommunicationType,
  FollowUpPriority,
  FollowUpStatus,
  FollowUpType,
  PastoralCareCategory,
  PrayerPrivacyLevel,
  PrayerRequestStatus,
  Prisma,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

const memberNameSelect = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  membershipStatus: true,
} satisfies Prisma.MemberSelect;

const userSelect = {
  id: true,
  displayName: true,
  primaryEmail: true,
} satisfies Prisma.UserAccountSelect;

export type AttendanceFilters = {
  organizationId: string;
  memberId?: string;
  search?: string;
  serviceName?: string;
  attendanceType?: AttendanceType;
  dateFrom?: Date;
  dateTo?: Date;
  take?: number;
  skip?: number;
};

export async function findAttendanceRecords(filters: AttendanceFilters) {
  const where: Prisma.MemberAttendanceWhereInput = {
    organizationId: filters.organizationId,
    ...(filters.memberId ? { memberId: filters.memberId } : {}),
    ...(filters.serviceName
      ? { serviceName: { contains: filters.serviceName, mode: "insensitive" } }
      : {}),
    ...(filters.attendanceType ? { attendanceType: filters.attendanceType } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          attendanceDate: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          member: {
            OR: [
              { firstName: { contains: filters.search, mode: "insensitive" } },
              { lastName: { contains: filters.search, mode: "insensitive" } },
              { preferredName: { contains: filters.search, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const [records, total] = await Promise.all([
    prisma.memberAttendance.findMany({
      where,
      include: {
        member: { select: memberNameSelect },
        checkedInBy: { select: userSelect },
      },
      orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
      take: filters.take ?? 50,
      skip: filters.skip ?? 0,
    }),
    prisma.memberAttendance.count({ where }),
  ]);

  return { records, total };
}

export async function findAttendanceById(organizationId: string, id: string) {
  return prisma.memberAttendance.findFirst({
    where: { id, organizationId },
    include: {
      member: { select: memberNameSelect },
      checkedInBy: { select: userSelect },
    },
  });
}

export async function createAttendance(data: {
  organizationId: string;
  memberId: string;
  attendanceDate: Date;
  serviceName: string;
  attendanceType: AttendanceType;
  checkInTime?: Date | null;
  checkOutTime?: Date | null;
  checkedInByUserId?: string | null;
  notes?: string | null;
}) {
  return prisma.memberAttendance.create({ data });
}

export async function updateAttendance(
  id: string,
  organizationId: string,
  data: {
    memberId: string;
    attendanceDate: Date;
    serviceName: string;
    attendanceType: AttendanceType;
    checkInTime?: Date | null;
    checkOutTime?: Date | null;
    notes?: string | null;
  },
) {
  const result = await prisma.memberAttendance.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Attendance record not found.");
  return findAttendanceById(organizationId, id);
}

export async function deleteAttendance(id: string, organizationId: string) {
  const result = await prisma.memberAttendance.deleteMany({
    where: { id, organizationId },
  });
  if (result.count === 0) throw new Error("Attendance record not found.");
}

export async function getMemberAttendanceStats(
  organizationId: string,
  memberId: string,
) {
  const now = new Date();
  const days30 = new Date(now);
  days30.setDate(days30.getDate() - 30);
  const days90 = new Date(now);
  days90.setDate(days90.getDate() - 90);

  const [total, last30, last90, recent, byService] = await Promise.all([
    prisma.memberAttendance.count({ where: { organizationId, memberId } }),
    prisma.memberAttendance.count({
      where: {
        organizationId,
        memberId,
        attendanceDate: { gte: days30 },
        attendanceType: { in: ["PRESENT", "ONLINE", "VOLUNTEER", "GUEST"] },
      },
    }),
    prisma.memberAttendance.count({
      where: {
        organizationId,
        memberId,
        attendanceDate: { gte: days90 },
        attendanceType: { in: ["PRESENT", "ONLINE", "VOLUNTEER", "GUEST"] },
      },
    }),
    prisma.memberAttendance.findFirst({
      where: { organizationId, memberId },
      orderBy: { attendanceDate: "desc" },
      select: { attendanceDate: true, serviceName: true },
    }),
    prisma.memberAttendance.groupBy({
      by: ["serviceName"],
      where: { organizationId, memberId },
      _count: { serviceName: true },
      orderBy: { _count: { serviceName: "desc" } },
      take: 1,
    }),
  ]);

  const presentCount = await prisma.memberAttendance.count({
    where: {
      organizationId,
      memberId,
      attendanceType: { in: ["PRESENT", "ONLINE", "VOLUNTEER", "GUEST"] },
    },
  });

  return {
    total,
    last30,
    last90,
    mostRecentDate: recent?.attendanceDate ?? null,
    mostFrequentService: byService[0]?.serviceName ?? null,
    attendancePercentage:
      total >= 4 ? Math.round((presentCount / total) * 100) : null,
  };
}

export type FollowUpFilters = {
  organizationId: string;
  memberId?: string;
  status?: FollowUpStatus;
  priority?: FollowUpPriority;
  followUpType?: FollowUpType;
  assignedToUserId?: string;
  dueFrom?: Date;
  dueTo?: Date;
  take?: number;
  skip?: number;
};

export async function findFollowUps(filters: FollowUpFilters) {
  const where: Prisma.MemberFollowUpWhereInput = {
    organizationId: filters.organizationId,
    ...(filters.memberId ? { memberId: filters.memberId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.followUpType ? { followUpType: filters.followUpType } : {}),
    ...(filters.assignedToUserId
      ? { assignedToUserId: filters.assignedToUserId }
      : {}),
    ...(filters.dueFrom || filters.dueTo
      ? {
          dueDate: {
            ...(filters.dueFrom ? { gte: filters.dueFrom } : {}),
            ...(filters.dueTo ? { lte: filters.dueTo } : {}),
          },
        }
      : {}),
  };

  const [records, total] = await Promise.all([
    prisma.memberFollowUp.findMany({
      where,
      include: {
        member: { select: memberNameSelect },
        assignedTo: { select: userSelect },
        createdBy: { select: userSelect },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: filters.take ?? 50,
      skip: filters.skip ?? 0,
    }),
    prisma.memberFollowUp.count({ where }),
  ]);

  return { records, total };
}

export async function findFollowUpById(organizationId: string, id: string) {
  return prisma.memberFollowUp.findFirst({
    where: { id, organizationId },
    include: {
      member: { select: memberNameSelect },
      assignedTo: { select: userSelect },
      createdBy: { select: userSelect },
    },
  });
}

export async function createFollowUp(data: {
  organizationId: string;
  memberId: string;
  followUpType: FollowUpType;
  status: FollowUpStatus;
  priority: FollowUpPriority;
  assignedToUserId?: string | null;
  dueDate?: Date | null;
  subject: string;
  notes?: string | null;
  outcome?: string | null;
  createdByUserId: string;
}) {
  return prisma.memberFollowUp.create({ data });
}

export async function updateFollowUp(
  id: string,
  organizationId: string,
  data: Prisma.MemberFollowUpUncheckedUpdateManyInput,
) {
  const result = await prisma.memberFollowUp.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Follow-up not found.");
  return findFollowUpById(organizationId, id);
}

export async function deleteFollowUp(id: string, organizationId: string) {
  const result = await prisma.memberFollowUp.deleteMany({
    where: { id, organizationId },
  });
  if (result.count === 0) throw new Error("Follow-up not found.");
}

export async function countFollowUpsByStatus(organizationId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [open, inProgress, overdue, completedThisMonth, dueToday] =
    await Promise.all([
      prisma.memberFollowUp.count({
        where: { organizationId, status: "OPEN" },
      }),
      prisma.memberFollowUp.count({
        where: { organizationId, status: "IN_PROGRESS" },
      }),
      prisma.memberFollowUp.count({
        where: {
          organizationId,
          status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
          dueDate: { lt: today },
        },
      }),
      prisma.memberFollowUp.count({
        where: {
          organizationId,
          status: "COMPLETED",
          completedAt: { gte: monthStart },
        },
      }),
      prisma.memberFollowUp.count({
        where: {
          organizationId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
          dueDate: today,
        },
      }),
    ]);

  return { open, inProgress, overdue, completedThisMonth, dueToday };
}

export async function findPastoralCareNotes(filters: {
  organizationId: string;
  memberId?: string;
  includeConfidential: boolean;
  assignedPastorUserId?: string;
  take?: number;
  skip?: number;
}) {
  const where: Prisma.PastoralCareNoteWhereInput = {
    organizationId: filters.organizationId,
    ...(filters.memberId ? { memberId: filters.memberId } : {}),
    ...(filters.assignedPastorUserId
      ? { assignedPastorUserId: filters.assignedPastorUserId }
      : {}),
    ...(filters.includeConfidential ? {} : { isConfidential: false }),
  };

  const [records, total] = await Promise.all([
    prisma.pastoralCareNote.findMany({
      where,
      include: {
        member: { select: memberNameSelect },
        assignedPastor: { select: userSelect },
        createdBy: { select: userSelect },
      },
      orderBy: [{ createdAt: "desc" }],
      take: filters.take ?? 50,
      skip: filters.skip ?? 0,
    }),
    prisma.pastoralCareNote.count({ where }),
  ]);

  return { records, total };
}

export async function findPastoralCareNoteById(
  organizationId: string,
  id: string,
) {
  return prisma.pastoralCareNote.findFirst({
    where: { id, organizationId },
    include: {
      member: { select: memberNameSelect },
      assignedPastor: { select: userSelect },
      createdBy: { select: userSelect },
    },
  });
}

export async function createPastoralCareNote(data: {
  organizationId: string;
  memberId: string;
  category: PastoralCareCategory;
  title: string;
  note: string;
  isConfidential: boolean;
  assignedPastorUserId?: string | null;
  followUpDate?: Date | null;
  createdByUserId: string;
}) {
  return prisma.pastoralCareNote.create({ data });
}

export async function updatePastoralCareNote(
  id: string,
  organizationId: string,
  data: Prisma.PastoralCareNoteUncheckedUpdateManyInput,
) {
  const result = await prisma.pastoralCareNote.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Pastoral care note not found.");
  return findPastoralCareNoteById(organizationId, id);
}

export async function deletePastoralCareNote(id: string, organizationId: string) {
  const result = await prisma.pastoralCareNote.deleteMany({
    where: { id, organizationId },
  });
  if (result.count === 0) throw new Error("Pastoral care note not found.");
}

export async function findPrayerRequests(filters: {
  organizationId: string;
  memberId?: string;
  status?: PrayerRequestStatus;
  privacyLevel?: PrayerPrivacyLevel;
  assignedToUserId?: string;
  allowedPrivacyLevels: PrayerPrivacyLevel[];
  dateFrom?: Date;
  dateTo?: Date;
  take?: number;
  skip?: number;
}) {
  const where: Prisma.PrayerRequestWhereInput = {
    organizationId: filters.organizationId,
    privacyLevel: { in: filters.allowedPrivacyLevels },
    ...(filters.memberId ? { memberId: filters.memberId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.privacyLevel ? { privacyLevel: filters.privacyLevel } : {}),
    ...(filters.assignedToUserId
      ? { assignedToUserId: filters.assignedToUserId }
      : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          createdAt: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
  };

  const [records, total] = await Promise.all([
    prisma.prayerRequest.findMany({
      where,
      include: {
        member: { select: memberNameSelect },
        assignedTo: { select: userSelect },
        createdBy: { select: userSelect },
      },
      orderBy: [{ createdAt: "desc" }],
      take: filters.take ?? 50,
      skip: filters.skip ?? 0,
    }),
    prisma.prayerRequest.count({ where }),
  ]);

  return { records, total };
}

export async function findPrayerRequestById(organizationId: string, id: string) {
  return prisma.prayerRequest.findFirst({
    where: { id, organizationId },
    include: {
      member: { select: memberNameSelect },
      assignedTo: { select: userSelect },
      createdBy: { select: userSelect },
    },
  });
}

export async function createPrayerRequest(data: {
  organizationId: string;
  memberId?: string | null;
  requesterName?: string | null;
  requesterContact?: string | null;
  request: string;
  status: PrayerRequestStatus;
  privacyLevel: PrayerPrivacyLevel;
  isPublic?: boolean;
  publicPublishedAt?: Date | null;
  publicExpiresAt?: Date | null;
  assignedToUserId?: string | null;
  createdByUserId?: string | null;
}) {
  return prisma.prayerRequest.create({ data });
}

export async function findPublicPrayerWallRequests(
  organizationId: string,
  now = new Date(),
) {
  return prisma.prayerRequest.findMany({
    where: {
      organizationId,
      isPublic: true,
      privacyLevel: "PUBLIC",
      status: { in: ["ACTIVE", "IN_PRAYER"] },
      publicPublishedAt: { not: null },
      publicExpiresAt: { gt: now },
    },
    select: {
      id: true,
      requesterName: true,
      request: true,
      createdAt: true,
    },
    orderBy: { publicPublishedAt: "desc" },
    take: 20,
  });
}

export async function setPrayerRequestPublicVisibility(
  id: string,
  organizationId: string,
  isPublic: boolean,
) {
  const result = await prisma.prayerRequest.updateMany({
    where: { id, organizationId },
    data: isPublic
      ? {
          isPublic: true,
          privacyLevel: "PUBLIC",
          publicPublishedAt: new Date(),
          publicExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        }
      : {
          isPublic: false,
          publicPublishedAt: null,
          publicExpiresAt: null,
        },
  });
  if (result.count === 0) throw new Error("Prayer request not found.");
}

export async function updatePrayerRequest(
  id: string,
  organizationId: string,
  data: Prisma.PrayerRequestUncheckedUpdateManyInput,
) {
  const result = await prisma.prayerRequest.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Prayer request not found.");
  return findPrayerRequestById(organizationId, id);
}

export async function deletePrayerRequest(id: string, organizationId: string) {
  const result = await prisma.prayerRequest.deleteMany({
    where: { id, organizationId },
  });
  if (result.count === 0) throw new Error("Prayer request not found.");
}

export async function findCommunications(filters: {
  organizationId: string;
  memberId?: string;
  take?: number;
  skip?: number;
}) {
  const where: Prisma.MemberCommunicationWhereInput = {
    organizationId: filters.organizationId,
    ...(filters.memberId ? { memberId: filters.memberId } : {}),
  };

  const [records, total] = await Promise.all([
    prisma.memberCommunication.findMany({
      where,
      include: {
        member: { select: memberNameSelect },
        contactedBy: { select: userSelect },
      },
      orderBy: [{ communicationDate: "desc" }],
      take: filters.take ?? 50,
      skip: filters.skip ?? 0,
    }),
    prisma.memberCommunication.count({ where }),
  ]);

  return { records, total };
}

export async function findCommunicationById(organizationId: string, id: string) {
  return prisma.memberCommunication.findFirst({
    where: { id, organizationId },
    include: {
      member: { select: memberNameSelect },
      contactedBy: { select: userSelect },
    },
  });
}

export async function createCommunication(data: {
  organizationId: string;
  memberId: string;
  communicationType: CommunicationType;
  direction: CommunicationDirection;
  subject?: string | null;
  messageSummary: string;
  communicationDate: Date;
  contactedByUserId: string;
  outcome?: string | null;
  followUpRequired: boolean;
  followUpDate?: Date | null;
}) {
  return prisma.memberCommunication.create({ data });
}

export async function updateCommunication(
  id: string,
  organizationId: string,
  data: Prisma.MemberCommunicationUncheckedUpdateManyInput,
) {
  const result = await prisma.memberCommunication.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Communication not found.");
  return findCommunicationById(organizationId, id);
}

export async function deleteCommunication(id: string, organizationId: string) {
  const result = await prisma.memberCommunication.deleteMany({
    where: { id, organizationId },
  });
  if (result.count === 0) throw new Error("Communication not found.");
}

export async function findStaffUsers(organizationId: string) {
  return prisma.userAccount.findMany({
    where: {
      active: true,
      memberships: {
        some: { organizationId, active: true },
      },
    },
    select: userSelect,
    orderBy: { displayName: "asc" },
  });
}

export async function getDashboardCareCounts(organizationId: string) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const [
    attendanceThisWeek,
    firstTimeVisitors,
    openFollowUps,
    overdueFollowUps,
    activePrayerRequests,
    pastoralCareFollowUpsDue,
  ] = await Promise.all([
    prisma.memberAttendance.count({
      where: {
        organizationId,
        attendanceDate: { gte: weekStart },
        attendanceType: { in: ["PRESENT", "ONLINE", "VOLUNTEER", "GUEST"] },
      },
    }),
    prisma.member.count({
      where: { organizationId, membershipStatus: "VISITOR" },
    }),
    prisma.memberFollowUp.count({
      where: { organizationId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.memberFollowUp.count({
      where: {
        organizationId,
        status: { in: ["OPEN", "IN_PROGRESS", "OVERDUE"] },
        dueDate: { lt: today },
      },
    }),
    prisma.prayerRequest.count({
      where: {
        organizationId,
        status: { in: ["ACTIVE", "IN_PRAYER"] },
        privacyLevel: { in: ["PUBLIC", "PRAYER_TEAM"] },
      },
    }),
    prisma.pastoralCareNote.count({
      where: {
        organizationId,
        resolvedAt: null,
        followUpDate: { lte: today },
        isConfidential: false,
      },
    }),
  ]);

  return {
    attendanceThisWeek,
    firstTimeVisitors,
    openFollowUps,
    overdueFollowUps,
    activePrayerRequests,
    pastoralCareFollowUpsDue,
  };
}
