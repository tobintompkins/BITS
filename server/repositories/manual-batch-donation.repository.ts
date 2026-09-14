import type { Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";

const donationListSelect = {
  id: true,
  offeringDate: true,
  paymentMethod: true,
  totalAmount: true,
  deductibleAmount: true,
  anonymous: true,
  isTest: true,
  stripeCheckoutSessionId: true,
  createdAt: true,
  donor: {
    select: { firstName: true, lastName: true },
  },
  allocations: {
    select: {
      amount: true,
      offeringType: { select: { name: true } },
    },
    orderBy: { offeringType: { displayOrder: "asc" } },
  },
} satisfies Prisma.DonationSelect;

export function findActiveOfferingTypes(organizationId: string) {
  return prisma.offeringType.findMany({
    where: { organizationId, active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

export function findActiveDonorsForBatchEntry(
  organizationId: string,
  where: Prisma.DonorWhereInput,
) {
  return prisma.donor.findMany({
    where: {
      organizationId,
      active: true,
      ...where,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 20,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      householdMemberships: {
        where: {
          endDate: null,
          organizationId,
          household: { organizationId, active: true },
        },
        select: { household: { select: { displayName: true } } },
        take: 1,
      },
    },
  });
}

export function findBatchDonations(
  organizationId: string,
  batchId: string,
  args: { skip: number; take: number },
) {
  return prisma.donation.findMany({
    where: { organizationId, batchId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: args.skip,
    take: args.take,
    select: donationListSelect,
  });
}

export function countBatchDonations(organizationId: string, batchId: string) {
  return prisma.donation.count({
    where: { organizationId, batchId },
  });
}
