import { getOrganizationAccess } from "@/lib/auth/permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  deriveBackupReadinessStatus,
  filterBackupReadinessHistory,
  parseBackupReadinessCreate,
  parseBackupReadinessFilter,
  toBackupReadinessLogRow,
  type BackupReadinessFilter,
  type BackupReadinessLogRow,
  type BackupReadinessResult,
  type BackupReadinessScope,
  type BackupReadinessScopeStatus,
} from "@/lib/validation/backup-readiness";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type BackupReadinessView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      currentByScope: BackupReadinessScopeStatus[];
      history: BackupReadinessLogRow[];
      filter: BackupReadinessFilter;
    };

export type BackupReadinessMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "CREATED" };

const listSelect = {
  id: true,
  scope: true,
  result: true,
  checkedAt: true,
  nextReviewAt: true,
  storageSummary: true,
  notes: true,
  createdAt: true,
  performedBy: {
    select: {
      displayName: true,
    },
  },
} as const;

function performerLabel(displayName: string | null | undefined) {
  const name = displayName?.trim();
  return name || "Church administrator";
}

async function requireBackupReadinessAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getOrganizationAccess(organization.id);
  if (!access.canEdit) return { status: "UNAUTHORIZED" as const };

  return {
    status: "READY" as const,
    userAccount,
    organization,
  };
}

function auditChanges(input: {
  scope: BackupReadinessScope;
  result: BackupReadinessResult;
  checkedAt: Date;
}) {
  return [
    { field: "scope", oldValue: null, newValue: input.scope },
    { field: "result", oldValue: null, newValue: input.result },
    {
      field: "checkedAt",
      oldValue: null,
      newValue: input.checkedAt.toISOString().slice(0, 10),
    },
  ];
}

export async function getBackupReadinessLog(
  input: unknown = {},
): Promise<BackupReadinessView> {
  const access = await requireBackupReadinessAccess();
  if (access.status !== "READY") return access;

  const parsed = parseBackupReadinessFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };

  const records = await prisma.backupReadinessLog.findMany({
    where: { organizationId: access.organization.id },
    select: listSelect,
    orderBy: [{ checkedAt: "desc" }, { createdAt: "desc" }],
  });

  const mapped = records.map((record) => ({
    id: record.id,
    scope: record.scope as BackupReadinessScope,
    result: record.result as BackupReadinessResult,
    checkedAt: record.checkedAt,
    createdAt: record.createdAt,
    nextReviewAt: record.nextReviewAt,
    storageSummary: record.storageSummary,
    notes: record.notes,
    performedByLabel: performerLabel(record.performedBy.displayName),
  }));

  return {
    status: "READY",
    currentByScope: deriveBackupReadinessStatus(mapped),
    history: filterBackupReadinessHistory(mapped, parsed.data).map(
      toBackupReadinessLogRow,
    ),
    filter: parsed.data,
  };
}

export async function createBackupReadinessLog(
  input: unknown,
): Promise<BackupReadinessMutationResult> {
  const access = await requireBackupReadinessAccess();
  if (access.status !== "READY") return access;

  const parsed = parseBackupReadinessCreate(input);
  if (!parsed.success) return { status: "INVALID" };

  const created = await prisma.backupReadinessLog.create({
    data: {
      organizationId: access.organization.id,
      scope: parsed.data.scope,
      result: parsed.data.result,
      checkedAt: parsed.data.checkedAt,
      nextReviewAt: parsed.data.nextReviewAt,
      storageSummary: parsed.data.storageSummary,
      notes: parsed.data.notes,
      performedByUserAccountId: access.userAccount.id,
    },
    select: { id: true },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CREATE_BACKUP_READINESS_LOG",
    entityType: "BackupReadinessLog",
    entityId: created.id,
    changes: auditChanges(parsed.data),
  });

  return { status: "CREATED" };
}
