import { z } from "zod";

import {
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { requireStatementViewAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { sumMoneyAmounts } from "@/lib/money/decimal";
import {
  groupPreviewLines,
  previewLinesForGift,
} from "@/lib/statements/preview-lines";
import {
  parseStatementReadinessYear,
  statementYearDateRange,
} from "@/lib/validation/statement-readiness";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export { previewLinesForGift } from "@/lib/statements/preview-lines";

const donorIdSchema = z.string().uuid();

export class IndividualStatementPreviewError extends Error {
  constructor(
    public readonly code: "SIGNED_OUT" | "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "IndividualStatementPreviewError";
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

function pickIndividualStatement(
  rows: Array<{ status: StatementStatus; statementIdentifier: string }>,
) {
  const rank: Record<StatementStatus, number> = {
    [StatementStatus.PUBLISHED]: 0,
    [StatementStatus.GENERATED]: 1,
    [StatementStatus.VOIDED]: 2,
  };
  return (
    [...rows].sort((left, right) => rank[left.status] - rank[right.status])[0] ??
    null
  );
}

async function requirePreviewContext() {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new IndividualStatementPreviewError(
      "SIGNED_OUT",
      "You must be signed in.",
    );
  }
  if (!organization) {
    throw new IndividualStatementPreviewError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  try {
    await requireStatementViewAccess(organization.id);
  } catch {
    throw new IndividualStatementPreviewError(
      "FORBIDDEN",
      "You do not have permission to view contribution statements.",
    );
  }
  return organization;
}

export async function getIndividualStatementPreview(
  donorId: string,
  yearInput?: string | string[],
  now = new Date(),
) {
  const organization = await requirePreviewContext();
  if (!donorIdSchema.safeParse(donorId).success) {
    throw new IndividualStatementPreviewError("NOT_FOUND", "Donor not found.");
  }

  const year = parseStatementReadinessYear(yearInput, now);
  const { start, end } = statementYearDateRange(year);

  const donor = await prisma.donor.findFirst({
    where: { id: donorId, organizationId: organization.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      mailingAddressLine1: true,
      mailingAddressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
    },
  });
  if (!donor) {
    throw new IndividualStatementPreviewError("NOT_FOUND", "Donor not found.");
  }

  const [gifts, statements] = await Promise.all([
    prisma.donation.findMany({
      where: {
        organizationId: organization.id,
        donorId: donor.id,
        isTest: false,
        anonymous: false,
        offeringDate: { gte: start, lt: end },
      },
      orderBy: [{ offeringDate: "asc" }, { id: "asc" }],
      select: {
        offeringDate: true,
        totalAmount: true,
        deductibleAmount: true,
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
    }),
    prisma.contributionStatement.findMany({
      where: {
        organizationId: organization.id,
        statementType: StatementType.INDIVIDUAL,
        donorId: donor.id,
        OR: [
          { taxYear: year },
          { taxYear: null, periodStart: { gte: start, lt: end } },
        ],
      },
      select: { status: true, statementIdentifier: true },
    }),
  ]);

  const ungroupedLines = gifts.flatMap((gift) =>
    previewLinesForGift({
      offeringDate: gift.offeringDate,
      totalAmount: gift.totalAmount,
      deductibleAmount: gift.deductibleAmount,
      allocations: gift.allocations.map((allocation) => ({
        amount: allocation.amount,
        fundName: allocation.offeringType.name,
      })),
    }),
  );
  const lines = groupPreviewLines(ungroupedLines);
  const existingStatement = pickIndividualStatement(statements);

  return {
    year,
    periodStart: start,
    periodEndExclusive: end,
    donor: {
      id: donor.id,
      displayName: `${donor.firstName} ${donor.lastName}`.trim(),
      email: donor.email,
      mailingAddressLine1: donor.mailingAddressLine1,
      mailingAddressLine2: donor.mailingAddressLine2,
      city: donor.city,
      state: donor.state,
      postalCode: donor.postalCode,
      country: donor.country,
      mailingAddressComplete: hasUsableAddress(donor),
    },
    organization: {
      name: organization.displayName?.trim() || organization.name,
      mailingAddressLine1: organization.mailingAddressLine1,
      mailingAddressLine2: organization.mailingAddressLine2,
      city: organization.city,
      state: organization.state,
      postalCode: organization.postalCode,
      country: organization.country,
      einPresent: present(organization.ein),
      statementFooterText: organization.statementFooterText,
    },
    giftCount: gifts.length,
    deductibleTotal: sumMoneyAmounts(
      gifts.map((gift) => gift.deductibleAmount.toString()),
    ),
    lines,
    statement: existingStatement
      ? {
          exists: true,
          status: existingStatement.status,
          statementIdentifier: existingStatement.statementIdentifier,
        }
      : { exists: false, status: null, statementIdentifier: null },
  };
}
