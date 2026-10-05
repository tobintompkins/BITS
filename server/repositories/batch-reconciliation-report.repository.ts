import type { OfferingBatchStatus, Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";
import { BATCH_RECONCILIATION_PICKER_SIZE } from "@/lib/validation/batch-reconciliation-report";

export type BatchReconciliationQuery = {
  organizationId: string;
  start: Date;
  endExclusive: Date;
  batchId?: string | null;
  status?: OfferingBatchStatus | null;
};

function batchWhere(input: BatchReconciliationQuery): Prisma.OfferingBatchWhereInput {
  return {
    organizationId: input.organizationId,
    offeringDate: { gte: input.start, lt: input.endExclusive },
    ...(input.batchId ? { id: input.batchId } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
}

const batchSelect = {
  id: true,
  name: true,
  reference: true,
  offeringDate: true,
  status: true,
  expectedTotal: true,
  recordedTotal: true,
  depositDate: true,
  depositReference: true,
} satisfies Prisma.OfferingBatchSelect;

const donationSelect = {
  id: true,
  batchId: true,
  totalAmount: true,
  anonymous: true,
  isTest: true,
  allocations: {
    select: { id: true, amount: true },
  },
} satisfies Prisma.DonationSelect;

export async function countReconciliationBatches(
  input: BatchReconciliationQuery,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.offeringBatch.count({ where: batchWhere(input) });
}

export async function listReconciliationBatches(
  input: BatchReconciliationQuery,
  take: number,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.offeringBatch.findMany({
    where: batchWhere(input),
    select: batchSelect,
    orderBy: [{ offeringDate: "asc" }, { name: "asc" }, { id: "asc" }],
    take,
  });
}

export async function countReconciliationDonations(
  organizationId: string,
  batchIds: string[],
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (!batchIds.length) return 0;
  return tx.donation.count({
    where: { organizationId, batchId: { in: batchIds } },
  });
}

export async function listReconciliationDonations(
  organizationId: string,
  batchIds: string[],
  take: number,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (!batchIds.length) return [];
  return tx.donation.findMany({
    where: { organizationId, batchId: { in: batchIds } },
    select: donationSelect,
    take,
  });
}

export async function findReconciliationBatchTarget(
  organizationId: string,
  batchId: string | null,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (!batchId) return true;
  const row = await tx.offeringBatch.findFirst({
    where: { id: batchId, organizationId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function listReconciliationBatchPicker(
  organizationId: string,
  query: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.offeringBatch.findMany({
    where: {
      organizationId,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { reference: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, status: true, offeringDate: true },
    orderBy: [{ offeringDate: "desc" }, { name: "asc" }, { id: "asc" }],
    take: BATCH_RECONCILIATION_PICKER_SIZE,
  });
}
