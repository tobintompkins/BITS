import { FinancialCorrectionStatus, OfferingBatchStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  requireBatchViewAccess,
  requireFinancialCorrectionRequestAccess,
  requireFinancialCorrectionReviewAccess,
} from "@/lib/auth/giving-permissions";
import {
  financialCorrectionDecisionSchema,
  financialCorrectionRequestSchema,
} from "@/lib/validation/financial-correction";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export class FinancialCorrectionError extends Error {
  constructor(public readonly code: "SIGNED_OUT" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_REQUEST", message: string) {
    super(message);
    this.name = "FinancialCorrectionError";
  }
}

async function context() {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) throw new FinancialCorrectionError("SIGNED_OUT", "You must be signed in.");
  if (!organization) throw new FinancialCorrectionError("NOT_FOUND", "Church organization not found.");
  return { actor, organization };
}

const REVIEW_QUEUE_LIMIT = 100;

function personLabel(person: {
  displayName: string | null;
  primaryEmail: string;
} | null) {
  if (!person) return null;
  const name = person.displayName?.trim();
  return {
    name: name || person.primaryEmail,
    email: person.primaryEmail,
  };
}

function toReviewQueueItem(row: {
  id: string;
  type: string;
  status: string;
  reason: string;
  requestedChange: string;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  offeringBatch: { id: string; name: string };
  requestedBy: { displayName: string | null; primaryEmail: string };
  reviewedBy: { displayName: string | null; primaryEmail: string } | null;
}) {
  const requester = personLabel(row.requestedBy);
  const reviewer = personLabel(row.reviewedBy);
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    reason: row.reason,
    requestedChange: row.requestedChange,
    createdAt: row.createdAt,
    batch: {
      id: row.offeringBatch.id,
      name: row.offeringBatch.name,
    },
    requester: requester ?? { name: "Church staff", email: "" },
    reviewer: reviewer
      ? {
          name: reviewer.name,
          email: reviewer.email,
          reviewNote: row.reviewNote,
          reviewedAt: row.reviewedAt,
        }
      : null,
  };
}

export async function getFinancialCorrectionReviewQueue() {
  const { organization } = await context();
  try {
    await requireFinancialCorrectionReviewAccess(organization.id);
  } catch {
    throw new FinancialCorrectionError(
      "FORBIDDEN",
      "You do not have permission to review corrections.",
    );
  }

  const orgWhere = { organizationId: organization.id };
  const include = {
    offeringBatch: { select: { id: true, name: true } },
    requestedBy: { select: { displayName: true, primaryEmail: true } },
    reviewedBy: { select: { displayName: true, primaryEmail: true } },
  } as const;

  const [pendingCount, completedCount, pendingRows] = await Promise.all([
    prisma.financialCorrectionRequest.count({
      where: { ...orgWhere, status: FinancialCorrectionStatus.PENDING },
    }),
    prisma.financialCorrectionRequest.count({
      where: {
        ...orgWhere,
        status: { not: FinancialCorrectionStatus.PENDING },
      },
    }),
    prisma.financialCorrectionRequest.findMany({
      where: { ...orgWhere, status: FinancialCorrectionStatus.PENDING },
      include,
      orderBy: { createdAt: "asc" },
      take: REVIEW_QUEUE_LIMIT,
    }),
  ]);

  const remaining = REVIEW_QUEUE_LIMIT - pendingRows.length;
  const completedRows =
    remaining > 0
      ? await prisma.financialCorrectionRequest.findMany({
          where: {
            ...orgWhere,
            status: { not: FinancialCorrectionStatus.PENDING },
          },
          include,
          orderBy: { createdAt: "desc" },
          take: remaining,
        })
      : [];

  return {
    pendingCount,
    completedCount,
    requests: [...pendingRows, ...completedRows].map(toReviewQueueItem),
  };
}

