import { currentUser } from "@clerk/nextjs/server";

import { RoleCode } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

import { getOrCreateUserAccount } from "./user-account";

const EDIT_ROLES: RoleCode[] = [RoleCode.ORG_ADMIN];

export type OrganizationAccess = {
  canEdit: boolean;
  isReadOnly: boolean;
  roleCode: RoleCode | null;
  isSuperAdmin: boolean;
};

export async function getOrganizationAccess(
  organizationId?: string,
): Promise<OrganizationAccess> {
  const clerkUser = await currentUser();
  const isSuperAdmin =
    clerkUser?.publicMetadata?.role === "super_admin" ||
    clerkUser?.publicMetadata?.bitsRole === "SUPER_ADMIN";

  if (isSuperAdmin) {
    return {
      canEdit: true,
      isReadOnly: false,
      roleCode: RoleCode.ORG_ADMIN,
      isSuperAdmin: true,
    };
  }

  const userAccount = await getOrCreateUserAccount();

  if (!userAccount) {
    return {
      canEdit: false,
      isReadOnly: true,
      roleCode: null,
      isSuperAdmin: false,
    };
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userAccountId: userAccount.id,
      active: true,
      ...(organizationId ? { organizationId } : {}),
    },
    include: {
      roleType: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!membership) {
    return {
      canEdit: false,
      isReadOnly: true,
      roleCode: null,
      isSuperAdmin: false,
    };
  }

  const canEdit = EDIT_ROLES.includes(membership.roleType.code);

  return {
    canEdit,
    isReadOnly: !canEdit,
    roleCode: membership.roleType.code,
    isSuperAdmin: false,
  };
}

export async function requireOrganizationEditAccess(organizationId?: string) {
  if (!organizationId) {
    const clerkUser = await currentUser();
    const isSuperAdmin =
      clerkUser?.publicMetadata?.role === "super_admin" ||
      clerkUser?.publicMetadata?.bitsRole === "SUPER_ADMIN";

    if (isSuperAdmin) {
      return {
        canEdit: true,
        isReadOnly: false,
        roleCode: RoleCode.ORG_ADMIN,
        isSuperAdmin: true,
      };
    }

    const organizationCount = await prisma.organization.count();

    if (organizationCount === 0) {
      return {
        canEdit: true,
        isReadOnly: false,
        roleCode: RoleCode.ORG_ADMIN,
        isSuperAdmin: false,
      };
    }

    throw new Error(
      "You do not have permission to edit organization settings.",
    );
  }

  const access = await getOrganizationAccess(organizationId);

  if (!access.canEdit) {
    throw new Error(
      "You do not have permission to edit organization settings.",
    );
  }

  return access;
}
