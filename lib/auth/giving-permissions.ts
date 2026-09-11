import { currentUser } from "@clerk/nextjs/server";

import { RoleCode } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";

export type GivingAccess = {
  canViewGiving: boolean;
  canViewStatements: boolean;
  canManageStatements: boolean;
  canExportGiving: boolean;
  roleCode: RoleCode | null;
  isSuperAdmin: boolean;
};

export function getGivingCapabilitiesForRole(
  roleCode: RoleCode | null,
  isSuperAdmin = false,
): GivingAccess {
  if (isSuperAdmin || roleCode === RoleCode.ORG_ADMIN) {
    return {
      canViewGiving: true,
      canViewStatements: true,
      canManageStatements: true,
      canExportGiving: true,
      roleCode: roleCode ?? RoleCode.ORG_ADMIN,
      isSuperAdmin,
    };
  }
  if (roleCode === RoleCode.TREASURER) {
    return {
      canViewGiving: true,
      canViewStatements: true,
      canManageStatements: true,
      canExportGiving: true,
      roleCode,
      isSuperAdmin: false,
    };
  }
  if (roleCode === RoleCode.REPORT_VIEWER) {
    return {
      canViewGiving: true,
      canViewStatements: true,
      canManageStatements: false,
      canExportGiving: true,
      roleCode,
      isSuperAdmin: false,
    };
  }
  if (roleCode === RoleCode.DATA_ENTRY) {
    return {
      canViewGiving: true,
      canViewStatements: false,
      canManageStatements: false,
      canExportGiving: false,
      roleCode,
      isSuperAdmin: false,
    };
  }
  return {
    canViewGiving: false,
    canViewStatements: false,
    canManageStatements: false,
    canExportGiving: false,
    roleCode,
    isSuperAdmin: false,
  };
}

export async function getGivingAccess(organizationId: string) {
  const clerkUser = await currentUser();
  const isSuperAdmin =
    clerkUser?.publicMetadata?.role === "super_admin" ||
    clerkUser?.publicMetadata?.bitsRole === "SUPER_ADMIN";
  if (isSuperAdmin) {
    return getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN, true);
  }

  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return getGivingCapabilitiesForRole(null);
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      organizationId,
      userAccountId: userAccount.id,
      active: true,
    },
    include: { roleType: { select: { code: true } } },
  });
  return getGivingCapabilitiesForRole(membership?.roleType.code ?? null);
}

export async function requireStatementViewAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canViewStatements) {
    throw new Error("You do not have permission to view contribution statements.");
  }
  return access;
}

export async function requireUnmatchedGiftViewAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canViewStatements) {
    throw new Error("You do not have permission to review unmatched gifts.");
  }
  return access;
}

export async function requireUnmatchedGiftMatchAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canManageStatements) {
    throw new Error("You do not have permission to match online gifts.");
  }
  return access;
}
