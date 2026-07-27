import { RoleCode } from "@/app/generated/prisma/client";
import { currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db/prisma";
import {
  canViewPrayerPrivacy,
  sanitizePastoralNoteForAccess,
} from "@/lib/auth/care-privacy";
import { getOrCreateUserAccount } from "./user-account";

export { canViewPrayerPrivacy, sanitizePastoralNoteForAccess };

export type CareAccess = {
  canViewAttendance: boolean;
  canManageAttendance: boolean;
  canViewFollowUps: boolean;
  canManageFollowUps: boolean;
  canViewPastoralCare: boolean;
  canManagePastoralCare: boolean;
  canViewConfidentialPastoralCare: boolean;
  canViewPrayerRequests: boolean;
  canManagePrayerRequests: boolean;
  canViewPastoralStaffPrayer: boolean;
  canViewPrivatePrayer: boolean;
  canViewCommunications: boolean;
  canManageCommunications: boolean;
  canDelete: boolean;
  roleCode: RoleCode | null;
  isSuperAdmin: boolean;
  userAccountId: string | null;
};

function noAccess(): CareAccess {
  return {
    canViewAttendance: false,
    canManageAttendance: false,
    canViewFollowUps: false,
    canManageFollowUps: false,
    canViewPastoralCare: false,
    canManagePastoralCare: false,
    canViewConfidentialPastoralCare: false,
    canViewPrayerRequests: false,
    canManagePrayerRequests: false,
    canViewPastoralStaffPrayer: false,
    canViewPrivatePrayer: false,
    canViewCommunications: false,
    canManageCommunications: false,
    canDelete: false,
    roleCode: null,
    isSuperAdmin: false,
    userAccountId: null,
  };
}

export async function getCareAccess(organizationId?: string): Promise<CareAccess> {
  const clerkUser = await currentUser();
  const isSuperAdmin =
    clerkUser?.publicMetadata?.role === "super_admin" ||
    clerkUser?.publicMetadata?.bitsRole === "SUPER_ADMIN";

  const userAccount = await getOrCreateUserAccount();

  if (isSuperAdmin) {
    return {
      canViewAttendance: true,
      canManageAttendance: true,
      canViewFollowUps: true,
      canManageFollowUps: true,
      canViewPastoralCare: true,
      canManagePastoralCare: true,
      canViewConfidentialPastoralCare: true,
      canViewPrayerRequests: true,
      canManagePrayerRequests: true,
      canViewPastoralStaffPrayer: true,
      canViewPrivatePrayer: true,
      canViewCommunications: true,
      canManageCommunications: true,
      canDelete: true,
      roleCode: RoleCode.ORG_ADMIN,
      isSuperAdmin: true,
      userAccountId: userAccount?.id ?? null,
    };
  }

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
      canViewAttendance: true,
      canManageAttendance: true,
      canViewFollowUps: true,
      canManageFollowUps: true,
      canViewPastoralCare: true,
      canManagePastoralCare: true,
      canViewConfidentialPastoralCare: true,
      canViewPrayerRequests: true,
      canManagePrayerRequests: true,
      canViewPastoralStaffPrayer: true,
      canViewPrivatePrayer: false,
      canViewCommunications: true,
      canManageCommunications: true,
      canDelete: true,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    };
  }

  if (code === RoleCode.TREASURER || code === RoleCode.DATA_ENTRY) {
    return {
      canViewAttendance: true,
      canManageAttendance: true,
      canViewFollowUps: true,
      canManageFollowUps: true,
      canViewPastoralCare: false,
      canManagePastoralCare: false,
      canViewConfidentialPastoralCare: false,
      canViewPrayerRequests: true,
      canManagePrayerRequests: true,
      canViewPastoralStaffPrayer: false,
      canViewPrivatePrayer: false,
      canViewCommunications: true,
      canManageCommunications: true,
      canDelete: false,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    };
  }

  if (code === RoleCode.REPORT_VIEWER) {
    return {
      canViewAttendance: true,
      canManageAttendance: true,
      canViewFollowUps: false,
      canManageFollowUps: false,
      canViewPastoralCare: false,
      canManagePastoralCare: false,
      canViewConfidentialPastoralCare: false,
      canViewPrayerRequests: false,
      canManagePrayerRequests: false,
      canViewPastoralStaffPrayer: false,
      canViewPrivatePrayer: false,
      canViewCommunications: false,
      canManageCommunications: false,
      canDelete: false,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    };
  }

  return noAccess();
}

export async function requireCarePermission(
  organizationId: string,
  check: (access: CareAccess) => boolean,
  message: string,
) {
  const access = await getCareAccess(organizationId);
  if (!check(access)) {
    throw new Error(message);
  }
  return access;
}
