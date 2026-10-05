import type { PaymentMethod, Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { CONTRIBUTION_REPORT_PICKER_SIZE } from "@/lib/validation/contribution-report";

export type ContributionReportQuery = {
  organizationId: string;
  start: Date;
  endExclusive: Date;
  donorId?: string | null;
  offeringTypeId?: string | null;
  batchId?: string | null;
  paymentMethod?: PaymentMethod | null;
  includeTest: boolean;
  householdDonorIds?: string[] | null;
};

function donationWhere(input: ContributionReportQuery): Prisma.DonationWhereInput {
  return {
    organizationId: input.organizationId,
    offeringDate: { gte: input.start, lt: input.endExclusive },
    isTest: input.includeTest,
    ...(input.donorId ? { donorId: input.donorId } : {}),
    ...(input.batchId ? { batchId: input.batchId } : {}),
    ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
    ...(input.offeringTypeId
      ? {
          allocations: {
            some: {
              organizationId: input.organizationId,
              offeringTypeId: input.offeringTypeId,
            },
          },
        }
      : {}),
    ...(input.householdDonorIds
      ? {
          donorId: {
            in: input.householdDonorIds.length
              ? input.householdDonorIds
              : ["00000000-0000-4000-8000-000000000000"],
          },
        }
      : {}),
  };
}

const donationSelect = {
  id: true,
  offeringDate: true,
  paymentMethod: true,
  totalAmount: true,
  deductibleAmount: true,
  anonymous: true,
  isTest: true,
  donorId: true,
  batchId: true,
  donor: {
    select: { id: true, firstName: true, lastName: true, active: true },
  },
  batch: {
    select: { id: true, name: true, status: true },
  },
  allocations: {
    select: {
      offeringTypeId: true,
      amount: true,
      offeringType: { select: { id: true, name: true, active: true } },
    },
    orderBy: [{ offeringType: { name: "asc" } }, { id: "asc" }],
  },
} satisfies Prisma.DonationSelect;

export async function countContributionDonations(
  input: ContributionReportQuery,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.donation.count({ where: donationWhere(input) });
}

export async function listContributionDonations(
  input: ContributionReportQuery & { skip?: number; take?: number },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.donation.findMany({
    where: donationWhere(input),
    select: donationSelect,
    orderBy: [{ offeringDate: "asc" }, { id: "asc" }],
    skip: input.skip,
    take: input.take,
  });
}

export async function sumContributionDonations(
  input: ContributionReportQuery,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.donation.aggregate({
    where: donationWhere(input),
    _count: { _all: true },
    _sum: { totalAmount: true, deductibleAmount: true },
  });
}

export async function sumMatchingFundAllocations(
  input: ContributionReportQuery,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (!input.offeringTypeId) return null;
  return tx.donationAllocation.aggregate({
    where: {
      organizationId: input.organizationId,
      offeringTypeId: input.offeringTypeId,
      donation: donationWhere(input),
    },
    _sum: { amount: true },
  });
}

export async function groupContributionAllocations(
  input: ContributionReportQuery,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.donationAllocation.groupBy({
    by: ["offeringTypeId"],
    where: {
      organizationId: input.organizationId,
      ...(input.offeringTypeId ? { offeringTypeId: input.offeringTypeId } : {}),
      donation: donationWhere({ ...input, offeringTypeId: null }),
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
}

export async function listHouseholdMembershipsForDonors(
  organizationId: string,
  donorIds: string[],
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (!donorIds.length) return [];
  return tx.householdMembership.findMany({
    where: { organizationId, donorId: { in: donorIds } },
    select: {
      donorId: true,
      householdId: true,
      startDate: true,
      endDate: true,
      household: { select: { id: true, displayName: true, active: true } },
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
}

export async function listHouseholdDonorIdsInRange(input: {
  organizationId: string;
  householdId: string;
  start: Date;
  endInclusive: Date;
}) {
  const rows = await prisma.householdMembership.findMany({
    where: {
      organizationId: input.organizationId,
      householdId: input.householdId,
      startDate: { lte: input.endInclusive },
      OR: [{ endDate: null }, { endDate: { gte: input.start } }],
    },
    select: { donorId: true },
  });
  return [...new Set(rows.map((row) => row.donorId))];
}

export async function findContributionFilterTargets(input: {
  organizationId: string;
  donorId?: string | null;
  householdId?: string | null;
  offeringTypeId?: string | null;
  batchId?: string | null;
}) {
  const [donor, household, offeringType, batch] = await Promise.all([
    input.donorId
      ? prisma.donor.findFirst({
          where: { id: input.donorId, organizationId: input.organizationId },
          select: { id: true },
        })
      : Promise.resolve(true),
    input.householdId
      ? prisma.household.findFirst({
          where: { id: input.householdId, organizationId: input.organizationId },
          select: { id: true },
        })
      : Promise.resolve(true),
    input.offeringTypeId
      ? prisma.offeringType.findFirst({
          where: {
            id: input.offeringTypeId,
            organizationId: input.organizationId,
          },
          select: { id: true },
        })
      : Promise.resolve(true),
    input.batchId
      ? prisma.offeringBatch.findFirst({
          where: { id: input.batchId, organizationId: input.organizationId },
          select: { id: true },
        })
      : Promise.resolve(true),
  ]);
  return { donor, household, offeringType, batch };
}

export async function listContributionReportPickers(input: {
  organizationId: string;
  donorQuery: string;
  householdQuery: string;
  offeringTypeQuery: string;
  batchQuery: string;
}) {
  const take = CONTRIBUTION_REPORT_PICKER_SIZE;
  const [donors, households, offeringTypes, batches] = await Promise.all([
    prisma.donor.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.donorQuery
          ? {
              OR: [
                { firstName: { contains: input.donorQuery, mode: "insensitive" } },
                { lastName: { contains: input.donorQuery, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take,
    }),
    prisma.household.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.householdQuery
          ? {
              displayName: {
                contains: input.householdQuery,
                mode: "insensitive",
              },
            }
          : {}),
      },
      select: { id: true, displayName: true, active: true },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take,
    }),
    prisma.offeringType.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.offeringTypeQuery
          ? { name: { contains: input.offeringTypeQuery, mode: "insensitive" } }
          : {}),
      },
      select: { id: true, name: true, active: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take,
    }),
    prisma.offeringBatch.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.batchQuery
          ? { name: { contains: input.batchQuery, mode: "insensitive" } }
          : {}),
      },
      select: { id: true, name: true, status: true },
      orderBy: [{ offeringDate: "desc" }, { id: "asc" }],
      take,
    }),
  ]);
  return { donors, households, offeringTypes, batches };
}
