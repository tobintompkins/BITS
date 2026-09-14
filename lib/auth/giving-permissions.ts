import { currentUser } from "@clerk/nextjs/server";

import { RoleCode } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";

export type GivingAccess = {
  canViewGiving: boolean;
  canViewStatements: boolean;
  canManageStatements: boolean;
  canViewBatches: boolean;
  canManageBatches: boolean;
  canAddBatchDonations: boolean;
  canCompleteBatchEntry: boolean;
  canReconcileBatches: boolean;
  canRecordBatchDeposits: boolean;
  canLockBatches: boolean;
  canRequestFinancialCorrections: boolean;
  canReviewFinancialCorrections: boolean;
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
      canViewBatches: true,
      canManageBatches: true,
      canAddBatchDonations: true,
      canCompleteBatchEntry: true,
      canReconcileBatches: true,
      canRecordBatchDeposits: true,
      canLockBatches: true,
      canRequestFinancialCorrections: true,
      canReviewFinancialCorrections: true,
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
      canViewBatches: true,
      canManageBatches: true,
      canAddBatchDonations: true,
      canCompleteBatchEntry: true,
      canReconcileBatches: true,
      canRecordBatchDeposits: true,
      canLockBatches: true,
      canRequestFinancialCorrections: true,
      canReviewFinancialCorrections: true,
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
      canViewBatches: true,
      canManageBatches: false,
      canAddBatchDonations: false,
      canCompleteBatchEntry: false,
      canReconcileBatches: false,
      canRecordBatchDeposits: false,
      canLockBatches: false,
      canRequestFinancialCorrections: false,
      canReviewFinancialCorrections: false,
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
      canViewBatches: true,
      canManageBatches: true,
      canAddBatchDonations: true,
      canCompleteBatchEntry: true,
      canReconcileBatches: false,
      canRecordBatchDeposits: false,
      canLockBatches: false,
      canRequestFinancialCorrections: true,
      canReviewFinancialCorrections: false,
      canExportGiving: false,
      roleCode,
      isSuperAdmin: false,
    };
  }
  return {
    canViewGiving: false,
    canViewStatements: false,
    canManageStatements: false,
    canViewBatches: false,
    canManageBatches: false,
    canAddBatchDonations: false,
    canCompleteBatchEntry: false,
    canReconcileBatches: false,
    canRecordBatchDeposits: false,
    canLockBatches: false,
    canRequestFinancialCorrections: false,
    canReviewFinancialCorrections: false,
    canExportGiving: false,
    roleCode,
    isSuperAdmin: false,
  };
}

export async function requireFinancialCorrectionRequestAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canRequestFinancialCorrections) {
    throw new Error("You do not have permission to request financial corrections.");
  }
  return access;
}

export async function requireFinancialCorrectionReviewAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canReviewFinancialCorrections) {
    throw new Error("You do not have permission to review financial corrections.");
  }
  return access;
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

export async function requireBatchViewAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canViewBatches) {
    throw new Error("You do not have permission to view offering batches.");
  }
  return access;
}

export async function requireBatchManageAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canManageBatches) {
    throw new Error("You do not have permission to manage offering batches.");
  }
  return access;
}

export async function requireBatchDonationEntryAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canAddBatchDonations) {
    throw new Error(
      "You do not have permission to add donations to offering batches.",
    );
  }
  return access;
}

export async function requireBatchCompleteEntryAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canCompleteBatchEntry) {
    throw new Error(
      "You do not have permission to complete offering-batch entry.",
    );
  }
  return access;
}

export async function requireBatchReconcileAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canReconcileBatches) {
    throw new Error("You do not have permission to reconcile offering batches.");
  }
  return access;
}

export async function requireBatchDepositAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canRecordBatchDeposits) {
    throw new Error(
      "You do not have permission to record offering-batch deposits.",
    );
  }
  return access;
}

export async function requireBatchLockAccess(organizationId: string) {
  const access = await getGivingAccess(organizationId);
  if (!access.canLockBatches) {
    throw new Error("You do not have permission to lock offering batches.");
  }
  return access;
}
