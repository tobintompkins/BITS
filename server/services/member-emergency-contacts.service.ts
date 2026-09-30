import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { emergencyContactPrimaryStatusLabel } from "@/lib/validation/member-emergency-contacts";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberEmergencyContactRow = {
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
  primaryStatusLabel: string;
};

export type MemberEmergencyContactsView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "READY"; rows: MemberEmergencyContactRow[] };

const contactSelect = {
  name: true,
  relationship: true,
  phone: true,
  email: true,
  isPrimary: true,
} as const;

/**
 * Read-only emergency contacts for the signed-in linked member.
 * Account, organization, and member are resolved server-side only.
 * Client identity fields are ignored. Email and name are never used to match.
 */
export async function getMemberEmergencyContacts(): Promise<MemberEmergencyContactsView> {
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

  const records = await prisma.memberEmergencyContact.findMany({
    where: {
      memberId: member.id,
      member: { organizationId: organization.id },
    },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    select: contactSelect,
  });

  return {
    status: "READY",
    rows: records.map((row) => ({
      name: row.name,
      relationship: row.relationship,
      phone: row.phone,
      email: row.email,
      isPrimary: row.isPrimary,
      primaryStatusLabel: emergencyContactPrimaryStatusLabel(row.isPrimary),
    })),
  };
}
