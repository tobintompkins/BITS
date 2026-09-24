import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { formatHouseholdRelationship } from "@/lib/constants/household-relationships";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export const HOUSEHOLD_STATEMENT_AUTHORIZATION_EXPLANATION =
  "Household contribution statements appear in My Statements only when the church has designated you as the household statement recipient. Being listed in a household does not by itself grant access to household statements.";

const STATEMENT_DELIVERY_LABELS: Record<string, string> = {
  EMAIL: "Email",
  MAIL: "Mail",
  POSTAL: "Postal mail",
  POSTAL_MAIL: "Postal mail",
  PICKUP: "Pickup",
  PICK_UP: "Pickup",
  PICK_UP_AT_CHURCH: "Pick up at church",
};

export type MemberHouseholdMailingAddress = {
  mailingAddressLine1: string;
  mailingAddressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type MemberHouseholdSummary =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "NO_HOUSEHOLD" }
  | { status: "NEEDS_REVIEW" }
  | {
      status: "READY";
      household: {
        displayName: string;
        mailingAddress: MemberHouseholdMailingAddress;
        relationshipLabel: string | null;
        isPreferredStatementRecipient: boolean;
        statementDeliveryMethodLabel: string | null;
      };
      authorizationExplanation: string;
    };

function formatStatementDeliveryMethod(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const key = trimmed.toUpperCase().replaceAll(" ", "_");
  if (STATEMENT_DELIVERY_LABELS[key]) return STATEMENT_DELIVERY_LABELS[key];

  if (trimmed.includes(" ") || /[a-z]/.test(trimmed)) return trimmed;

  return trimmed
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatRelationshipLabel(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const formatted = formatHouseholdRelationship(trimmed);
  return formatted === "—" ? null : formatted;
}

/**
 * Member-facing household summary for the signed-in linked donor only.
 * Donor and household IDs are never taken from the URL or client.
 */
export async function getMemberHouseholdSummary(): Promise<MemberHouseholdSummary> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const donor = await prisma.donor.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      active: true,
    },
    select: { id: true },
  });
  if (!donor) {
    return {
      status: "CONNECTION_PENDING",
      accountEmail: userAccount.primaryEmail,
    };
  }

  const memberships = await prisma.householdMembership.findMany({
    where: {
      organizationId: organization.id,
      donorId: donor.id,
      endDate: null,
      household: {
        organizationId: organization.id,
        active: true,
      },
    },
    select: {
      relationshipLabel: true,
      household: {
        select: {
          displayName: true,
          mailingAddressLine1: true,
          mailingAddressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
          preferredStatementRecipientId: true,
          statementDeliveryMethod: true,
        },
      },
    },
  });

  if (memberships.length === 0) return { status: "NO_HOUSEHOLD" };
  if (memberships.length > 1) return { status: "NEEDS_REVIEW" };

  const membership = memberships[0];
  const household = membership.household;

  return {
    status: "READY",
    household: {
      displayName: household.displayName,
      mailingAddress: {
        mailingAddressLine1: household.mailingAddressLine1,
        mailingAddressLine2: household.mailingAddressLine2,
        city: household.city,
        state: household.state,
        postalCode: household.postalCode,
        country: household.country,
      },
      relationshipLabel: formatRelationshipLabel(membership.relationshipLabel),
      isPreferredStatementRecipient:
        household.preferredStatementRecipientId === donor.id,
      statementDeliveryMethodLabel: formatStatementDeliveryMethod(
        household.statementDeliveryMethod,
      ),
    },
    authorizationExplanation: HOUSEHOLD_STATEMENT_AUTHORIZATION_EXPLANATION,
  };
}
