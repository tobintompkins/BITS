import { RoleCode } from "@/app/generated/prisma/client";
import { currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "./user-account";

export type MemberLifecycleAccess = {
  canViewLifecycle: boolean;
  canMarkInactive: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canMarkDeceased: boolean;
  canViewArchived: boolean;
  canViewDeceased: boolean;
  canViewMerged: boolean;
  canRunDuplicateScan: boolean;
  canReviewDuplicates: boolean;
  canMergeMembers: boolean;
  canManagePreferences: boolean;
  canViewConsentHistory: boolean;
  canCorrectConsentHistory: boolean;
  canViewLifecycleAudit: boolean;
  roleCode: RoleCode | null;
  isSuperAdmin: boolean;
  userAccountId: string | null;
};

function noAccess(): MemberLifecycleAccess {
  return {
    canViewLifecycle: false,
    canMarkInactive: false,
    canArchive: false,
    canRestore: false,
    canMarkDeceased: false,
    canViewArchived: false,
    canViewDeceased: false,
    canViewMerged: false,
    canRunDuplicateScan: false,
    canReviewDuplicates: false,
    canMergeMembers: false,
    canManagePreferences: false,
    canViewConsentHistory: false,
    canCorrectConsentHistory: false,
    canViewLifecycleAudit: false,
    roleCode: null,
    isSuperAdmin: false,
    userAccountId: null,
  };
}

export async function getMemberLifecycleAccess(
  organizationId?: string,
): Promise<MemberLifecycleAccess> {
  const clerkUser = await currentUser();
  const isSuperAdmin =
    clerkUser?.publicMetadata?.role === "super_admin" ||
    clerkUser?.publicMetadata?.bitsRole === "SUPER_ADMIN";
  const userAccount = await getOrCreateUserAccount();

  if (isSuperAdmin) {
    return {
      canViewLifecycle: true,
      canMarkInactive: true,
      canArchive: true,
      canRestore: true,
      canMarkDeceased: true,
      canViewArchived: true,
      canViewDeceased: true,
      canViewMerged: true,
      canRunDuplicateScan: true,
      canReviewDuplicates: true,
      canMergeMembers: true,
      canManagePreferences: true,
      canViewConsentHistory: true,
      canCorrectConsentHistory: true,
      canViewLifecycleAudit: true,
      roleCode: RoleCode.ORG_ADMIN,
      isSuperAdmin: true,
      userAccountId: userAccount?.id ?? null,
    };
  }

  if (!userAccount) return noAccess();

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userAccountId: userAccount.id,
      active: true,
      ...(organizationId ? { organizationId } : {}),
    },
    include: { roleType: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) return noAccess();

  const { code } = membership.roleType;

  if (code === RoleCode.ORG_ADMIN) {
    return {
      canViewLifecycle: true,
      canMarkInactive: true,
      canArchive: true,
      canRestore: true,
      canMarkDeceased: true,
      canViewArchived: true,
      canViewDeceased: true,
      canViewMerged: true,
      canRunDuplicateScan: true,
      canReviewDuplicates: true,
      canMergeMembers: true,
      canManagePreferences: true,
      canViewConsentHistory: true,
      canCorrectConsentHistory: false,
      canViewLifecycleAudit: true,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    };
  }

  // Staff
  if (code === RoleCode.TREASURER || code === RoleCode.DATA_ENTRY) {
    return {
      canViewLifecycle: true,
      canMarkInactive: false,
      canArchive: false,
      canRestore: false,
      canMarkDeceased: false,
      canViewArchived: false,
      canViewDeceased: false,
      canViewMerged: false,
      canRunDuplicateScan: false,
      canReviewDuplicates: false,
      canMergeMembers: false,
      canManagePreferences: true,
      canViewConsentHistory: true,
      canCorrectConsentHistory: false,
      canViewLifecycleAudit: false,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    };
  }

  // Volunteer
  if (code === RoleCode.REPORT_VIEWER) {
    return {
      canViewLifecycle: true,
      canMarkInactive: false,
      canArchive: false,
      canRestore: false,
      canMarkDeceased: false,
      canViewArchived: false,
      canViewDeceased: false,
      canViewMerged: false,
      canRunDuplicateScan: false,
      canReviewDuplicates: false,
      canMergeMembers: false,
      canManagePreferences: false,
      canViewConsentHistory: false,
      canCorrectConsentHistory: false,
      canViewLifecycleAudit: false,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    };
  }

  return noAccess();
}

export async function requireLifecyclePermission(
  organizationId: string,
  check: (access: MemberLifecycleAccess) => boolean,
  message: string,
) {
  const access = await getMemberLifecycleAccess(organizationId);
  if (!check(access)) {
    throw new Error(message);
  }
  return access;
}
