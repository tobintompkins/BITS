import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  VOLUNTEER_TRAINING_STATUS_LABELS,
  formatVolunteerTrainingDate,
  volunteerTrainingStatus,
} from "@/lib/validation/volunteer-training";
import type { VolunteerTrainingStatus } from "@/lib/validation/volunteer-training";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberVolunteerTrainingRow = {
  title: string;
  ministryName: string | null;
  completedOnLabel: string;
  expiresOnLabel: string | null;
  status: VolunteerTrainingStatus;
  statusLabel: string;
};

export type MemberVolunteerTrainingView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "READY"; rows: MemberVolunteerTrainingRow[] };

const trainingSelect = {
  title: true,
  completedOn: true,
  expiresOn: true,
  ministry: { select: { name: true } },
} as const;

/**
 * Read-only ordinary training for the signed-in linked member.
 * Account, organization, and member are resolved server-side only.
 * Client identity fields are ignored. Email and name are never used to match.
 */
export async function getMemberVolunteerTraining(
  now = new Date(),
): Promise<MemberVolunteerTrainingView> {
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

  const records = await prisma.volunteerTrainingRecord.findMany({
    where: {
      organizationId: organization.id,
      memberId: member.id,
      archivedAt: null,
    },
    orderBy: [{ expiresOn: "asc" }, { completedOn: "desc" }],
    select: trainingSelect,
  });

  return {
    status: "READY",
    rows: records.map((row) => {
      const status = volunteerTrainingStatus(row.expiresOn, now);
      return {
        title: row.title,
        ministryName: row.ministry?.name ?? null,
        completedOnLabel: formatVolunteerTrainingDate(row.completedOn),
        expiresOnLabel: row.expiresOn
          ? formatVolunteerTrainingDate(row.expiresOn)
          : null,
        status,
        statusLabel: VOLUNTEER_TRAINING_STATUS_LABELS[status],
      };
    }),
  };
}
