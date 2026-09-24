import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  formatEngagementEnumLabel,
  membershipMilestoneTypeOptions,
} from "@/lib/constants/member-engagement";
import { prisma } from "@/lib/db/prisma";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberMilestoneRecord = {
  typeLabel: string;
  title: string;
  milestoneDate: Date;
  location: string | null;
  officiant: string | null;
};

export type MemberMilestonesResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "READY"; milestones: MemberMilestoneRecord[] };

const milestoneSelect = {
  milestoneType: true,
  title: true,
  milestoneDate: true,
  location: true,
  officiant: true,
} as const;

/**
 * Read-only church milestones for the signed-in linked member.
 * Account, organization, and member are resolved server-side only.
 */
export async function getMemberMilestones(): Promise<MemberMilestonesResult> {
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

  const rows = await prisma.memberMilestone.findMany({
    where: {
      organizationId: organization.id,
      memberId: member.id,
    },
    orderBy: [{ milestoneDate: "desc" }, { title: "asc" }],
    select: milestoneSelect,
  });

  return {
    status: "READY",
    milestones: rows.map((row) => ({
      typeLabel: formatEngagementEnumLabel(
        membershipMilestoneTypeOptions,
        row.milestoneType,
      ),
      title: row.title,
      milestoneDate: row.milestoneDate,
      location: row.location,
      officiant: row.officiant,
    })),
  };
}
