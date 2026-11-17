export type AccountChurchSelection =
  | {
      status: "selected";
      organizationId: string;
      source: "clerk-membership" | "only-membership" | "saved-choice";
    }
  | {
      status: "none";
      reason: "no-membership" | "ambiguous" | "clerk-without-membership";
    };

/**
 * Chooses the signed-in church without using a church name or the oldest row.
 * A saved choice is honored only when it is one of the account's active memberships.
 * An active Clerk organization never falls through to a different church.
 */
export function selectChurchAfterSignIn(input: {
  clerkMappedOrganizationId: string | null;
  membershipOrganizationIds: readonly string[];
  savedOrganizationId: string | null;
}): AccountChurchSelection {
  const memberships = [...new Set(input.membershipOrganizationIds)];

  if (input.clerkMappedOrganizationId) {
    return memberships.includes(input.clerkMappedOrganizationId)
      ? {
          status: "selected",
          organizationId: input.clerkMappedOrganizationId,
          source: "clerk-membership",
        }
      : { status: "none", reason: "clerk-without-membership" };
  }

  if (memberships.length === 1) {
    return {
      status: "selected",
      organizationId: memberships[0],
      source: "only-membership",
    };
  }

  if (
    memberships.length > 1 &&
    input.savedOrganizationId &&
    memberships.includes(input.savedOrganizationId)
  ) {
    return {
      status: "selected",
      organizationId: input.savedOrganizationId,
      source: "saved-choice",
    };
  }

  return {
    status: "none",
    reason: memberships.length === 0 ? "no-membership" : "ambiguous",
  };
}
