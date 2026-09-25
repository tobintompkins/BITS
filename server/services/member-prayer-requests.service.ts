import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  formatEnumLabel,
  prayerPrivacyLevelOptions,
  prayerRequestStatusOptions,
} from "@/lib/constants/care-engagement";
import { prisma } from "@/lib/db/prisma";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberPrayerRequestRecord = {
  request: string;
  submittedAt: Date;
  statusLabel: string;
  privacyLabel: string;
  answeredAt: Date | null;
};

export type MemberPrayerRequestsResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "READY"; requests: MemberPrayerRequestRecord[] };

const prayerSelect = {
  request: true,
  createdAt: true,
  status: true,
  privacyLevel: true,
  answeredAt: true,
} as const;

/**
 * Read-only prayer requests connected to the signed-in linked member.
 * Account, organization, and member are resolved server-side only.
 */
export async function getMemberPrayerRequests(): Promise<MemberPrayerRequestsResult> {
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

  const rows = await prisma.prayerRequest.findMany({
    where: {
      organizationId: organization.id,
      memberId: member.id,
    },
    orderBy: [{ createdAt: "desc" }, { request: "asc" }],
    select: prayerSelect,
  });

  return {
    status: "READY",
    requests: rows.map((row) => ({
      request: row.request,
      submittedAt: row.createdAt,
      statusLabel: formatEnumLabel(prayerRequestStatusOptions, row.status),
      privacyLabel: formatEnumLabel(prayerPrivacyLevelOptions, row.privacyLevel),
      answeredAt: row.answeredAt,
    })),
  };
}