export async function getFinancialCorrections(batchId: string) {
  const { actor, organization } = await context();
  let access;
  try {
    access = await requireBatchViewAccess(organization.id);
  } catch {
    throw new FinancialCorrectionError("FORBIDDEN", "You do not have permission to view correction requests.");
  }
  const batch = await prisma.offeringBatch.findFirst({
    where: { id: batchId, organizationId: organization.id },
    select: { id: true, name: true, status: true },
  });
  if (!batch) throw new FinancialCorrectionError("NOT_FOUND", "Offering batch not found.");
  const rows = await prisma.financialCorrectionRequest.findMany({
    where: { organizationId: organization.id, offeringBatchId: batchId },
    include: {
      requestedBy: { select: { id: true, displayName: true, primaryEmail: true } },
      reviewedBy: { select: { displayName: true, primaryEmail: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    batch,
    rows,
    actorId: actor.id,
    canRequest: access.canRequestFinancialCorrections && batch.status === OfferingBatchStatus.LOCKED,
    canReview: access.canReviewFinancialCorrections,
  };
}

export async function createFinancialCorrection(batchId: string, rawInput: unknown) {
  const { actor, organization } = await context();
  try {
    await requireFinancialCorrectionRequestAccess(organization.id);
  } catch {
    throw new FinancialCorrectionError("FORBIDDEN", "You do not have permission to request a correction.");
  }
  const parsed = financialCorrectionRequestSchema.safeParse(rawInput);
  if (!parsed.success) throw new FinancialCorrectionError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the request.");

  return prisma.$transaction(async (tx) => {
    const batch = await tx.offeringBatch.findFirst({
      where: { id: batchId, organizationId: organization.id, status: OfferingBatchStatus.LOCKED },
      select: { id: true },
    });
    if (!batch) throw new FinancialCorrectionError("INVALID_REQUEST", "Corrections may only be requested for a locked batch.");
    const request = await tx.financialCorrectionRequest.create({
      data: {
        organizationId: organization.id,
        offeringBatchId: batch.id,
        requestedByUserAccountId: actor.id,
        ...parsed.data,
      },
    });
    await createAuditEvent({
      organizationId: organization.id,
      actorUserAccountId: actor.id,
      action: "REQUEST_FINANCIAL_CORRECTION",
      entityType: "FinancialCorrectionRequest",
      entityId: request.id,
      changes: [{ field: "status", oldValue: null, newValue: FinancialCorrectionStatus.PENDING }],
    }, tx);
    return request;
  });
}

export async function decideFinancialCorrection(requestId: string, rawInput: unknown) {
  const { actor, organization } = await context();
  try {
    await requireFinancialCorrectionReviewAccess(organization.id);
  } catch {
    throw new FinancialCorrectionError("FORBIDDEN", "You do not have permission to review corrections.");
  }
  const parsed = financialCorrectionDecisionSchema.safeParse(rawInput);
  if (!parsed.success) throw new FinancialCorrectionError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the decision.");

  return prisma.$transaction(async (tx) => {
    const request = await tx.financialCorrectionRequest.findFirst({
      where: { id: requestId, organizationId: organization.id },
      select: { id: true, offeringBatchId: true, status: true, requestedByUserAccountId: true },
    });
    if (!request) throw new FinancialCorrectionError("NOT_FOUND", "Correction request not found.");
    if (request.requestedByUserAccountId === actor.id) throw new FinancialCorrectionError("FORBIDDEN", "A second authorized person must review this request.");
    if (request.status !== FinancialCorrectionStatus.PENDING) throw new FinancialCorrectionError("INVALID_REQUEST", "This request has already been reviewed.");
    const updated = await tx.financialCorrectionRequest.updateMany({
      where: { id: request.id, organizationId: organization.id, status: FinancialCorrectionStatus.PENDING },
      data: { status: parsed.data.decision, reviewNote: parsed.data.reviewNote, reviewedByUserAccountId: actor.id, reviewedAt: new Date() },
    });
    if (updated.count !== 1) throw new FinancialCorrectionError("INVALID_REQUEST", "Another reviewer already decided this request.");
    await createAuditEvent({
      organizationId: organization.id,
      actorUserAccountId: actor.id,
      action: parsed.data.decision === "APPROVED" ? "APPROVE_FINANCIAL_CORRECTION" : "REJECT_FINANCIAL_CORRECTION",
      entityType: "FinancialCorrectionRequest",
      entityId: request.id,
      changes: [{ field: "status", oldValue: FinancialCorrectionStatus.PENDING, newValue: parsed.data.decision }],
    }, tx);
    return { ...request, status: parsed.data.decision };
  });
}

export async function cancelFinancialCorrection(requestId: string) {
  const { actor, organization } = await context();

  return prisma.$transaction(async (tx) => {
    const request = await tx.financialCorrectionRequest.findFirst({
      where: { id: requestId, organizationId: organization.id },
      select: {
        id: true,
        offeringBatchId: true,
        status: true,
        requestedByUserAccountId: true,
      },
    });
    if (!request) {
      throw new FinancialCorrectionError("NOT_FOUND", "Correction request not found.");
    }
    if (request.requestedByUserAccountId !== actor.id) {
      throw new FinancialCorrectionError(
        "FORBIDDEN",
        "Only the person who submitted this request can cancel it.",
      );
    }
    if (request.status !== FinancialCorrectionStatus.PENDING) {
      throw new FinancialCorrectionError(
        "INVALID_REQUEST",
        "Only a pending correction request can be cancelled.",
      );
    }

    const updated = await tx.financialCorrectionRequest.updateMany({
      where: {
        id: request.id,
        organizationId: organization.id,
        requestedByUserAccountId: actor.id,
        status: FinancialCorrectionStatus.PENDING,
      },
      data: { status: FinancialCorrectionStatus.CANCELLED },
    });
    if (updated.count !== 1) {
      throw new FinancialCorrectionError(
        "INVALID_REQUEST",
        "This request is no longer pending and cannot be cancelled.",
      );
    }

    await createAuditEvent(
      {
        organizationId: organization.id,
        actorUserAccountId: actor.id,
        action: "CANCEL_FINANCIAL_CORRECTION",
        entityType: "FinancialCorrectionRequest",
        entityId: request.id,
        changes: [
          {
            field: "status",
            oldValue: FinancialCorrectionStatus.PENDING,
            newValue: FinancialCorrectionStatus.CANCELLED,
          },
        ],
      },
      tx,
    );

    return { ...request, status: FinancialCorrectionStatus.CANCELLED };
  });
}
