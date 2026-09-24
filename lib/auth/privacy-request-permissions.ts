import { currentUser } from "@clerk/nextjs/server";

import { RoleCode } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";

export type PrivacyRequestAccess = {
  canReviewPrivacyRequests: boolean;
  roleCode: RoleCode | null;
  isSuperAdmin: boolean;
  userAccountId: string | null;
};

export function getPrivacyRequestCapabilitiesForRole(
  roleCode: RoleCode | null,
  isSuperAdmin = false,
  userAccountId: string | null = null,
): PrivacyRequestAccess {
  if (isSuperAdmin || roleCode === RoleCode.ORG_ADMIN) {
    return {
      canReviewPrivacyRequests: true,
      roleCode: roleCode ?? RoleCode.ORG_ADMIN,
      isSuperAdmin,
      userAccountId,
    };
  }

  return {
    canReviewPrivacyRequests: false,
    roleCode,
    isSuperAdmin: false,
    userAccountId,
  };
}

export async function getPrivacyRequestAccess(organizationId: string) {
  const clerkUser = await currentUser();
  const isSuperAdmin =
    clerkUser?.publicMetadata?.role === "super_admin" ||
    clerkUser?.publicMetadata?.bitsRole === "SUPER_ADMIN";
  const userAccount = await getOrCreateUserAccount();

  if (isSuperAdmin) {
    return getPrivacyRequestCapabilitiesForRole(
      RoleCode.ORG_ADMIN,
      true,
      userAccount?.id ?? null,
    );
  }

  if (!userAccount) {
    return getPrivacyRequestCapabilitiesForRole(null);
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      organizationId,
      userAccountId: userAccount.id,
      active: true,
    },
    include: { roleType: { select: { code: true } } },
  });

  return getPrivacyRequestCapabilitiesForRole(
    membership?.roleType.code ?? null,
    false,
    userAccount.id,
  );
}
