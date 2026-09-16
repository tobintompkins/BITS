import { OfferingBatchStatus } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  requireBatchCompleteEntryAccess,
  requireBatchReconcileAccess,
  requireBatchViewAccess,
} from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  BATCH_INTEGRITY_MESSAGES,
  evaluateOfferingBatchIntegrity,
  type BatchIntegrityIssue,
} from "@/lib/batches/integrity";
import { offeringBatchTransitionSchema } from "@/lib/validation/offering-batch-transition";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findBatchIntegrityRows } from "@/server/repositories/offering-batch.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export class OfferingBatchTransitionError extends Error {
  constructor(
    public readonly code:
      | BatchIntegrityIssue
      | "SIGNED_OUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "NOT_CONFIRMED"
      | "INVALID_REQUEST",
    message: string,
    public readonly issues: BatchIntegrityIssue[] = [],
  ) {
    super(message);
    this.name = "OfferingBatchTransitionError";
  }
}

export const COMPLETE_OFFERING_BATCH_ENTRY = "COMPLETE_OFFERING_BATCH_ENTRY";
export const RECONCILE_OFFERING_BATCH = "RECONCILE_OFFERING_BATCH";

async function requireOrganization() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new OfferingBatchTransitionError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  return organization;
}

async function requireActor() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) {
    throw new OfferingBatchTransitionError(
      "SIGNED_OUT",
      "You must be signed in.",
    );
  }
  return userAccount;
}

function requireConfirmation(rawInput: unknown) {
  const parsed = offeringBatchTransitionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new OfferingBatchTransitionError(
      "NOT_CONFIRMED",
      "Confirm this status change before saving.",
    );
  }
}

function throwIntegrityFailure(issues: BatchIntegrityIssue[]): never {
  const code = issues[0] ?? "INVALID_REQUEST";
  throw new OfferingBatchTransitionError(
    code,
    BATCH_INTEGRITY_MESSAGES[code] ?? "This batch cannot change status.",
    issues,
  );
}

function toIntegrityResult(
  batch: {
    status: OfferingBatchStatus;
    expectedTotal: { toString(): string } | null;
    recordedTotal: { toString(): string };
  },
  donations: Array<{
    totalAmount: { toString(): string };
    allocations: Array<{ amount: { toString(): string } }>;
  }>,
  expectedStatus: OfferingBatchStatus,
  requireBalancedExpected: boolean,
) {
  return evaluateOfferingBatchIntegrity({
    status: batch.status,
    expectedStatus,
    expectedTotal: batch.expectedTotal,
    recordedTotal: batch.recordedTotal,
    donations,
    requireBalancedExpected,
  });
}

export async function getOfferingBatchReview(batchId: string) {
  await requireActor();
  const organization = await requireOrganization();
  let access;
  try {
    access = await requireBatchViewAccess(organization.id);
  } catch {
    throw new OfferingBatchTransitionError(
      "FORBIDDEN",
      "You do not have permission to view offering batches.",
    );
  }

  const batch = await prisma.offeringBatch.findFirst({
    where: { id: batchId, organizationId: organization.id },
    select: {
      id: true,
      status: true,
      expectedTotal: true,
      recordedTotal: true,
      offeringDate: true,
      depositDate: true,
      depositReference: true,
    },
  });
  if (!batch) {
    throw new OfferingBatchTransitionError(
      "NOT_FOUND",
      "Offering batch not found.",
    );
  }

  const donations = await findBatchIntegrityRows(organization.id, batchId);
  const completeEntry = toIntegrityResult(
    batch,
    donations,
    OfferingBatchStatus.DRAFT,
    false,
  );
  const reconcile = toIntegrityResult(
    batch,
    donations,
    OfferingBatchStatus.ENTERED,
    true,
  );
  const lock = evaluateOfferingBatchIntegrity({
    status: batch.status,
    expectedStatus: OfferingBatchStatus.RECONCILED,
    expectedTotal: batch.expectedTotal,
    recordedTotal: batch.recordedTotal,
    donations,
    requireBalancedExpected: true,
    requirePositiveRecorded: true,
    requireDeposit: true,
    depositDate: batch.depositDate,
    depositReference: batch.depositReference,
    offeringDate: batch.offeringDate,
  });
  const current =
    batch.status === OfferingBatchStatus.RECONCILED
      ? lock
      : batch.status === OfferingBatchStatus.ENTERED
        ? reconcile
        : completeEntry;
  const issues =
    batch.status === OfferingBatchStatus.LOCKED
      ? []
      : current.issues.filter((issue) => issue !== "INVALID_STATUS");

  return {
    donationCount: current.donationCount,
    allocationCount: current.allocationCount,
    donationTotal: current.donationTotal,
    expectedTotal: current.expectedTotal,
    recordedTotal: current.recordedTotal,
    difference: current.difference,
    issues,
    isLocked: batch.status === OfferingBatchStatus.LOCKED,
    canCompleteEntry:
      access.canCompleteBatchEntry &&
      batch.status === OfferingBatchStatus.DRAFT &&
      completeEntry.ok,
    canReconcile:
      access.canReconcileBatches &&
      batch.status === OfferingBatchStatus.ENTERED &&
      reconcile.ok,
    canRecordDeposit:
      access.canRecordBatchDeposits &&
      batch.status === OfferingBatchStatus.RECONCILED,
    canLock:
      access.canLockBatches &&
      batch.status === OfferingBatchStatus.RECONCILED &&
      lock.ok,
    showCompleteEntry:
      access.canCompleteBatchEntry && batch.status === OfferingBatchStatus.DRAFT,
    showReconcile:
      access.canReconcileBatches && batch.status === OfferingBatchStatus.ENTERED,
    showDepositForm:
      access.canRecordBatchDeposits &&
      batch.status === OfferingBatchStatus.RECONCILED,
    showLock:
      access.canLockBatches && batch.status === OfferingBatchStatus.RECONCILED,
  };
}

