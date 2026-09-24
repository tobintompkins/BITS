import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  attendanceTypeOptions,
  formatEnumLabel,
} from "@/lib/constants/care-engagement";
import { prisma } from "@/lib/db/prisma";
import {
  MEMBER_ATTENDANCE_PAGE_SIZE,
  parseMemberAttendanceQuery,
} from "@/lib/validation/member-attendance";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberAttendanceRecord = {
  serviceName: string;
  attendanceDate: Date;
  statusLabel: string;
  eventTitle: string | null;
};

export type MemberAttendanceResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | {
      status: "READY";
      page: number;
      pageSize: number;
      pageCount: number;
      totalCount: number;
      records: MemberAttendanceRecord[];
    };

const attendanceSelect = {
  serviceName: true,
  attendanceDate: true,
  attendanceType: true,
  event: {
    select: {
      title: true,
      visibility: true,
      eventStatus: true,
      organizationId: true,
    },
  },
} as const;

function publicEventTitle(
  event: {
    title: string;
    visibility: string;
    eventStatus: string;
    organizationId: string;
  } | null,
  organizationId: string,
) {
  if (!event) return null;
  if (event.organizationId !== organizationId) return null;
  if (event.visibility === "STAFF_ONLY" || event.visibility === "PRIVATE") {
    return null;
  }
  if (event.eventStatus === "DRAFT") return null;
  return event.title;
}

/**
 * Read-only attendance history for the signed-in linked member.
 * Account, organization, and member are resolved server-side only.
 */
export async function getMemberAttendance(
  input: Record<string, string | string[] | undefined> = {},
): Promise<MemberAttendanceResult> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const member = await prisma.member.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      recordStatus: "ACTIVE",
    },
    select: { id: true },
  });
  if (!member) {
    return {
      status: "CONNECTION_PENDING",
      accountEmail: userAccount.primaryEmail,
    };
  }

  const parsed = parseMemberAttendanceQuery(input);
  const where = {
    organizationId: organization.id,
    memberId: member.id,
  };

  const totalCount = await prisma.memberAttendance.count({ where });
  const pageCount = Math.max(1, Math.ceil(totalCount / MEMBER_ATTENDANCE_PAGE_SIZE));
  const page = Math.min(parsed.page, pageCount);
  const skip = (page - 1) * MEMBER_ATTENDANCE_PAGE_SIZE;

  const rows =
    totalCount === 0
      ? []
      : await prisma.memberAttendance.findMany({
          where,
          orderBy: [{ attendanceDate: "desc" }, { serviceName: "asc" }],
          skip,
          take: MEMBER_ATTENDANCE_PAGE_SIZE,
          select: attendanceSelect,
        });

  return {
    status: "READY",
    page,
    pageSize: MEMBER_ATTENDANCE_PAGE_SIZE,
    pageCount,
    totalCount,
    records: rows.map((row) => ({
      serviceName: row.serviceName,
      attendanceDate: row.attendanceDate,
      statusLabel: formatEnumLabel(attendanceTypeOptions, row.attendanceType),
      eventTitle: publicEventTitle(row.event, organization.id),
    })),
  };
}
