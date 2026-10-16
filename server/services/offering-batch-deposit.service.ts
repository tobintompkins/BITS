import type { Prisma } from "@/app/generated/prisma/client";
import { OfferingBatchStatus } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  requireBatchDepositAccess,
  requireBatchLockAccess,
} from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { parseDateOnly, toDateOnlyString } from "@/lib/batches/dates";
import {
  BATCH_INTEGRITY_MESSAGES,
  evaluateDepositDates,
  evaluateOfferingBatchIntegrity,
  type BatchIntegrityIssue,
} from "@/lib/batches/integrity";
import { lockChurchThenOfferingBatch } from "@/lib/batches/ledger-locks";
import {
  reviewVersionIncrement,
  STALE_BATCH_REVIEW_MESSAGE,
} from "@/lib/batches/review-version";
import { offeringBatchDepositWriteSchema } from "@/lib/validation/offering-batch-deposit";
import {
  offeringBatchTransitionSchema,
  transitionSnapshotMatches,
} from "@/lib/validation/offering-batch-transition";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findBatchIntegrityRows } from "@/server/repositories/offering-batch.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export class OfferingBatchDepositError extends Error {
  constructor(
    public readonly code:
      | BatchIntegrityIssue
      | "SIGNED_OUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "NOT_CONFIRMED"
      | "INVALID_REQUEST"
      | "STALE_REVIEW",
    message: string,
    public readonly issues: BatchIntegrityIssue[] = [],
  ) {
    super(message);
    this.name = "OfferingBatchDepositError";
  }
}

export const RECORD_BATCH_DEPOSIT = "RECORD_BATCH_DEPOSIT";
export const UPDATE_BATCH_DEPOSIT = "UPDATE_BATCH_DEPOSIT";
export const LOCK_OFFERING_BATCH = "LOCK_OFFERING_BATCH";

type ReconciledBatchRow = {
  id: string;
  status: OfferingBatchStatus;
  expectedTotal: { toString(): string } | null;
  recordedTotal: { toString(): string };
  offeringDate: Date;
  depositDate: Date | null;
  depositReference: string | null;
};

async function requireOrganization() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new OfferingBatchDepositError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  return organization;
}

async function requireActor() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) {
    throw new OfferingBatchDepositError(
      "SIGNED_OUT",
      "You must be signed in.",
    );
  }
  return userAccount;
}

function throwIntegrityFailure(issues: BatchIntegrityIssue[]): never {
  const code = issues[0] ?? "INVALID_REQUEST";
  throw new OfferingBatchDepositError(
    code,
    BATCH_INTEGRITY_MESSAGES[code] ?? "This batch deposit cannot be saved.",
    issues,
  );
}

function assessReconciledBatch(
  batch: ReconciledBatchRow,
  donations: Array<{
    totalAmount: { toString(): string };
    allocations: Array<{ amount: { toString(): string } }>;
  }>,
  options: { requireDeposit: boolean },
) {
  return evaluateOfferingBatchIntegrity({
    status: batch.status,
    expectedStatus: OfferingBatchStatus.RECONCILED,
    expectedTotal: batch.expectedTotal,
    recordedTotal: batch.recordedTotal,
    donations,
    requireBalancedExpected: true,
    requirePositiveRecorded: true,
    requireDeposit: options.requireDeposit,
    depositDate: batch.depositDate,
    depositReference: batch.depositReference,
    offeringDate: batch.offeringDate,
  });
}

function depositDateString(value: Date | null) {
  return value ? toDateOnlyString(value) : null;
}

