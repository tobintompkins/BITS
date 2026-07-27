import { RoleCode } from "@/app/generated/prisma/client";
import { currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "./user-account";

export type MemberEngagementAccess = {
  canViewMilestones: boolean;
  canManageMilestones: boolean;
  canViewSpiritualGifts: boolean;
  canAssignSpiritualGifts: boolean;
  canManageSpiritualGiftCatalog: boolean;
  canViewMinistries: boolean;
  canManageMinistries: boolean;
  canManageMinistryRosters: boolean;
  canViewSkillsInterests: boolean;
  canManageSkillsInterests: boolean;
  canViewDocuments: boolean;
  canManageDocuments: boolean;
  canViewConfidentialDocuments: boolean;
  canManageConfidentialDocuments: boolean;
  canViewContactInSkillSearch: boolean;
  canExport: boolean;
  canDeleteCatalog: boolean;
  roleCode: RoleCode | null;
  isSuperAdmin: boolean;
  userAccountId: string | null;
};

function noAccess(): MemberEngagementAccess {
  return {
    canViewMilestones: false,
    canManageMilestones: false,
    canViewSpiritualGifts: false,
    canAssignSpiritualGifts: false,
    canManageSpiritualGiftCatalog: false,
    canViewMinistries: false,
    canManageMinistries: false,
    canManageMinistryRosters: false,
    canViewSkillsInterests: false,
    canManageSkillsInterests: false,
    canViewDocuments: false,
    canManageDocuments: false,
    canViewConfidentialDocuments: false,
    canManageConfidentialDocuments: false,
    canViewContactInSkillSearch: false,
    canExport: false,
    canDeleteCatalog: false,
    roleCode: null,
    isSuperAdmin: false,
    userAccountId: null,
  };
}

export async function getMemberEngagementAccess(
  organizationId?: string,
): Promise<MemberEngagementAccess> {
  const clerkUser = await currentUser();
  const isSuperAdmin =
    clerkUser?.publicMetadata?.role === "super_admin" ||
    clerkUser?.publicMetadata?.bitsRole === "SUPER_ADMIN";

  const userAccount = await getOrCreateUserAccount();

  if (isSuperAdmin) {
    return {
      canViewMilestones: true,
      canManageMilestones: true,
      canViewSpiritualGifts: true,
      canAssignSpiritualGifts: true,
      canManageSpiritualGiftCatalog: true,
      canViewMinistries: true,
      canManageMinistries: true,
      canManageMinistryRosters: true,
      canViewSkillsInterests: true,
      canManageSkillsInterests: true,
      canViewDocuments: true,
      canManageDocuments: true,
      canViewConfidentialDocuments: true,
      canManageConfidentialDocuments: true,
      canViewContactInSkillSearch: true,
      canExport: true,
      canDeleteCatalog: true,
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
      canViewMilestones: true,
      canManageMilestones: true,
      canViewSpiritualGifts: true,
      canAssignSpiritualGifts: true,
      canManageSpiritualGiftCatalog: true,
      canViewMinistries: true,
      canManageMinistries: true,
      canManageMinistryRosters: true,
      canViewSkillsInterests: true,
      canManageSkillsInterests: true,
      canViewDocuments: true,
      canManageDocuments: true,
      canViewConfidentialDocuments: true,
      canManageConfidentialDocuments: true,
      canViewContactInSkillSearch: true,
      canExport: true,
      canDeleteCatalog: true,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    };
  }

  // Staff (Treasurer / Data Entry) — manage involvement, no confidential docs
  if (code === RoleCode.TREASURER || code === RoleCode.DATA_ENTRY) {
    return {
      canViewMilestones: true,
      canManageMilestones: true,
      canViewSpiritualGifts: true,
      canAssignSpiritualGifts: true,
      canManageSpiritualGiftCatalog: false,
      canViewMinistries: true,
      canManageMinistries: false,
      canManageMinistryRosters: true,
      canViewSkillsInterests: true,
      canManageSkillsInterests: true,
      canViewDocuments: true,
      canManageDocuments: true,
      canViewConfidentialDocuments: false,
      canManageConfidentialDocuments: false,
      canViewContactInSkillSearch: true,
      canExport: true,
      canDeleteCatalog: false,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    };
  }

  // Volunteer / report viewer — limited ministry roster view only
  if (code === RoleCode.REPORT_VIEWER) {
    return {
      canViewMilestones: false,
      canManageMilestones: false,
      canViewSpiritualGifts: false,
      canAssignSpiritualGifts: false,
      canManageSpiritualGiftCatalog: false,
      canViewMinistries: true,
      canManageMinistries: false,
      canManageMinistryRosters: false,
      canViewSkillsInterests: false,
      canManageSkillsInterests: false,
      canViewDocuments: false,
      canManageDocuments: false,
      canViewConfidentialDocuments: false,
      canManageConfidentialDocuments: false,
      canViewContactInSkillSearch: false,
      canExport: false,
      canDeleteCatalog: false,
      roleCode: code,
      isSuperAdmin: false,
      userAccountId: userAccount.id,
    };
  }

  return noAccess();
}

export async function requireEngagementPermission(
  organizationId: string,
  check: (access: MemberEngagementAccess) => boolean,
  message: string,
) {
  const access = await getMemberEngagementAccess(organizationId);
  if (!check(access)) {
    throw new Error(message);
  }
  return access;
}

export function sanitizeDocumentForAccess<
  T extends {
    isConfidential: boolean;
    fileUrl: string;
    fileKey: string;
    description?: string | null;
  },
>(document: T, access: MemberEngagementAccess) {
  if (document.isConfidential && !access.canViewConfidentialDocuments) {
    return {
      ...document,
      fileUrl: "",
      fileKey: "",
      description: "[Confidential — restricted]",
      restricted: true as const,
    };
  }

  return { ...document, restricted: false as const };
}
