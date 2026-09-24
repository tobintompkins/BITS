import { currentUser } from "@clerk/nextjs/server";

import { RoleCode } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";

export type AnnouncementAccess = {
  canManageAnnouncements: boolean;
  roleCode: RoleCode | null;
  isSuperAdmin: boolean;
  userAccountId: string | null;
};

export function getAnnouncementCapabilitiesForRole(
  roleCode: RoleCode | null,
  isSuperAdmin = false,
  userAccountId: string | null = null,
): AnnouncementAccess {
  if (isSuperAdmin || roleCode === RoleCode.ORG_ADMIN) {
    return {
      canManageAnnouncements: true,
      roleCode: roleCode ?? RoleCode.ORG_ADMIN,
      isSuperAdmin,
      userAccountId,
    };
  }

  return {
    canManageAnnouncements: false,
    roleCode,
    isSuperAdmin: false,
    userAccountId,
  };
}

export async function getAnnouncementAccess(organizationId: string) {
  const clerkUser = await currentUser();
  const isSuperAdmin =
    clerkUser?.publicMetadata?.role === "super_admin" ||
    clerkUser?.publicMetadata?.bitsRole === "SUPER_ADMIN";
  const userAccount = await getOrCreateUserAccount();

  if (isSuperAdmin) {
    return getAnnouncementCapabilitiesForRole(
      RoleCode.ORG_ADMIN,
      true,
      userAccount?.id ?? null,
    );
  }

  if (!userAccount) {
    return getAnnouncementCapabilitiesForRole(null);
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      organizationId,
      userAccountId: userAccount.id,
      active: true,
    },
    include: { roleType: { select: { code: true } } },
  });

  return getAnnouncementCapabilitiesForRole(
    membership?.roleType.code ?? null,
    false,
    userAccount.id,
  );
}

export async function requireAnnouncementManageAccess(organizationId: string) {
  const access = await getAnnouncementAccess(organizationId);
  if (!access.canManageAnnouncements) {
    throw new Error(
      "You do not have permission to manage church announcements.",
    );
  }
  return access;
}