export async function recordOfferingBatchDeposit(
  batchId: string,
  rawInput: unknown,
) {
  const userAccount = await requireActor();
  const organization = await requireOrganization();
  try {
    await requireBatchDepositAccess(organization.id);
  } catch {
    throw new OfferingBatchDepositError(
      "FORBIDDEN",
      "You do not have permission to record offering-batch deposits.",
    );
  }

  const parsed = offeringBatchDepositWriteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new OfferingBatchDepositError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Check the deposit form and try again.",
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await lockChurchThenOfferingBatch(
        tx,
        organization.id,
        batchId,
      );
      if (!locked.organization || !locked.batch) {
        throw new OfferingBatchDepositError(
          "NOT_FOUND",
          "Offering batch not found.",
        );
      }
      const batch = await tx.offeringBatch.findFirst({
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
        throw new OfferingBatchDepositError(
          "NOT_FOUND",
          "Offering batch not found.",
        );
      }
      if (batch.status !== OfferingBatchStatus.RECONCILED) {
        throw new OfferingBatchDepositError(
          "INVALID_STATUS",
          BATCH_INTEGRITY_MESSAGES.INVALID_STATUS,
          ["INVALID_STATUS"],
        );
      }

      const donations = await findBatchIntegrityRows(
        organization.id,
        batchId,
        tx,
      );
      const integrity = assessReconciledBatch(batch, donations, {
        requireDeposit: false,
      });
      if (!integrity.ok) {
        throwIntegrityFailure(integrity.issues);
      }

      const dateIssues = evaluateDepositDates({
        depositDate: parsed.data.depositDate,
        offeringDate: batch.offeringDate,
      });
      if (dateIssues.length) {
        throwIntegrityFailure(dateIssues);
      }

      const previousDate = depositDateString(batch.depositDate);
      const previousReference = batch.depositReference;
      const nextDate = parsed.data.depositDate;
      const nextReference = parsed.data.depositReference;
      const unchanged =
        previousDate === nextDate && previousReference === nextReference;
      if (unchanged) {
        return {
          id: batch.id,
          status: batch.status,
          unchanged: true,
          expectedTotal: integrity.expectedTotal,
          recordedTotal: integrity.recordedTotal,
          depositDate: nextDate,
          depositReference: nextReference,
        };
      }

      const updated = await tx.offeringBatch.updateMany({
        where: {
          id: batchId,
          organizationId: organization.id,
          status: OfferingBatchStatus.RECONCILED,
          recordedTotal: integrity.recordedTotal,
        },
        data: {
          depositDate: parseDateOnly(nextDate),
          depositReference: nextReference,
          reviewVersion: reviewVersionIncrement(),
        },
      });
      if (updated.count !== 1) {
        throw new OfferingBatchDepositError(
          "CONCURRENT_CHANGE",
          BATCH_INTEGRITY_MESSAGES.CONCURRENT_CHANGE,
          ["CONCURRENT_CHANGE"],
        );
      }

      const isFirstRecord = previousDate == null && previousReference == null;
      await createAuditEvent(
        {
          organizationId: organization.id,
          actorUserAccountId: userAccount.id,
          action: isFirstRecord ? RECORD_BATCH_DEPOSIT : UPDATE_BATCH_DEPOSIT,
          entityType: "OfferingBatch",
          entityId: batch.id,
          changes: [
            {
              field: "depositDate",
              oldValue: previousDate,
              newValue: nextDate,
            },
            {
              field: "depositReference",
              oldValue: previousReference,
              newValue: nextReference,
            },
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
          ],
        },
        tx,
      );

      return {
        id: batch.id,
        status: batch.status,
        unchanged: false,
        expectedTotal: integrity.expectedTotal,
        recordedTotal: integrity.recordedTotal,
        depositDate: nextDate,
        depositReference: nextReference,
      };
    });
  } catch (error) {
    if (error instanceof OfferingBatchDepositError) throw error;
    throw new OfferingBatchDepositError(
      "INVALID_REQUEST",
      "This deposit could not be saved.",
    );
  }
}

export async function lockOfferingBatch(batchId: string, rawInput: unknown) {
  const userAccount = await requireActor();
  const organization = await requireOrganization();
  try {
    await requireBatchLockAccess(organization.id);
  } catch {
    throw new OfferingBatchDepositError(
      "FORBIDDEN",
      "You do not have permission to lock offering batches.",
    );
  }

  const confirmed = offeringBatchTransitionSchema.safeParse(rawInput);
  if (!confirmed.success) {
    throw new OfferingBatchDepositError(
      "NOT_CONFIRMED",
      "Confirm this status change before saving.",
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      return applyLockOfferingBatch({
        db: tx,
        organizationId: organization.id,
        actorUserAccountId: userAccount.id,
        batchId,
        snapshot: confirmed.data,
      });
    });
  } catch (error) {
    if (error instanceof OfferingBatchDepositError) throw error;
    throw new OfferingBatchDepositError(
      "INVALID_REQUEST",
      "This batch could not be locked.",
    );
  }
}

