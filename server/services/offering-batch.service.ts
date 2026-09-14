import type { Prisma } from "@/app/generated/prisma/client";
import { OfferingBatchStatus } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  requireBatchManageAccess,
  requireBatchViewAccess,
} from "@/lib/auth/giving-permissions";
import { moneyDifference } from "@/lib/money/decimal";
import {
  offeringBatchAuditChanges,
  offeringBatchAuditSnapshot,
  offeringBatchWriteSchema,
  type OfferingBatchDirectoryQuery,
} from "@/lib/validation/offering-batch";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  countOfferingBatches,
  countOfferingBatchesByStatus,
  findOfferingBatchById,
  findOfferingBatches,
  sumRecordedTotalForOfferingDateRange,
} from "@/server/repositories/offering-batch.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export class OfferingBatchError extends Error {
  constructor(
    public readonly code:
      | "SIGNED_OUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "NOT_EDITABLE"
      | "INVALID_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "OfferingBatchError";
  }
}

export const CREATE_OFFERING_BATCH = "CREATE_OFFERING_BATCH";
export const UPDATE_OFFERING_BATCH = "UPDATE_OFFERING_BATCH";

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toMoneyString(value: { toString(): string } | null | undefined) {
  return value == null ? null : value.toString();
}

async function requireOrganization() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new OfferingBatchError("NOT_FOUND", "Church organization not found.");
  }
  return organization;
}

async function requireActor() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) {
    throw new OfferingBatchError("SIGNED_OUT", "You must be signed in.");
  }
  return userAccount;
}

function mapBatchRow(batch: {
  id: string;
  name: string;
  offeringDate: Date;
  serviceDescription: string | null;
  status: OfferingBatchStatus;
  expectedTotal: { toString(): string } | null;
  recordedTotal: { toString(): string };
  depositDate: Date | null;
  depositReference?: string | null;
  createdAt: Date;
}) {
  const expectedTotal = toMoneyString(batch.expectedTotal);
  const recordedTotal = batch.recordedTotal.toString();
  return {
    ...batch,
    expectedTotal,
    recordedTotal,
    difference: moneyDifference(expectedTotal, recordedTotal),
  };
}

export async function getOfferingBatchDirectory(query: OfferingBatchDirectoryQuery) {
  await requireActor();
  const organization = await requireOrganization();
  let access;
  try {
    access = await requireBatchViewAccess(organization.id);
  } catch {
    throw new OfferingBatchError(
      "FORBIDDEN",
      "You do not have permission to view offering batches.",
    );
  }

  const where: Prisma.OfferingBatchWhereInput = {
    organizationId: organization.id,
  };
  if (query.status !== "all") {
    where.status = query.status as OfferingBatchStatus;
  }
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { serviceDescription: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.dateFrom || query.dateTo) {
    where.offeringDate = {
      ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: parseDateOnly(query.dateTo) } : {}),
    };
  }

  const orderBy: Prisma.OfferingBatchOrderByWithRelationInput[] = [
    { [query.sort]: query.order },
    { id: "desc" },
  ];

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [total, rows, draftCount, enteredCount, reconciledCount, lockedCount, monthTotal] =
    await Promise.all([
      countOfferingBatches(where),
      findOfferingBatches(where, {
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy,
      }),
      countOfferingBatchesByStatus(organization.id, OfferingBatchStatus.DRAFT),
      countOfferingBatchesByStatus(organization.id, OfferingBatchStatus.ENTERED),
      countOfferingBatchesByStatus(organization.id, OfferingBatchStatus.RECONCILED),
      countOfferingBatchesByStatus(organization.id, OfferingBatchStatus.LOCKED),
      sumRecordedTotalForOfferingDateRange(organization.id, monthStart, nextMonth),
    ]);

  return {
    organizationName: organization.displayName ?? organization.name,
    canManage: access.canManageBatches,
    page: query.page,
    pageSize: query.pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    summary: {
      draft: draftCount,
      entered: enteredCount,
      reconciled: reconciledCount,
      locked: lockedCount,
      recordedThisMonth: monthTotal._sum.recordedTotal?.toString() ?? "0.00",
    },
    batches: rows.map((row) => ({
      ...mapBatchRow(row),
      canEdit:
        access.canManageBatches && row.status === OfferingBatchStatus.DRAFT,
    })),
  };
}

export async function getOfferingBatchDetail(batchId: string) {
  await requireActor();
  const organization = await requireOrganization();
  let access;
  try {
    access = await requireBatchViewAccess(organization.id);
  } catch {
    throw new OfferingBatchError(
      "FORBIDDEN",
      "You do not have permission to view offering batches.",
    );
  }

  const batch = await findOfferingBatchById(organization.id, batchId);
  if (!batch) {
    throw new OfferingBatchError("NOT_FOUND", "Offering batch not found.");
  }

  const expectedTotal = toMoneyString(batch.expectedTotal);
  const recordedTotal = batch.recordedTotal.toString();

  return {
    canManage: access.canManageBatches,
    canEdit: access.canManageBatches && batch.status === OfferingBatchStatus.DRAFT,
    canAddDonations:
      access.canAddBatchDonations && batch.status === OfferingBatchStatus.DRAFT,
    batch: {
      ...batch,
      expectedTotal,
      recordedTotal,
      difference: moneyDifference(expectedTotal, recordedTotal),
      depositReference: batch.depositReference,
      notes: batch.notes,
      createdBy: batch.createdBy,
    },
  };
}

