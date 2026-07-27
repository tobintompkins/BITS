import { RoleCode } from "@/app/generated/prisma/client";
import { currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db/prisma";

import { getOrCreateUserAccount } from "./user-account";

export { formatMembershipStatus } from "@/lib/constants/membership-status";

export type MemberAccess = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canImportExport: boolean;
  roleCode: RoleCode | null;
  isSuperAdmin: boolean;
};

const STAFF_ROLES: RoleCode[] = [RoleCode.ORG_ADMIN, RoleCode.TREASURER, RoleCode.DATA_ENTRY];
const VOLUNTEER_ROLES: RoleCode[] = [RoleCode.REPORT_VIEWER];

export async function getMemberAccess(
  organizationId?: string,
): Promise<MemberAccess> {
  const clerkUser = await currentUser();
  const isSuperAdmin =
    clerkUser?.publicMetadata?.role === "super_admin" ||
    clerkUser?.publicMetadata?.bitsRole === "SUPER_ADMIN";

  if (isSuperAdmin) {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canImportExport: true,
      roleCode: RoleCode.ORG_ADMIN,
      isSuperAdmin: true,
    };
  }

  const userAccount = await getOrCreateUserAccount();

  if (!userAccount) {
    return noAccess();
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userAccountId: userAccount.id,
      active: true,
      ...(organizationId ? { organizationId } : {}),
    },
    include: { roleType: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    return noAccess();
  }

  const { code } = membership.roleType;

  if (code === RoleCode.ORG_ADMIN) {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canImportExport: true,
      roleCode: code,
      isSuperAdmin: false,
    };
  }

  if (STAFF_ROLES.includes(code)) {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canImportExport: true,
      roleCode: code,
      isSuperAdmin: false,
    };
  }

  if (VOLUNTEER_ROLES.includes(code)) {
    return {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canImportExport: false,
      roleCode: code,
      isSuperAdmin: false,
    };
  }

  return noAccess();
}

function noAccess(): MemberAccess {
  return {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canImportExport: false,
    roleCode: null,
    isSuperAdmin: false,
  };
}

export async function requireMemberViewAccess(organizationId: string) {
  const access = await getMemberAccess(organizationId);

  if (!access.canView) {
    throw new Error("You do not have permission to view members.");
  }

  return access;
}

export async function requireMemberCreateAccess(organizationId: string) {
  const access = await getMemberAccess(organizationId);

  if (!access.canCreate) {
    throw new Error("You do not have permission to add members.");
  }

  return access;
}

export async function requireMemberEditAccess(organizationId: string) {
  const access = await getMemberAccess(organizationId);

  if (!access.canEdit) {
    throw new Error("You do not have permission to edit members.");
  }

  return access;
}

export async function requireMemberImportExportAccess(organizationId: string) {
  const access = await getMemberAccess(organizationId);

  if (!access.canImportExport) {
    throw new Error("You do not have permission to import or export members.");
  }

  return access;
}

export async function requireMemberDeleteAccess(organizationId: string) {
  const access = await getMemberAccess(organizationId);

  if (!access.canDelete) {
    throw new Error("You do not have permission to delete members.");
  }

  return access;
}