export async function applyLockOfferingBatch(input: {
  db: Prisma.TransactionClient;
  organizationId: string;
  actorUserAccountId: string;
  batchId: string;
  snapshot: (typeof offeringBatchTransitionSchema)["_output"];
}) {
  const locked = await lockChurchThenOfferingBatch(
    input.db,
    input.organizationId,
    input.batchId,
  );
  if (!locked.organization || !locked.batch) {
    throw new OfferingBatchDepositError(
      "NOT_FOUND",
      "Offering batch not found.",
    );
  }

  const batch = await input.db.offeringBatch.findFirst({
    where: { id: input.batchId, organizationId: input.organizationId },
    select: {
      id: true,
      status: true,
      expectedTotal: true,
      recordedTotal: true,
      reviewVersion: true,
      offeringDate: true,
      depositDate: true,
      depositReference: true,
    },
  });
  if (!batch) {
    throw new OfferingBatchDepositError(
      "NOT_FOUND",
      "Offering batch not found.",
    );
  }

  const donations = await findBatchIntegrityRows(
    input.organizationId,
    input.batchId,
    input.db,
  );
  const integrity = assessReconciledBatch(batch, donations, {
    requireDeposit: true,
  });
  if (!integrity.ok) {
    throwIntegrityFailure(integrity.issues);
  }
  if (
    !transitionSnapshotMatches(input.snapshot, {
      ...integrity,
      reviewVersion: batch.reviewVersion,
    })
  ) {
    throw new OfferingBatchDepositError(
      input.snapshot.reviewVersion === batch.reviewVersion
        ? "CONCURRENT_CHANGE"
        : "STALE_REVIEW",
      input.snapshot.reviewVersion === batch.reviewVersion
        ? BATCH_INTEGRITY_MESSAGES.CONCURRENT_CHANGE
        : STALE_BATCH_REVIEW_MESSAGE,
      input.snapshot.reviewVersion === batch.reviewVersion
        ? ["CONCURRENT_CHANGE"]
        : [],
    );
  }

  const updated = await input.db.offeringBatch.updateMany({
    where: {
      id: input.batchId,
      organizationId: input.organizationId,
      status: OfferingBatchStatus.RECONCILED,
      recordedTotal: integrity.recordedTotal,
      reviewVersion: batch.reviewVersion,
    },
    data: {
      status: OfferingBatchStatus.LOCKED,
      reviewVersion: reviewVersionIncrement(),
    },
  });
  if (updated.count !== 1) {
    throw new OfferingBatchDepositError(
      "CONCURRENT_CHANGE",
      BATCH_INTEGRITY_MESSAGES.CONCURRENT_CHANGE,
      ["CONCURRENT_CHANGE"],
    );
  }

  const depositDate = depositDateString(batch.depositDate);
  await createAuditEvent(
    {
      organizationId: input.organizationId,
      actorUserAccountId: input.actorUserAccountId,
      action: LOCK_OFFERING_BATCH,
      entityType: "OfferingBatch",
      entityId: batch.id,
      changes: [
        {
          field: "status",
          oldValue: OfferingBatchStatus.RECONCILED,
          newValue: OfferingBatchStatus.LOCKED,
        },
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
          field: "depositDate",
          oldValue: depositDate,
          newValue: depositDate,
        },
        {
          field: "depositReference",
          oldValue: batch.depositReference,
          newValue: batch.depositReference,
        },
      ],
    },
    input.db,
  );

  return {
    id: batch.id,
    status: OfferingBatchStatus.LOCKED,
    expectedTotal: integrity.expectedTotal,
    recordedTotal: integrity.recordedTotal,
    depositDate,
    depositReference: batch.depositReference,
  };
}