function validatedWriteInput(input: unknown) {
  const parsed = offeringBatchWriteSchema.safeParse(input);
  if (!parsed.success) {
    throw new OfferingBatchError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Check the batch form and try again.",
    );
  }
  return parsed.data;
}

export async function createOfferingBatch(rawInput: unknown) {
  const userAccount = await requireActor();
  const organization = await requireOrganization();
  try {
    await requireBatchManageAccess(organization.id);
  } catch {
    throw new OfferingBatchError(
      "FORBIDDEN",
      "You do not have permission to manage offering batches.",
    );
  }

  const input = validatedWriteInput(rawInput);

  return prisma.$transaction(async (tx) => {
    const batch = await tx.offeringBatch.create({
      data: {
        organizationId: organization.id,
        name: input.name,
        offeringDate: parseDateOnly(input.offeringDate),
        serviceDescription: input.serviceDescription,
        expectedTotal: input.expectedTotal,
        notes: input.notes,
        status: OfferingBatchStatus.DRAFT,
        recordedTotal: "0.00",
        createdByUserAccountId: userAccount.id,
      },
      select: {
        id: true,
        status: true,
        recordedTotal: true,
        organizationId: true,
        name: true,
        offeringDate: true,
        serviceDescription: true,
        expectedTotal: true,
      },
    });

    await createAuditEvent(
      {
        organizationId: organization.id,
        actorUserAccountId: userAccount.id,
        action: CREATE_OFFERING_BATCH,
        entityType: "OfferingBatch",
        entityId: batch.id,
        changes: offeringBatchAuditChanges(
          {
            name: null,
            offeringDate: null,
            serviceDescription: null,
            expectedTotal: null,
          },
          offeringBatchAuditSnapshot(batch),
        ),
      },
      tx,
    );

    return {
      id: batch.id,
      status: batch.status,
      recordedTotal: batch.recordedTotal.toString(),
    };
  });
}

export async function updateDraftOfferingBatch(
  batchId: string,
  rawInput: unknown,
) {
  const userAccount = await requireActor();
  const organization = await requireOrganization();
  try {
    await requireBatchManageAccess(organization.id);
  } catch {
    throw new OfferingBatchError(
      "FORBIDDEN",
      "You do not have permission to manage offering batches.",
    );
  }

  const input = validatedWriteInput(rawInput);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.offeringBatch.findFirst({
        where: { id: batchId, organizationId: organization.id },
        select: {
          id: true,
          status: true,
          name: true,
          offeringDate: true,
          serviceDescription: true,
          expectedTotal: true,
        },
      });
      if (!existing) {
        throw new OfferingBatchError("NOT_FOUND", "Offering batch not found.");
      }
      if (existing.status !== OfferingBatchStatus.DRAFT) {
        throw new OfferingBatchError(
          "NOT_EDITABLE",
          "Only draft batches can be edited.",
        );
      }

      const updated = await tx.offeringBatch.updateMany({
        where: {
          id: batchId,
          organizationId: organization.id,
          status: OfferingBatchStatus.DRAFT,
        },
        data: {
          name: input.name,
          offeringDate: parseDateOnly(input.offeringDate),
          serviceDescription: input.serviceDescription,
          expectedTotal: input.expectedTotal,
          notes: input.notes,
        },
      });
      if (updated.count !== 1) {
        throw new OfferingBatchError(
          "NOT_EDITABLE",
          "This batch is no longer a draft and cannot be edited.",
        );
      }

      const next = await tx.offeringBatch.findFirstOrThrow({
        where: { id: batchId, organizationId: organization.id },
        select: {
          id: true,
          name: true,
          offeringDate: true,
          serviceDescription: true,
          expectedTotal: true,
          status: true,
        },
      });

      await createAuditEvent(
        {
          organizationId: organization.id,
          actorUserAccountId: userAccount.id,
          action: UPDATE_OFFERING_BATCH,
          entityType: "OfferingBatch",
          entityId: next.id,
          changes: offeringBatchAuditChanges(
            offeringBatchAuditSnapshot(existing),
            offeringBatchAuditSnapshot(next),
          ),
        },
        tx,
      );

      return { id: next.id, status: next.status };
    });
  } catch (error) {
    if (error instanceof OfferingBatchError) throw error;
    throw new OfferingBatchError(
      "INVALID_REQUEST",
      "This offering batch could not be updated.",
    );
  }
}
