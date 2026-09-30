import { getMemberAccess } from "@/lib/auth/member-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  collectUpcomingCelebrations,
  type UpcomingCelebrationCounts,
  type UpcomingCelebrationRow,
} from "@/lib/validation/upcoming-celebrations";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type UpcomingCelebrationsView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | {
      status: "READY";
      rows: UpcomingCelebrationRow[];
      counts: UpcomingCelebrationCounts;
      canViewMembers: boolean;
    };

const memberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  dateOfBirth: true,
} as const;

async function requireCelebrationsAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getMemberAccess(organization.id);
  if (!access.canView) return { status: "UNAUTHORIZED" as const };

  return {
    status: "READY" as const,
    organization,
    canViewMembers: access.canView,
  };
}

export async function getUpcomingCelebrations(
  now?: Date,
): Promise<UpcomingCelebrationsView> {
  const access = await requireCelebrationsAccess();
  if (access.status !== "READY") return access;

  const [members, marriages] = await Promise.all([
    prisma.member.findMany({
      where: {
        organizationId: access.organization.id,
        recordStatus: "ACTIVE",
      },
      select: memberSelect,
    }),
    prisma.memberMilestone.findMany({
      where: {
        organizationId: access.organization.id,
        milestoneType: "MARRIAGE",
        member: {
          organizationId: access.organization.id,
          recordStatus: "ACTIVE",
        },
      },
      select: {
        milestoneDate: true,
        member: { select: memberSelect },
      },
    }),
  ]);

  const collected = collectUpcomingCelebrations(members, marriages, now);

  return {
    status: "READY",
    rows: collected.rows,
    counts: collected.counts,
    canViewMembers: access.canViewMembers,
  };
}
