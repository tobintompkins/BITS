import { getOrganizationAccess } from "@/lib/auth/permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  DATA_RETENTION_CATEGORY_LABELS,
  countDataRetentionPolicies,
  formatDataRetentionDate,
  formatRetentionPeriod,
  isDataRetentionReviewDue,
  parseDataRetentionPolicyCreate,
  parseDataRetentionPolicyId,
  parseDataRetentionPolicyUpdate,
  type DataRetentionCategory,
  type DataRetentionPolicyCounts,
  type DataRetentionPolicyRow,
} from "@/lib/validation/data-retention-policy";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type DataRetentionPoliciesView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | {
      status: "READY";
      rows: DataRetentionPolicyRow[];
      counts: DataRetentionPolicyCounts;
      occupiedCategories: DataRetentionCategory[];
    };

export type DataRetentionPolicyMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "DUPLICATE_CATEGORY" }
  | { status: "CREATED" }
  | { status: "UPDATED" }
  | { status: "DEACTIVATED" }
  | { status: "REACTIVATED" };

const listSelect = {
  id: true,
  category: true,
  title: true,
  retentionPeriodMonths: true,
  policySummary: true,
  reviewDueAt: true,
  isActive: true,
  updatedAt: true,
} as const;

function isUniqueConstraintError(error: unknown) {
  return (error as { code?: string }).code === "P2002";
}

function toRow(record: {
  id: string;
  category: DataRetentionCategory;
  title: string;
  retentionPeriodMonths: number | null;
  policySummary: string;
  reviewDueAt: Date | null;
  isActive: boolean;
  updatedAt: Date;
}): DataRetentionPolicyRow {
  const reviewDue = isDataRetentionReviewDue(record.reviewDueAt);
  return {
    id: record.id,
    category: record.category,
    categoryLabel: DATA_RETENTION_CATEGORY_LABELS[record.category],
    title: record.title,
    retentionPeriodMonths: record.retentionPeriodMonths,
    retentionPeriodLabel: formatRetentionPeriod(record.retentionPeriodMonths),
    policySummary: record.policySummary,
    reviewDueAtIso: record.reviewDueAt
      ? record.reviewDueAt.toISOString().slice(0, 10)
      : null,
    reviewDueLabel: record.reviewDueAt
      ? formatDataRetentionDate(record.reviewDueAt)
      : "No review date",
    reviewDue,
    isActive: record.isActive,
    stateLabel: record.isActive ? "Active" : "Inactive",
    updatedOnLabel: formatDataRetentionDate(record.updatedAt),
  };
}

async function requirePolicyAccess() {
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
  category: string;
  isActive: boolean;
  retentionPeriodMonths: number | null;
}) {
  return [
    { field: "category", oldValue: null, newValue: input.category },
    {
      field: "status",
      oldValue: null,
      newValue: input.isActive ? "ACTIVE" : "INACTIVE",
    },
    {
      field: "retentionPeriodMonths",
      oldValue: null,
      newValue:
        input.retentionPeriodMonths == null
          ? "NONE"
          : String(input.retentionPeriodMonths),
    },
  ];
}

export async function getDataRetentionPolicies(): Promise<DataRetentionPoliciesView> {
  const access = await requirePolicyAccess();
  if (access.status !== "READY") return access;

  const records = await prisma.dataRetentionPolicy.findMany({
    where: { organizationId: access.organization.id },
    select: listSelect,
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
  });

  const rows = records.map((record) =>
    toRow({
      ...record,
      category: record.category as DataRetentionCategory,
    }),
  );

  return {
    status: "READY",
    rows,
    counts: countDataRetentionPolicies(rows),
    occupiedCategories: rows.map((row) => row.category),
  };
}

export async function createDataRetentionPolicy(
  input: unknown,
): Promise<DataRetentionPolicyMutationResult> {
  const access = await requirePolicyAccess();
  if (access.status !== "READY") return access;

  const parsed = parseDataRetentionPolicyCreate(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.dataRetentionPolicy.findFirst({
    where: {
      organizationId: access.organization.id,
      category: parsed.data.category,
    },
    select: { id: true },
  });
  if (existing) return { status: "DUPLICATE_CATEGORY" };

  try {
    const created = await prisma.dataRetentionPolicy.create({
      data: {
        organizationId: access.organization.id,
        category: parsed.data.category,
        title: parsed.data.title,
        retentionPeriodMonths: parsed.data.retentionPeriodMonths,
        policySummary: parsed.data.policySummary,
        reviewDueAt: parsed.data.reviewDueAt,
        isActive: true,
        createdByUserAccountId: access.userAccount.id,
        updatedByUserAccountId: access.userAccount.id,
      },
      select: {
        id: true,
        category: true,
        isActive: true,
        retentionPeriodMonths: true,
      },
    });

    await createAuditEvent({
      organizationId: access.organization.id,
      actorUserAccountId: access.userAccount.id,
      action: "CREATE_DATA_RETENTION_POLICY",
      entityType: "DataRetentionPolicy",
      entityId: created.id,
      changes: auditChanges(created),
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { status: "DUPLICATE_CATEGORY" };
    throw error;
  }

  return { status: "CREATED" };
}

export async function updateDataRetentionPolicy(
  input: unknown,
): Promise<DataRetentionPolicyMutationResult> {
  const access = await requirePolicyAccess();
  if (access.status !== "READY") return access;

  const parsed = parseDataRetentionPolicyUpdate(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.dataRetentionPolicy.findFirst({
    where: {
      id: parsed.data.policyId,
      organizationId: access.organization.id,
    },
    select: {
      id: true,
      category: true,
      isActive: true,
      retentionPeriodMonths: true,
    },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await prisma.dataRetentionPolicy.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title,
      retentionPeriodMonths: parsed.data.retentionPeriodMonths,
      policySummary: parsed.data.policySummary,
      reviewDueAt: parsed.data.reviewDueAt,
      updatedByUserAccountId: access.userAccount.id,
    },
    select: {
      id: true,
      category: true,
      isActive: true,
      retentionPeriodMonths: true,
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "UPDATE_DATA_RETENTION_POLICY",
    entityType: "DataRetentionPolicy",
    entityId: updated.id,
    changes: auditChanges(updated),
  });

  return { status: "UPDATED" };
}

async function setPolicyActive(
  input: unknown,
  isActive: boolean,
): Promise<DataRetentionPolicyMutationResult> {
  const access = await requirePolicyAccess();
  if (access.status !== "READY") return access;

  const parsed = parseDataRetentionPolicyId(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.dataRetentionPolicy.findFirst({
    where: {
      id: parsed.data,
      organizationId: access.organization.id,
    },
    select: {
      id: true,
      category: true,
      isActive: true,
      retentionPeriodMonths: true,
    },
  });
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await prisma.dataRetentionPolicy.update({
    where: { id: existing.id },
    data: {
      isActive,
      updatedByUserAccountId: access.userAccount.id,
    },
    select: {
      id: true,
      category: true,
      isActive: true,
      retentionPeriodMonths: true,
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: isActive
      ? "REACTIVATE_DATA_RETENTION_POLICY"
      : "DEACTIVATE_DATA_RETENTION_POLICY",
    entityType: "DataRetentionPolicy",
    entityId: updated.id,
    changes: auditChanges(updated),
  });

  return { status: isActive ? "REACTIVATED" : "DEACTIVATED" };
}

export async function deactivateDataRetentionPolicy(input: unknown) {
  return setPolicyActive(input, false);
}

export async function reactivateDataRetentionPolicy(input: unknown) {
  return setPolicyActive(input, true);
}
