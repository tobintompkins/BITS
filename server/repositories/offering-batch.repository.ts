import type { Prisma } from "@/app/generated/prisma/client";
import { OfferingBatchStatus } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";

const directorySelect = {
  id: true,
  name: true,
  offeringDate: true,
  serviceDescription: true,
  status: true,
  expectedTotal: true,
  recordedTotal: true,
  depositDate: true,
  depositReference: true,
  createdAt: true,
} satisfies Prisma.OfferingBatchSelect;

export const offeringBatchDetailSelect = {
  ...directorySelect,
  notes: true,
  createdByUserAccountId: true,
  updatedAt: true,
  createdBy: {
    select: { id: true, displayName: true, primaryEmail: true },
  },
} satisfies Prisma.OfferingBatchSelect;

export function findOfferingBatches(
  where: Prisma.OfferingBatchWhereInput,
  args: {
    skip: number;
    take: number;
    orderBy: Prisma.OfferingBatchOrderByWithRelationInput[];
  },
) {
  return prisma.offeringBatch.findMany({
    where,
    skip: args.skip,
    take: args.take,
    orderBy: args.orderBy,
    select: directorySelect,
  });
}

export function countOfferingBatches(where: Prisma.OfferingBatchWhereInput) {
  return prisma.offeringBatch.count({ where });
}

export function countOfferingBatchesByStatus(
  organizationId: string,
  status: OfferingBatchStatus,
) {
  return prisma.offeringBatch.count({
    where: { organizationId, status },
  });
}

export function sumRecordedTotalForOfferingDateRange(
  organizationId: string,
  dateFrom: Date,
  dateTo: Date,
) {
  return prisma.offeringBatch.aggregate({
    where: {
      organizationId,
      offeringDate: { gte: dateFrom, lt: dateTo },
    },
    _sum: { recordedTotal: true },
  });
}

export function findOfferingBatchById(
  organizationId: string,
  batchId: string,
) {
  return prisma.offeringBatch.findFirst({
    where: { id: batchId, organizationId },
    select: offeringBatchDetailSelect,
  });
}

export function findBatchIntegrityRows(
  organizationId: string,
  batchId: string,
  db: {
    donation: {
      findMany: typeof prisma.donation.findMany;
    };
  } = prisma,
) {
  return db.donation.findMany({
    where: { organizationId, batchId },
    select: {
      totalAmount: true,
      allocations: {
        select: { amount: true },
      },
    },
  });
}
