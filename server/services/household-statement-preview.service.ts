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
  householdMembershipCoversOfferingDate,
  householdMembershipOverlapsPeriod,
} from "@/lib/statements/household-membership";
import {
  groupPreviewLines,
  previewLinesForGift,
} from "@/lib/statements/preview-lines";
import {
  parseStatementReadinessYear,
  statementYearDateRange,
} from "@/lib/validation/statement-readiness";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const householdIdSchema = z.string().uuid();

export class HouseholdStatementPreviewError extends Error {
  constructor(
    public readonly code: "SIGNED_OUT" | "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "HouseholdStatementPreviewError";
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

function displayName(row: { firstName: string; lastName: string }) {
  return `${row.firstName} ${row.lastName}`.trim();
}

function pickHouseholdStatement(
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
    throw new HouseholdStatementPreviewError(
      "SIGNED_OUT",
      "You must be signed in.",
    );
  }
  if (!organization) {
    throw new HouseholdStatementPreviewError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  try {
    await requireStatementViewAccess(organization.id);
  } catch {
    throw new HouseholdStatementPreviewError(
      "FORBIDDEN",
      "You do not have permission to view contribution statements.",
    );
  }
  return organization;
}

export async function listHouseholdsForStatementPreview() {
  const organization = await requirePreviewContext();
  return prisma.household.findMany({
    where: { organizationId: organization.id },
    orderBy: { displayName: "asc" },
    take: 100,
    select: { id: true, displayName: true },
  });
}

export async function getHouseholdStatementPreview(
  householdId: string,
  yearInput?: string | string[],
  now = new Date(),
) {
  const organization = await requirePreviewContext();
  if (!householdIdSchema.safeParse(householdId).success) {
    throw new HouseholdStatementPreviewError(
      "NOT_FOUND",
      "Household not found.",
    );
  }

  const year = parseStatementReadinessYear(yearInput, now);
  const { start, end } = statementYearDateRange(year);

  const household = await prisma.household.findFirst({
    where: { id: householdId, organizationId: organization.id },
    select: {
      id: true,
      displayName: true,
      mailingAddressLine1: true,
      mailingAddressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      preferredStatementRecipient: {
        select: { firstName: true, lastName: true },
      },
    },
  });
  if (!household) {
    throw new HouseholdStatementPreviewError(
      "NOT_FOUND",
      "Household not found.",
    );
  }

  const [memberships, statements] = await Promise.all([
    prisma.householdMembership.findMany({
      where: {
        organizationId: organization.id,
        householdId: household.id,
        startDate: { lt: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
        donor: { organizationId: organization.id },
      },
      select: {
        startDate: true,
        endDate: true,
        donor: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    }),
    prisma.contributionStatement.findMany({
      where: {
        organizationId: organization.id,
        statementType: StatementType.HOUSEHOLD,
        householdId: household.id,
        OR: [
          { taxYear: year },
          { taxYear: null, periodStart: { gte: start, lt: end } },
        ],
      },
      select: { status: true, statementIdentifier: true },
    }),
  ]);

  const periodMemberships = memberships.filter((membership) =>
    householdMembershipOverlapsPeriod(membership, start, end),
  );
  const includedDonors = [
    ...new Map(
      periodMemberships.map((membership) => [
        membership.donor.id,
        {
          id: membership.donor.id,
          displayName: displayName(membership.donor),
        },
      ]),
    ).values(),
  ].sort((left, right) => left.displayName.localeCompare(right.displayName));

  const gifts =
    includedDonors.length === 0
      ? []
      : await prisma.donation.findMany({
          where: {
            organizationId: organization.id,
            isTest: false,
            anonymous: false,
            donorId: { in: includedDonors.map((donor) => donor.id) },
            offeringDate: { gte: start, lt: end },
          },
          orderBy: [{ offeringDate: "asc" }, { id: "asc" }],
          select: {
            donorId: true,
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
        });

  const membershipsByDonor = new Map<string, typeof periodMemberships>();
  for (const membership of periodMemberships) {
    const list = membershipsByDonor.get(membership.donor.id) ?? [];
    list.push(membership);
    membershipsByDonor.set(membership.donor.id, list);
  }

  const includedGifts = gifts.filter((gift) => {
    if (!gift.donorId) return false;
    const rows = membershipsByDonor.get(gift.donorId) ?? [];
    return rows.some((membership) =>
      householdMembershipCoversOfferingDate(membership, gift.offeringDate),
    );
  });

  const lines = groupPreviewLines(
    includedGifts.flatMap((gift) =>
      previewLinesForGift({
        offeringDate: gift.offeringDate,
        totalAmount: gift.totalAmount,
        deductibleAmount: gift.deductibleAmount,
        allocations: gift.allocations.map((allocation) => ({
          amount: allocation.amount,
          fundName: allocation.offeringType.name,
        })),
      }),
    ),
  );
  const existingStatement = pickHouseholdStatement(statements);

  return {
    year,
    periodStart: start,
    periodEndExclusive: end,
    household: {
      id: household.id,
      displayName: household.displayName,
      mailingAddressLine1: household.mailingAddressLine1,
      mailingAddressLine2: household.mailingAddressLine2,
      city: household.city,
      state: household.state,
      postalCode: household.postalCode,
      country: household.country,
      mailingAddressComplete: hasUsableAddress(household),
      preferredStatementRecipient: household.preferredStatementRecipient
        ? {
            displayName: displayName(household.preferredStatementRecipient),
          }
        : null,
      includedDonors: includedDonors.map((donor) => ({
        displayName: donor.displayName,
      })),
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
    giftCount: includedGifts.length,
    deductibleTotal: sumMoneyAmounts(
      includedGifts.map((gift) => gift.deductibleAmount.toString()),
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
