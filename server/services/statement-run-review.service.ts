import {
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";

import { requireStatementViewAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { householdMembershipCoversOfferingDate } from "@/lib/statements/household-membership";
import {
  parseStatementReadinessYear,
  statementYearDateRange,
} from "@/lib/validation/statement-readiness";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export class StatementRunReviewError extends Error {
  constructor(
    public readonly code: "SIGNED_OUT" | "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "StatementRunReviewError";
  }
}

function present(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function hasUsableAddress(row: {
  mailingAddressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}) {
  return (
    present(row.mailingAddressLine1) &&
    present(row.city) &&
    present(row.state) &&
    present(row.postalCode)
  );
}

function emptyStatusCounts() {
  return { generated: 0, published: 0, voided: 0 };
}

function applyStatusCount(
  counts: ReturnType<typeof emptyStatusCounts>,
  status: StatementStatus,
  count: number,
) {
  if (status === StatementStatus.GENERATED) counts.generated = count;
  if (status === StatementStatus.PUBLISHED) counts.published = count;
  if (status === StatementStatus.VOIDED) counts.voided = count;
}

async function requireRunReviewContext() {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new StatementRunReviewError("SIGNED_OUT", "You must be signed in.");
  }
  if (!organization) {
    throw new StatementRunReviewError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  try {
    await requireStatementViewAccess(organization.id);
  } catch {
    throw new StatementRunReviewError(
      "FORBIDDEN",
      "You do not have permission to view contribution statements.",
    );
  }
  return organization;
}

export async function getStatementRunReview(
  yearInput?: string | string[],
  now = new Date(),
) {
  const organization = await requireRunReviewContext();
  const year = parseStatementReadinessYear(yearInput, now);
  const { start, end } = statementYearDateRange(year);
  const officialWhere = {
    organizationId: organization.id,
    isTest: false,
    offeringDate: { gte: start, lt: end },
  };
  const individualWhere = {
    ...officialWhere,
    donorId: { not: null },
  };

  const [giving, individualGrouped, memberships, statementGroups] =
    await Promise.all([
      prisma.donation.aggregate({
        where: officialWhere,
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      prisma.donation.groupBy({
        by: ["donorId"],
        where: individualWhere,
        _count: { _all: true },
      }),
      prisma.householdMembership.findMany({
        where: {
          organizationId: organization.id,
          startDate: { lt: end },
          OR: [{ endDate: null }, { endDate: { gte: start } }],
          household: { organizationId: organization.id },
          donor: { organizationId: organization.id },
        },
        select: {
          householdId: true,
          donorId: true,
          startDate: true,
          endDate: true,
          household: {
            select: {
              mailingAddressLine1: true,
              city: true,
              state: true,
              postalCode: true,
            },
          },
        },
      }),
      prisma.contributionStatement.groupBy({
        by: ["statementType", "status"],
        where: {
          organizationId: organization.id,
          OR: [
            { taxYear: year },
            { taxYear: null, periodStart: { gte: start, lt: end } },
          ],
        },
        _count: { _all: true },
      }),
    ]);

  const individualDonorIds = individualGrouped
    .map((row) => row.donorId)
    .filter((id): id is string => Boolean(id));
  const individualDonors = individualDonorIds.length
    ? await prisma.donor.findMany({
        where: {
          id: { in: individualDonorIds },
          organizationId: organization.id,
        },
        select: {
          mailingAddressLine1: true,
          city: true,
          state: true,
          postalCode: true,
        },
      })
    : [];

  const membershipsByDonor = new Map<string, typeof memberships>();
  for (const membership of memberships) {
    const list = membershipsByDonor.get(membership.donorId) ?? [];
    list.push(membership);
    membershipsByDonor.set(membership.donorId, list);
  }

  const householdGifts =
    membershipsByDonor.size === 0
      ? []
      : await prisma.donation.findMany({
          where: {
            organizationId: organization.id,
            isTest: false,
            anonymous: false,
            donorId: { in: [...membershipsByDonor.keys()] },
            offeringDate: { gte: start, lt: end },
          },
          select: { donorId: true, offeringDate: true },
        });

  const householdsWithGiving = new Map<
    string,
    { mailingAddressComplete: boolean }
  >();
  for (const gift of householdGifts) {
    if (!gift.donorId) continue;
    const rows = membershipsByDonor.get(gift.donorId) ?? [];
    for (const membership of rows) {
      if (
        !householdMembershipCoversOfferingDate(membership, gift.offeringDate)
      ) {
        continue;
      }
      if (!householdsWithGiving.has(membership.householdId)) {
        householdsWithGiving.set(membership.householdId, {
          mailingAddressComplete: hasUsableAddress(membership.household),
        });
      }
    }
  }

  const individual = emptyStatusCounts();
  const household = emptyStatusCounts();
  for (const row of statementGroups) {
    if (row.statementType === StatementType.INDIVIDUAL) {
      applyStatusCount(individual, row.status, row._count._all);
    }
    if (row.statementType === StatementType.HOUSEHOLD) {
      applyStatusCount(household, row.status, row._count._all);
    }
  }

  return {
    year,
    organizationName: organization.displayName?.trim() || organization.name,
    checks: {
      organizationName:
        present(organization.displayName) || present(organization.name),
      organizationAddress: hasUsableAddress(organization),
      ein: present(organization.ein),
      statementFooter: present(organization.statementFooterText),
    },
    giving: {
      donationCount: giving._count._all,
      donationTotal: giving._sum.totalAmount?.toString() ?? "0.00",
    },
    individual: {
      recipientCount: individualDonors.length,
      missingAddressCount: individualDonors.filter(
        (donor) => !hasUsableAddress(donor),
      ).length,
      statements: individual,
    },
    household: {
      recipientCount: householdsWithGiving.size,
      missingAddressCount: [...householdsWithGiving.values()].filter(
        (row) => !row.mailingAddressComplete,
      ).length,
      statements: household,
    },
  };
}
