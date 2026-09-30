import type { Prisma } from "@/app/generated/prisma/client";

import { getEventAccess } from "@/lib/auth/event-permissions";
import { getGivingAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  PURCHASE_REQUEST_STATUS_LABELS,
  formatPurchaseAmount,
  formatPurchaseDate,
  parsePurchaseCancel,
  parsePurchaseCreate,
  parsePurchaseDecision,
  parsePurchaseFilter,
  type PurchaseRequestRow,
  type PurchaseRequestStatus,
} from "@/lib/validation/purchase-request";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type PurchaseRequestsView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      canSubmit: boolean;
      canReview: boolean;
      equipmentOptions: Array<{ id: string; label: string }>;
      rows: PurchaseRequestRow[];
    };

export type PurchaseRequestMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "NOT_PENDING" }
  | { status: "CREATED" }
  | { status: "DECIDED" }
  | { status: "CANCELLED" };

type LinkedAccess = {
  status: "READY";
  userAccount: { id: string };
  organization: { id: string };
  canSubmit: boolean;
  canReview: boolean;
};

const requestSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  estimatedAmountCents: true,
  requestedForLocation: true,
  status: true,
  decisionNote: true,
  reviewedAt: true,
  createdAt: true,
  requestedByUserAccountId: true,
  requestedBy: { select: { displayName: true } },
  equipmentItem: { select: { name: true } },
} as const;

async function requirePurchaseAccess(mode: "view" | "submit" | "review") {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const [eventAccess, givingAccess] = await Promise.all([
    getEventAccess(organization.id),
    getGivingAccess(organization.id),
  ]);
  const canSubmit = eventAccess.canView;
  const canReview = givingAccess.canReviewFinancialCorrections;

  if (mode === "view" && !canSubmit && !canReview) {
    return { status: "UNAUTHORIZED" as const };
  }
  if (mode === "submit" && !canSubmit) {
    return { status: "UNAUTHORIZED" as const };
  }
  if (mode === "review" && !canReview) {
    return { status: "UNAUTHORIZED" as const };
  }

  return {
    status: "READY" as const,
    userAccount,
    organization,
    canSubmit,
    canReview,
  } satisfies LinkedAccess;
}

function staffDisplayName(displayName: string | null | undefined) {
  const name = displayName?.trim();
  return name ? name : null;
}

function toRow(
  row: {
    id: string;
    title: string;
    description: string;
    category: string | null;
    estimatedAmountCents: number | null;
    requestedForLocation: string | null;
    status: PurchaseRequestStatus;
    decisionNote: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    requestedByUserAccountId: string;
    requestedBy: { displayName: string | null };
    equipmentItem: { name: string } | null;
  },
  access: { userAccount: { id: string }; canReview: boolean },
): PurchaseRequestRow {
  const ownRequest = row.requestedByUserAccountId === access.userAccount.id;
  const pending = row.status === "PENDING";
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    estimatedAmountCents: row.estimatedAmountCents,
    estimatedAmountLabel: formatPurchaseAmount(row.estimatedAmountCents),
    requestedForLocation: row.requestedForLocation,
    equipmentName: row.equipmentItem?.name ?? null,
    status: row.status,
    statusLabel: PURCHASE_REQUEST_STATUS_LABELS[row.status],
    requesterName: staffDisplayName(row.requestedBy.displayName),
    submittedOnLabel: formatPurchaseDate(row.createdAt),
    decisionNote: row.decisionNote,
    reviewedOnLabel: row.reviewedAt
      ? formatPurchaseDate(row.reviewedAt)
      : null,
    canCancel: ownRequest && pending,
    canDecide: access.canReview && pending && !ownRequest,
  };
}

async function currentOrgEquipment(
  organizationId: string,
  equipmentItemId: string | undefined,
) {
  if (!equipmentItemId) return { ok: true as const, id: null };
  const item = await prisma.equipmentItem.findFirst({
    where: { id: equipmentItemId, organizationId },
    select: { id: true },
  });
  if (!item) return { ok: false as const };
  return { ok: true as const, id: item.id };
}

function amountAuditValue(cents: number | null | undefined) {
  return cents == null ? null : String(cents);
}

/**
 * Staff purchase-request list. Organization, church-life view, and financial
 * review permissions are resolved server-side. This does not place orders.
 */
