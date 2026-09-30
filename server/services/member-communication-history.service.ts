import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  formatConsentHistoryChangedAt,
  formatConsentHistorySourceLabel,
  formatConsentHistoryTypeLabel,
  formatConsentHistoryValueLabel,
} from "@/lib/validation/member-communication-history";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberCommunicationHistoryRow = {
  preferenceLabel: string;
  previousValueLabel: string;
  newValueLabel: string;
  sourceLabel: string;
  changedAtLabel: string;
};

export type MemberCommunicationHistoryView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "READY"; rows: MemberCommunicationHistoryRow[] };

const historySelect = {
  consentType: true,
  previousValue: true,
  newValue: true,
  source: true,
  changedAt: true,
} as const;

/**
 * Read-only communication-consent history for the signed-in linked member.
 * Account, organization, and member are resolved server-side only.
 * Client identity fields are ignored. Email and name are never used to match.
 */
export async function getMemberCommunicationHistory(): Promise<MemberCommunicationHistoryView> {
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

  const records = await prisma.memberConsentHistory.findMany({
    where: {
      memberId: member.id,
      member: { organizationId: organization.id },
    },
    orderBy: { changedAt: "desc" },
    select: historySelect,
  });

  return {
    status: "READY",
    rows: records.map((row) => ({
      preferenceLabel: formatConsentHistoryTypeLabel(row.consentType),
      previousValueLabel: formatConsentHistoryValueLabel(row.previousValue),
      newValueLabel: formatConsentHistoryValueLabel(row.newValue),
      sourceLabel: formatConsentHistorySourceLabel(row.source),
      changedAtLabel: formatConsentHistoryChangedAt(row.changedAt),
    })),
  };
}
