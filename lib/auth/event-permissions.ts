import { RoleCode } from "@/app/generated/prisma/client";
import { currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "./user-account";

export type EventAccess = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canCancel: boolean;
  canArchive: boolean;
  canDeleteDraft: boolean;
  canManageRegistration: boolean;
  canReadSensitiveAttendee: boolean;
  /** Alias for canOperateCheckIn — preserved for Blueprint 7.2 call sites. */
  canCheckIn: boolean;
  canReadCheckIn: boolean;
  canOperateCheckIn: boolean;
  canManageCheckIn: boolean;
  canCreateWalkIn: boolean;
  canCorrectAttendance: boolean;
  canExportAttendance: boolean;
  canExportRegistrations: boolean;
  canManageCategories: boolean;
  canManageLocations: boolean;
  canManageOrganizers: boolean;
  canManageMinistries: boolean;
  canViewPrivate: boolean;
  canViewStaffOnly: boolean;
  canViewDrafts: boolean;
  roleCode: RoleCode | null;
  isSuperAdmin: boolean;
  userAccountId: string | null;
};

function noAccess(): EventAccess {
  return {
    canView: false,
    canCreate: false,
    canEdit: false,
    canPublish: false,
    canCancel: false,
    canArchive: false,
    canDeleteDraft: false,
    canManageRegistration: false,
    canReadSensitiveAttendee: false,
    canCheckIn: false,
    canReadCheckIn: false,
    canOperateCheckIn: false,
    canManageCheckIn: false,
    canCreateWalkIn: false,
    canCorrectAttendance: false,
    canExportAttendance: false,
    canExportRegistrations: false,
    canManageCategories: false,
    canManageLocations: false,
    canManageOrganizers: false,
    canManageMinistries: false,
    canViewPrivate: false,
    canViewStaffOnly: false,
    canViewDrafts: false,
    roleCode: null,
    isSuperAdmin: false,
    userAccountId: null,
  };
}

function withCheckInFull(base: Omit<EventAccess, never>): EventAccess {
  return {
    ...base,
    canCheckIn: true,
    canReadCheckIn: true,
    canOperateCheckIn: true,
    canManageCheckIn: true,
    canCreateWalkIn: true,
    canCorrectAttendance: true,
    canExportAttendance: true,
  };
}

export async function getEventAccess(organizationId?: string): Promise<EventAccess> {
  const clerkUser = await currentUser();
  const isSuperAdmin =
    clerkUser?.publicMetadata?.role === "super_admin" ||
    clerkUser?.publicMetadata?.bitsRole === "SUPER_ADMIN";
  const userAccount = await getOrCreateUserAccount();

  if (isSuperAdmin) {
    return withCheckInFull({
      canView: true,
      canCreate: true,
      canEdit: true,
      canPublish: true,
      canCancel: true,
      canArchive: true,
      canDeleteDraft: true,
      canManageRegistration: true,
      canReadSensitiveAttendee: true,
      canCheckIn: true,
      canReadCheckIn: true,
      canOperateCheckIn: true,
      canManageCheckIn: true,
      canCreateWalkIn: true,
      canCorrectAttendance: true,
      canExportAttendance: true,
      canExportRegistrations: true,
      canManageCategories: true,
      canManageLocations: true,
      canManageOrganizers: true,
      canManageMinistries: true,
      canViewPrivate: true,
      canViewStaffOnly: true,
      canViewDrafts: true,
      roleCode: RoleCode.ORG_ADMIN,
      isSuperAdmin: true,
      userAccountId: userAccount?.id ?? null,
    });
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
    return withCheckInFull({
      canView: true,
      canCreate: true,
      canEdit: true,
      canPublish: true,
      canCancel: true,
      canArchive: true,
      canDeleteDraft: true,
      canManageRegistration: true,
      canReadSensitiveAttendee: true,
      canCheckIn: true,
      canReadCheckIn: true,
      canOperateCheckIn: true,
      canManageCheckIn: true,
      canCreateWalkIn: true,
      canCorrectAttendance: true,
      canExportAttendance: true,
      canExportRegistrations: true,
      canManageCategories: true,
      canManageLocations: true,
      canManageOrganizers: true,
      canManageMinistries: true,
      canViewPrivate: true,
      canViewStaffOnly: true,
      canViewDrafts: true,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    });
  }

  if (code === RoleCode.TREASURER || code === RoleCode.DATA_ENTRY) {
    const isDataEntry = code === RoleCode.DATA_ENTRY;
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canPublish: false,
      canCancel: false,
      canArchive: false,
      canDeleteDraft: true,
      canManageRegistration: true,
      canReadSensitiveAttendee: isDataEntry,
      canCheckIn: true,
      canReadCheckIn: true,
      canOperateCheckIn: true,
      canManageCheckIn: isDataEntry,
      canCreateWalkIn: true,
      canCorrectAttendance: isDataEntry,
      canExportAttendance: true,
      canExportRegistrations: true,
      canManageCategories: false,
      canManageLocations: false,
      canManageOrganizers: true,
      canManageMinistries: true,
      canViewPrivate: false,
      canViewStaffOnly: true,
      canViewDrafts: true,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    };
  }

  if (code === RoleCode.REPORT_VIEWER) {
    return {
      ...noAccess(),
      canView: true,
      canReadCheckIn: true,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    };
  }

  return noAccess();
}

export async function requireEventPermission(
  organizationId: string,
  check: (access: EventAccess) => boolean,
  message: string,
) {
  const access = await getEventAccess(organizationId);
  if (!check(access)) {
    throw new Error(message);
  }
  return access;
}

/** Server-side visibility gate — never rely on client filtering alone. */
export function canViewEventVisibility(
  access: EventAccess,
  visibility: string,
  eventStatus: string,
) {
  if (!access.canView) return false;
  if (eventStatus === "DRAFT" && !access.canViewDrafts) return false;
  if (visibility === "PRIVATE") return access.canViewPrivate;
  if (visibility === "STAFF_ONLY") return access.canViewStaffOnly;
  if (visibility === "MEMBERS_ONLY") return access.canView;
  if (visibility === "PUBLIC") return access.canView;
  return false;
}
