import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { formatEngagementEnumLabel, memberMinistryRoleOptions } from "@/lib/constants/member-engagement";
import { prisma } from "@/lib/db/prisma";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberMinistryAssignment = {
  ministryName: string;
  roleLabel: string;
  joinedDate: Date | null;
  description: string | null;
  meetingSchedule: string | null;
  location: string | null;
};

export type MemberMinistriesResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "READY"; ministries: MemberMinistryAssignment[] };

const assignmentSelect = {
  role: true,
  joinedDate: true,
  ministry: {
    select: {
      name: true,
      description: true,
      meetingSchedule: true,
      location: true,
    },
  },
} as const;

/**
 * Read-only ministry assignments for the signed-in member.
 * Account, organization, and member are resolved server-side only.
 * Client identity fields are ignored. Email and name are never used to match.
 */
export async function getMemberMinistries(): Promise<MemberMinistriesResult> {
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

  const rows = await prisma.memberMinistry.findMany({
    where: {
      memberId: member.id,
      status: "ACTIVE",
      endedDate: null,
      ministry: {
        organizationId: organization.id,
        isActive: true,
      },
    },
    orderBy: { ministry: { name: "asc" } },
    select: assignmentSelect,
  });

  return {
    status: "READY",
    ministries: rows.map((row) => ({
      ministryName: row.ministry.name,
      roleLabel: formatEngagementEnumLabel(memberMinistryRoleOptions, row.role),
      joinedDate: row.joinedDate,
      description: row.ministry.description,
      meetingSchedule: row.ministry.meetingSchedule,
      location: row.ministry.location,
    })),
  };
}
