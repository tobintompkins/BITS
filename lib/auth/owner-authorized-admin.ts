import { ChurchAccessStatus, RoleCode } from "@/app/generated/prisma/client";

export const OWNER_AUTHORIZED_DIRECT_ACCESS_ACTION =
  "OWNER_AUTHORIZED_DIRECT_ADMIN_ACCESS";

export type OwnerProvisionAccount = {
  id: string;
  clerkUserId: string;
  primaryEmail: string;
  appOwner: boolean;
};

export type OwnerProvisionMembership = {
  id: string;
  userAccountId: string;
  roleCode: RoleCode;
  active: boolean;
  churchAccess: ChurchAccessStatus;
};

export type OwnerAuthorizedAdminPlan =
  | {
      ok: false;
      code:
        | "MISSING_CHURCH"
        | "MISSING_OWNER"
        | "OTHER_OWNER"
        | "SAME_IDENTITY"
        | "DUPLICATE_ACCOUNT";
      message: string;
    }
  | {
      ok: true;
      organizationId: string;
      ownerAccountId: string;
      designateOwner: boolean;
      churchAdminAccountId: string | null;
      createAccount: boolean;
      membershipId: string | null;
      createMembership: boolean;
      updateMembership: boolean;
      alreadyActiveAdmin: boolean;
    };

export function planOwnerAuthorizedAdmin(input: {
  organizationId: string | null;
  ownerClerkUserId: string;
  churchAdminClerkUserId: string;
  churchAdminEmail: string;
  ownerAccount: OwnerProvisionAccount | null;
  otherOwnerAccountId: string | null;
  churchAdminAccount: OwnerProvisionAccount | null;
  emailAccount: OwnerProvisionAccount | null;
  membership: OwnerProvisionMembership | null;
}): OwnerAuthorizedAdminPlan {
  if (!input.organizationId) {
    return {
      ok: false,
      code: "MISSING_CHURCH",
      message: "The selected church was not found.",
    };
  }
  if (input.ownerClerkUserId === input.churchAdminClerkUserId) {
    return {
      ok: false,
      code: "SAME_IDENTITY",
      message: "The church administrator must use a separate sign-in.",
    };
  }
  if (!input.ownerAccount || input.ownerAccount.clerkUserId !== input.ownerClerkUserId) {
    return {
      ok: false,
      code: "MISSING_OWNER",
      message: "The existing owner account was not found.",
    };
  }
  if (
    input.otherOwnerAccountId &&
    input.otherOwnerAccountId !== input.ownerAccount.id
  ) {
    return {
      ok: false,
      code: "OTHER_OWNER",
      message: "Another protected owner already exists.",
    };
  }
  if (
    input.emailAccount &&
    input.emailAccount.clerkUserId !== input.churchAdminClerkUserId
  ) {
    return {
      ok: false,
      code: "DUPLICATE_ACCOUNT",
      message: "That email already belongs to a different sign-in.",
    };
  }
  if (
    input.churchAdminAccount &&
    input.churchAdminAccount.clerkUserId !== input.churchAdminClerkUserId
  ) {
    return {
      ok: false,
      code: "DUPLICATE_ACCOUNT",
      message: "That sign-in does not match the existing account.",
    };
  }

  const membership = input.membership;
  const alreadyActiveAdmin = Boolean(
    membership &&
      membership.roleCode === RoleCode.ORG_ADMIN &&
      membership.active &&
      membership.churchAccess === ChurchAccessStatus.ACTIVE,
  );

  return {
    ok: true,
    organizationId: input.organizationId,
    ownerAccountId: input.ownerAccount.id,
    designateOwner: input.ownerAccount.appOwner !== true,
    churchAdminAccountId: input.churchAdminAccount?.id ?? null,
    createAccount: !input.churchAdminAccount,
    membershipId: membership?.id ?? null,
    createMembership: !membership,
    updateMembership: Boolean(membership && !alreadyActiveAdmin),
    alreadyActiveAdmin,
  };
}
