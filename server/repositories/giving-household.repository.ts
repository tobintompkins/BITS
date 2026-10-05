import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  GIVING_HOUSEHOLD_PICKER_PAGE_SIZE,
  GIVING_HOUSEHOLD_SEARCH_MAX,
  boundedPickerPage,
} from "@/lib/validation/giving-household";

const listSelect = {
  id: true,
  displayName: true,
  mailingAddressLine1: true,
  mailingAddressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  statementDeliveryMethod: true,
  primaryDonorId: true,
  preferredStatementRecipientId: true,
  active: true,
  updatedAt: true,
} as const;

/**
 * Lock protocol for giving-household writers:
 * 1. Lock tenant-scoped household rows in sorted ID order.
 * 2. Lock tenant-scoped donor rows in sorted ID order.
 * Settings, link, move and end all use this order so household-then-donor
 * never crosses a donor-then-household path.
 */
export async function lockHouseholdInOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
  householdId: string,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM households
    WHERE id = ${householdId}::uuid
      AND "organizationId" = ${organizationId}::uuid
    FOR UPDATE
  `;
  return locked[0] ?? null;
}

export async function lockHouseholdsInSortedOrder(
  tx: Prisma.TransactionClient,
  organizationId: string,
  householdIds: string[],
) {
  const unique = [...new Set(householdIds.filter(Boolean))].sort();
  const locked: Array<{ id: string }> = [];
  for (const householdId of unique) {
    const row = await lockHouseholdInOrganization(tx, organizationId, householdId);
    if (!row) return { missingId: householdId, locked };
    locked.push(row);
  }
  return { missingId: null, locked };
}

export async function lockDonorInOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
  donorId: string,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM donors
    WHERE id = ${donorId}::uuid
      AND "organizationId" = ${organizationId}::uuid
    FOR UPDATE
  `;
  return locked[0] ?? null;
}

export async function lockDonorsInSortedOrder(
  tx: Prisma.TransactionClient,
  organizationId: string,
  donorIds: string[],
) {
  const unique = [...new Set(donorIds.filter(Boolean))].sort();
  const locked: Array<{ id: string }> = [];
  for (const donorId of unique) {
    const row = await lockDonorInOrganization(tx, organizationId, donorId);
    if (!row) return { missingId: donorId, locked };
    locked.push(row);
  }
  return { missingId: null, locked };
}

export async function listGivingHouseholds(input: {
  organizationId: string;
  query?: string;
  status?: string;
  skip: number;
  take: number;
}) {
  const q = input.query?.trim() ?? "";
  const where: Prisma.HouseholdWhereInput = {
    organizationId: input.organizationId,
    ...(input.status === "inactive"
      ? { active: false }
      : input.status === "all"
        ? {}
        : { active: true }),
    ...(q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" as const } },
            { city: { contains: q, mode: "insensitive" as const } },
            { mailingAddressLine1: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.household.findMany({
      where,
      select: listSelect,
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      skip: input.skip,
      take: input.take,
    }),
    prisma.household.count({ where }),
  ]);

  return { rows, total };
}

export async function findGivingHouseholdInOrganization(
  organizationId: string,
  id: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.household.findFirst({
    where: { id, organizationId },
    include: {
      primaryDonor: {
        select: { id: true, firstName: true, lastName: true, active: true },
      },
      preferredStatementRecipient: {
        select: { id: true, firstName: true, lastName: true, active: true },
      },
      memberships: {
        include: {
          donor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              active: true,
              userAccountId: true,
            },
          },
        },
        orderBy: [{ startDate: "desc" }, { id: "desc" }],
      },
    },
  });
}

export async function listDonorGivingHouseholdMemberships(
  organizationId: string,
  donorId: string,
) {
  return prisma.householdMembership.findMany({
    where: { organizationId, donorId },
    include: {
      household: { select: { id: true, displayName: true, active: true } },
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });
}

export async function listUnassignedGivingDonorsForOrganization(input: {
  organizationId: string;
  query?: string;
  page: number;
}) {
  const q = (input.query ?? "").trim().slice(0, GIVING_HOUSEHOLD_SEARCH_MAX);
  const page = boundedPickerPage(input.page);
  const where: Prisma.DonorWhereInput = {
    organizationId: input.organizationId,
    active: true,
    householdMemberships: {
      none: {
        organizationId: input.organizationId,
        endDate: null,
      },
    },
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.donor.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      skip: (page - 1) * GIVING_HOUSEHOLD_PICKER_PAGE_SIZE,
      take: GIVING_HOUSEHOLD_PICKER_PAGE_SIZE,
    }),
    prisma.donor.count({ where }),
  ]);
  return { rows, total, page, q };
}

export async function listGivingHouseholdMoveTargetsForOrganization(input: {
  organizationId: string;
  excludeHouseholdId: string;
  query?: string;
  page: number;
}) {
  const q = (input.query ?? "").trim().slice(0, GIVING_HOUSEHOLD_SEARCH_MAX);
  const page = boundedPickerPage(input.page);
  const where: Prisma.HouseholdWhereInput = {
    organizationId: input.organizationId,
    id: { not: input.excludeHouseholdId },
    active: true,
    ...(q
      ? { displayName: { contains: q, mode: "insensitive" as const } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.household.findMany({
      where,
      select: { id: true, displayName: true },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      skip: (page - 1) * GIVING_HOUSEHOLD_PICKER_PAGE_SIZE,
      take: GIVING_HOUSEHOLD_PICKER_PAGE_SIZE,
    }),
    prisma.household.count({ where }),
  ]);
  return { rows, total, page, q };
}
