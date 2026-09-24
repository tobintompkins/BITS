import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { sumMoneyAmounts } from "@/lib/money/decimal";
import {
  MEMBER_GIVING_HISTORY_PAGE_SIZE,
  parseMemberGivingHistoryQuery,
} from "@/lib/validation/member-giving-history";
import {
  statementYearBounds,
  statementYearDateRange,
} from "@/lib/validation/statement-readiness";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const fundIdSchema = z.string().uuid();

function moneyTotal(
  value: { toString(): string } | string | number | null | undefined,
) {
  if (value == null) return "0.00";
  return sumMoneyAmounts([value.toString()]);
}

/**
 * Member-facing giving history for the signed-in connected donor only.
 * Queries are always scoped to the current organization and linked donor.
 * Donor IDs are never taken from the URL or client.
 */
export async function getMemberGivingHistory(
  input: Record<string, string | string[] | undefined> = {},
  now = new Date(),
) {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const donor = await prisma.donor.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      active: true,
    },
    select: { id: true },
  });
  if (!donor) {
    return {
      status: "CONNECTION_PENDING" as const,
      accountEmail: userAccount.primaryEmail,
    };
  }

  const parsed = parseMemberGivingHistoryQuery(input, now);
  const { start, end } = statementYearDateRange(parsed.year);
  const { min, max } = statementYearBounds(now);
  const availableYears: number[] = [];
  for (let year = max; year >= min; year -= 1) {
    availableYears.push(year);
  }

  const donorYearWhere = {
    organizationId: organization.id,
    donorId: donor.id,
    offeringDate: { gte: start, lt: end },
  };

  const funds = await prisma.offeringType.findMany({
    where: {
      organizationId: organization.id,
      allocations: {
        some: {
          organizationId: organization.id,
          donation: donorYearWhere,
        },
      },
    },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const fund =
    parsed.fund !== "all" &&
    fundIdSchema.safeParse(parsed.fund).success &&
    funds.some((row) => row.id === parsed.fund)
      ? parsed.fund
      : "all";

  const giftWhere = {
    ...donorYearWhere,
    ...(fund === "all"
      ? {}
      : {
          allocations: {
            some: {
              organizationId: organization.id,
              offeringTypeId: fund,
              offeringType: { organizationId: organization.id },
            },
          },
        }),
  };

  const [official, test, totalCount] = await Promise.all([
    prisma.donation.aggregate({
      where: { ...giftWhere, isTest: false },
      _sum: { totalAmount: true, deductibleAmount: true },
      _count: { _all: true },
    }),
    prisma.donation.aggregate({
      where: { ...giftWhere, isTest: true },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.donation.count({ where: giftWhere }),
  ]);

  const pageCount = Math.max(
    1,
    Math.ceil(totalCount / MEMBER_GIVING_HISTORY_PAGE_SIZE),
  );
  const page = Math.min(parsed.page, pageCount);
  const rows = await prisma.donation.findMany({
    where: giftWhere,
    orderBy: [{ offeringDate: "desc" }, { id: "desc" }],
    skip: (page - 1) * MEMBER_GIVING_HISTORY_PAGE_SIZE,
    take: MEMBER_GIVING_HISTORY_PAGE_SIZE,
    select: {
      id: true,
      offeringDate: true,
      totalAmount: true,
      deductibleAmount: true,
      isTest: true,
      allocations: {
        where: {
          organizationId: organization.id,
          offeringType: { organizationId: organization.id },
        },
        select: {
          amount: true,
          offeringType: { select: { name: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  const testCount = test._count._all;
  return {
    status: "READY" as const,
    year: parsed.year,
    availableYears,
    fund,
    funds: funds.map((row) => ({ id: row.id, name: row.name })),
    page,
    pageSize: MEMBER_GIVING_HISTORY_PAGE_SIZE,
    pageCount,
    totalCount,
    official: {
      giftCount: official._count._all,
      totalAmount: moneyTotal(official._sum.totalAmount),
      deductibleAmount: moneyTotal(official._sum.deductibleAmount),
    },
    test:
      testCount > 0
        ? {
            giftCount: testCount,
            totalAmount: moneyTotal(test._sum.totalAmount),
          }
        : null,
    gifts: rows.map((gift) => ({
      id: gift.id,
      offeringDate: gift.offeringDate,
      totalAmount: gift.totalAmount.toString(),
      deductibleAmount: gift.deductibleAmount.toString(),
      isTest: gift.isTest,
      allocations: gift.allocations.map((allocation) => ({
        fund: allocation.offeringType.name,
        amount: allocation.amount.toString(),
      })),
    })),
  };
}