export async function getPurchaseRequests(
  input: unknown = {},
): Promise<PurchaseRequestsView> {
  const access = await requirePurchaseAccess("view");
  if (access.status !== "READY") return access;

  const parsed = parsePurchaseFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };
  const filter = parsed.data;

  const where: Prisma.PurchaseRequestWhereInput = {
    organizationId: access.organization.id,
    ...(access.canReview
      ? {}
      : { requestedByUserAccountId: access.userAccount.id }),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.category
      ? { category: { contains: filter.category, mode: "insensitive" } }
      : {}),
  };

  const [records, equipmentItems] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { title: "asc" }],
      select: requestSelect,
    }),
    prisma.equipmentItem.findMany({
      where: {
        organizationId: access.organization.id,
        archivedAt: null,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return {
    status: "READY",
    canSubmit: access.canSubmit,
    canReview: access.canReview,
    equipmentOptions: equipmentItems.map((item) => ({
      id: item.id,
      label: item.name,
    })),
    rows: records.map((row) =>
      toRow(
        {
          ...row,
          status: row.status as PurchaseRequestStatus,
        },
        access,
      ),
    ),
  };
}

export async function createPurchaseRequest(
  input: unknown,
): Promise<PurchaseRequestMutationResult> {
  const access = await requirePurchaseAccess("submit");
  if (access.status !== "READY") return access;

  const parsed = parsePurchaseCreate(input);
  if (!parsed.success) return { status: "INVALID" };

  const equipment = await currentOrgEquipment(
    access.organization.id,
    parsed.data.equipmentItemId,
  );
  if (!equipment.ok) return { status: "NOT_FOUND" };

  const created = await prisma.purchaseRequest.create({
    data: {
      organizationId: access.organization.id,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category ?? null,
      estimatedAmountCents: parsed.data.estimatedAmountCents,
      requestedForLocation: parsed.data.requestedForLocation ?? null,
      equipmentItemId: equipment.id,
      status: "PENDING",
      requestedByUserAccountId: access.userAccount.id,
    },
    select: { id: true, estimatedAmountCents: true },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CREATE_PURCHASE_REQUEST",
    entityType: "PurchaseRequest",
    entityId: created.id,
    changes: [
      { field: "status", oldValue: null, newValue: "PENDING" },
      {
        field: "estimatedAmountCents",
        oldValue: null,
        newValue: amountAuditValue(created.estimatedAmountCents),
      },
    ],
  });

  return { status: "CREATED" };
}

export async function decidePurchaseRequest(
  input: unknown,
): Promise<PurchaseRequestMutationResult> {
  const access = await requirePurchaseAccess("review");
  if (access.status !== "READY") return access;

  const parsed = parsePurchaseDecision(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.purchaseRequest.findFirst({
    where: {
      id: parsed.data.requestId,
      organizationId: access.organization.id,
    },
    select: {
      id: true,
      status: true,
      requestedByUserAccountId: true,
      estimatedAmountCents: true,
    },
  });
  if (!existing) return { status: "NOT_FOUND" };
  if (existing.requestedByUserAccountId === access.userAccount.id) {
    return { status: "UNAUTHORIZED" };
  }
  if (existing.status !== "PENDING") return { status: "NOT_PENDING" };

  await prisma.purchaseRequest.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.decision,
      decisionNote: parsed.data.decisionNote,
      reviewedByUserAccountId: access.userAccount.id,
      reviewedAt: new Date(),
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action:
      parsed.data.decision === "APPROVED"
        ? "APPROVE_PURCHASE_REQUEST"
        : "DECLINE_PURCHASE_REQUEST",
    entityType: "PurchaseRequest",
    entityId: existing.id,
    changes: [
      {
        field: "status",
        oldValue: existing.status,
        newValue: parsed.data.decision,
      },
      {
        field: "estimatedAmountCents",
        oldValue: amountAuditValue(existing.estimatedAmountCents),
        newValue: amountAuditValue(existing.estimatedAmountCents),
      },
    ],
  });

  return { status: "DECIDED" };
}

export async function cancelPurchaseRequest(
  input: unknown,
): Promise<PurchaseRequestMutationResult> {
  const access = await requirePurchaseAccess("submit");
  if (access.status !== "READY") return access;

  const parsed = parsePurchaseCancel(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.purchaseRequest.findFirst({
    where: {
      id: parsed.data.requestId,
      organizationId: access.organization.id,
    },
    select: {
      id: true,
      status: true,
      requestedByUserAccountId: true,
      estimatedAmountCents: true,
    },
  });
  if (!existing) return { status: "NOT_FOUND" };
  if (existing.requestedByUserAccountId !== access.userAccount.id) {
    return { status: "UNAUTHORIZED" };
  }
  if (existing.status !== "PENDING") return { status: "NOT_PENDING" };

  await prisma.purchaseRequest.update({
    where: { id: existing.id },
    data: {
      status: "CANCELLED",
      decisionNote: parsed.data.decisionNote ?? null,
      reviewedAt: new Date(),
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CANCEL_PURCHASE_REQUEST",
    entityType: "PurchaseRequest",
    entityId: existing.id,
    changes: [
      {
        field: "status",
        oldValue: existing.status,
        newValue: "CANCELLED",
      },
      {
        field: "estimatedAmountCents",
        oldValue: amountAuditValue(existing.estimatedAmountCents),
        newValue: amountAuditValue(existing.estimatedAmountCents),
      },
    ],
  });

  return { status: "CANCELLED" };
}