async function transitionOfferingBatch(input: {
  batchId: string;
  rawInput: unknown;
  fromStatus: OfferingBatchStatus;
  toStatus: OfferingBatchStatus;
  requireBalancedExpected: boolean;
  requireAccess: (organizationId: string) => Promise<unknown>;
  action: string;
}) {
  const userAccount = await requireActor();
  const organization = await requireOrganization();
  try {
    await input.requireAccess(organization.id);
  } catch {
    throw new OfferingBatchTransitionError(
      "FORBIDDEN",
      "You do not have permission to change this batch status.",
    );
  }
  requireConfirmation(input.rawInput);

  try {
    return await prisma.$transaction(async (tx) => {
      const batch = await tx.offeringBatch.findFirst({
        where: { id: input.batchId, organizationId: organization.id },
        select: {
          id: true,
          status: true,
          expectedTotal: true,
          recordedTotal: true,
        },
      });
      if (!batch) {
        throw new OfferingBatchTransitionError(
          "NOT_FOUND",
          "Offering batch not found.",
        );
      }

      const donations = await findBatchIntegrityRows(
        organization.id,
        input.batchId,
        tx,
      );
      const integrity = toIntegrityResult(
        batch,
        donations,
        input.fromStatus,
        input.requireBalancedExpected,
      );
      if (!integrity.ok) {
        throwIntegrityFailure(integrity.issues);
      }

      const updated = await tx.offeringBatch.updateMany({
        where: {
          id: input.batchId,
          organizationId: organization.id,
          status: input.fromStatus,
          recordedTotal: integrity.recordedTotal,
        },
        data: { status: input.toStatus },
      });
      if (updated.count !== 1) {
        throw new OfferingBatchTransitionError(
          "CONCURRENT_CHANGE",
          BATCH_INTEGRITY_MESSAGES.CONCURRENT_CHANGE,
          ["CONCURRENT_CHANGE"],
        );
      }

      await createAuditEvent(
        {
          organizationId: organization.id,
          actorUserAccountId: userAccount.id,
          action: input.action,
          entityType: "OfferingBatch",
          entityId: batch.id,
          changes: [
            { field: "status", oldValue: input.fromStatus, newValue: input.toStatus },
            {
              field: "expectedTotal",
              oldValue: integrity.expectedTotal,
              newValue: integrity.expectedTotal,
            },
            {
              field: "recordedTotal",
              oldValue: integrity.recordedTotal,
              newValue: integrity.recordedTotal,
            },
            {
              field: "integrity",
              oldValue: null,
              newValue: JSON.stringify({
                ok: true,
                donationCount: integrity.donationCount,
                allocationCount: integrity.allocationCount,
              }),
            },
          ],
        },
        tx,
      );

      return {
        id: batch.id,
        status: input.toStatus,
        expectedTotal: integrity.expectedTotal,
        recordedTotal: integrity.recordedTotal,
      };
    });
  } catch (error) {
    if (error instanceof OfferingBatchTransitionError) throw error;
    throw new OfferingBatchTransitionError(
      "INVALID_REQUEST",
      "This batch status could not be changed.",
    );
  }
}

export async function completeOfferingBatchEntry(
  batchId: string,
  rawInput: unknown,
) {
  return transitionOfferingBatch({
    batchId,
    rawInput,
    fromStatus: OfferingBatchStatus.DRAFT,
    toStatus: OfferingBatchStatus.ENTERED,
    requireBalancedExpected: false,
    requireAccess: requireBatchCompleteEntryAccess,
    action: COMPLETE_OFFERING_BATCH_ENTRY,
  });
}

export async function reconcileOfferingBatch(
  batchId: string,
  rawInput: unknown,
) {
  return transitionOfferingBatch({
    batchId,
    rawInput,
    fromStatus: OfferingBatchStatus.ENTERED,
    toStatus: OfferingBatchStatus.RECONCILED,
    requireBalancedExpected: true,
    requireAccess: requireBatchReconcileAccess,
    action: RECONCILE_OFFERING_BATCH,
  });
}
