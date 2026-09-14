import { StatementStatus } from "@/app/generated/prisma/client";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { requireStatementViewAccess } from "@/lib/auth/giving-permissions";
import { prisma } from "@/lib/db/prisma";
import {
  parseStatementReadinessYear,
  statementYearDateRange,
} from "@/lib/validation/statement-readiness";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export class StatementReadinessError extends Error {
  constructor(
    public readonly code: "SIGNED_OUT" | "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "StatementReadinessError";
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

async function requireReadinessContext() {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new StatementReadinessError("SIGNED_OUT", "You must be signed in.");
  }
  if (!organization) {
    throw new StatementReadinessError("NOT_FOUND", "Church organization not found.");
  }
  try {
    await requireStatementViewAccess(organization.id);
  } catch {
    throw new StatementReadinessError(
      "FORBIDDEN",
      "You do not have permission to view contribution statements.",
    );
  }
  return organization;
}

export async function getStatementReadiness(
  yearInput?: string | string[],
  now = new Date(),
) {
  const organization = await requireReadinessContext();
  const year = parseStatementReadinessYear(yearInput, now);
  const { start, end } = statementYearDateRange(year);
  const officialWhere = {
    organizationId: organization.id,
    isTest: false,
    offeringDate: { gte: start, lt: end },
  };

  const [giving, givingDonors, statementGroups] = await Promise.all([
    prisma.donation.aggregate({
      where: officialWhere,
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.donor.findMany({
      where: {
        organizationId: organization.id,
        donations: { some: officialWhere },
      },
      select: {
        mailingAddressLine1: true,
        city: true,
        state: true,
        postalCode: true,
      },
    }),
    prisma.contributionStatement.groupBy({
      by: ["status"],
      where: {
        organizationId: organization.id,
        OR: [
          { taxYear: year },
          {
            taxYear: null,
            periodStart: { gte: start, lt: end },
          },
        ],
      },
      _count: { _all: true },
    }),
  ]);

  const donorsMissingAddress = givingDonors.filter(
    (donor) => !hasUsableAddress(donor),
  ).length;
  const statementsByStatus = {
    generated: 0,
    published: 0,
    voided: 0,
  };
  for (const row of statementGroups) {
    if (row.status === StatementStatus.GENERATED) {
      statementsByStatus.generated = row._count._all;
    }
    if (row.status === StatementStatus.PUBLISHED) {
      statementsByStatus.published = row._count._all;
    }
    if (row.status === StatementStatus.VOIDED) {
      statementsByStatus.voided = row._count._all;
    }
  }

  return {
    year,
    organizationName: organization.displayName?.trim() || organization.name,
    checks: {
      organizationName: present(organization.displayName) || present(organization.name),
      organizationAddress: hasUsableAddress(organization),
      ein: present(organization.ein),
      statementFooter: present(organization.statementFooterText),
    },
    giving: {
      donationCount: giving._count._all,
      donationTotal: giving._sum.totalAmount?.toString() ?? "0.00",
      donorCount: givingDonors.length,
      donorsMissingAddress,
    },
    statements: statementsByStatus,
  };
}
