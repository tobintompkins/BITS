import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

import {
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { requireStatementManageAccess } from "@/lib/auth/giving-permissions";
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
import { renderContributionStatementPdf } from "@/lib/statements/render-contribution-statement-pdf";
import {
  buildPrivateStatementPdfStorageKey,
  deletePrivateStatementPdf,
  writePrivateStatementPdf,
} from "@/lib/storage/statement-pdf";
import {
  parseStatementReadinessYear,
  statementYearDateRange,
} from "@/lib/validation/statement-readiness";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

/**
 * Generates one unpublished household contribution statement from current
 * official household data. Status is GENERATED only. After a VOIDED household
 * statement, this same path creates a replacement with a new ID. Publishing,
 * email, and portal visibility remain later reviewed steps.
 */

const householdIdSchema = z.string().uuid();

export const GENERATE_CONTRIBUTION_STATEMENT = "GENERATE_CONTRIBUTION_STATEMENT";
export const REISSUE_CONTRIBUTION_STATEMENT = "REISSUE_CONTRIBUTION_STATEMENT";

export class HouseholdStatementGenerationError extends Error {
  constructor(
    public readonly code:
      | "SIGNED_OUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INVALID_REQUEST"
      | "ALREADY_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "HouseholdStatementGenerationError";
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

function householdStatementPeriodWhere(
  organizationId: string,
  householdId: string,
  year: number,
  start: Date,
  end: Date,
) {
  return {
    organizationId,
    statementType: StatementType.HOUSEHOLD,
    householdId,
    donorId: null,
    OR: [
      { taxYear: year },
      { taxYear: null, periodStart: { gte: start, lt: end } },
    ],
  };
}

function blockingHouseholdStatementWhere(
  organizationId: string,
  householdId: string,
  year: number,
  start: Date,
  end: Date,
) {
  return {
    ...householdStatementPeriodWhere(
      organizationId,
      householdId,
      year,
      start,
      end,
    ),
    status: {
      in: [StatementStatus.GENERATED, StatementStatus.PUBLISHED],
    },
  };
}

function voidedHouseholdStatementWhere(
  organizationId: string,
  householdId: string,
  year: number,
  start: Date,
  end: Date,
) {
  return {
    ...householdStatementPeriodWhere(
      organizationId,
      householdId,
      year,
      start,
      end,
    ),
    status: StatementStatus.VOIDED,
  };
}

function createHouseholdStatementIdentifier(year: number) {
  return `HH-${year}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function generateHouseholdContributionStatement(
  input: { householdId: string; year?: string | string[] },
  now = new Date(),
) {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new HouseholdStatementGenerationError(
      "SIGNED_OUT",
      "You must be signed in.",
    );
  }
  if (!organization) {
    throw new HouseholdStatementGenerationError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  try {
    await requireStatementManageAccess(organization.id);
  } catch {
    throw new HouseholdStatementGenerationError(
      "FORBIDDEN",
      "You do not have permission to generate contribution statements.",
    );
  }

  if (!householdIdSchema.safeParse(input.householdId).success) {
    throw new HouseholdStatementGenerationError(
      "NOT_FOUND",
      "Household not found.",
    );
  }

  const year = parseStatementReadinessYear(input.year, now);
  const { start, end } = statementYearDateRange(year);
  const periodEnd = new Date(Date.UTC(year, 11, 31));

  const household = await prisma.household.findFirst({
    where: { id: input.householdId, organizationId: organization.id },
    select: {
      id: true,
      displayName: true,
      mailingAddressLine1: true,
      mailingAddressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
    },
  });
  if (!household) {
    throw new HouseholdStatementGenerationError(
      "NOT_FOUND",
      "Household not found.",
    );
  }
  if (!hasUsableAddress(household) || !present(household.mailingAddressLine1)) {
    throw new HouseholdStatementGenerationError(
      "INVALID_REQUEST",
      "Add a complete mailing address for this household before generating an official statement.",
    );
  }

  const organizationName =
    organization.displayName?.trim() || organization.name.trim();
  if (!present(organizationName)) {
    throw new HouseholdStatementGenerationError(
      "INVALID_REQUEST",
      "Add a legal or display name in organization settings before generating an official statement.",
    );
  }
  if (!hasUsableAddress(organization)) {
    throw new HouseholdStatementGenerationError(
      "INVALID_REQUEST",
      "Complete the church mailing address before generating an official statement.",
    );
  }
  if (!present(organization.statementFooterText)) {
    throw new HouseholdStatementGenerationError(
      "INVALID_REQUEST",
      "Add approved statement footer or acknowledgment text before generating an official statement.",
    );
  }

  const existing = await prisma.contributionStatement.findFirst({
    where: blockingHouseholdStatementWhere(
      organization.id,
      household.id,
      year,
      start,
      end,
    ),
    select: { id: true, statementIdentifier: true, status: true },
  });
  if (existing) {
    throw new HouseholdStatementGenerationError(
      "ALREADY_EXISTS",
      "An official household statement already exists for this household and year.",
    );
  }

  const memberships = await prisma.householdMembership.findMany({
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
      donor: { select: { id: true } },
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  const periodMemberships = memberships.filter((membership) =>
    householdMembershipOverlapsPeriod(membership, start, end),
  );
  const includedDonorIds = [
    ...new Set(periodMemberships.map((membership) => membership.donor.id)),
  ];

  const gifts =
    includedDonorIds.length === 0
      ? []
      : await prisma.donation.findMany({
          where: {
            organizationId: organization.id,
            isTest: false,
            anonymous: false,
            donorId: { in: includedDonorIds },
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
  if (includedGifts.length === 0) {
    throw new HouseholdStatementGenerationError(
      "INVALID_REQUEST",
      "This household has no official gifts in the selected year.",
    );
  }

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
  const deductibleTotal = sumMoneyAmounts(
    includedGifts.map((gift) => gift.deductibleAmount.toString()),
  );
  const einMissing = !present(organization.ein);
  const generatedAt = now;
  const statementId = randomUUID();
  const statementIdentifier = createHouseholdStatementIdentifier(year);
  const storageKey = buildPrivateStatementPdfStorageKey(
    organization.id,
    statementId,
    statementIdentifier,
  );

  const pdfBytes = await renderContributionStatementPdf({
    statementType: "HOUSEHOLD",
    statementIdentifier,
    periodStart: start,
    periodEnd,
    generatedAt,
    locale: organization.locale || "en-US",
    organization: {
      name: organizationName,
      address: {
        line1: organization.mailingAddressLine1,
        line2: organization.mailingAddressLine2,
        city: organization.city,
        state: organization.state,
        postalCode: organization.postalCode,
        country: organization.country,
      },
    },
    recipient: {
      name: household.displayName.trim(),
      address: {
        line1: household.mailingAddressLine1,
        line2: household.mailingAddressLine2,
        city: household.city,
        state: household.state,
        postalCode: household.postalCode,
        country: household.country,
      },
    },
    lines,
    deductibleTotal,
    footerText: organization.statementFooterText!.trim(),
  });
  const written = await writePrivateStatementPdf({
    organizationId: organization.id,
    statementId,
    storageKey,
    bytes: pdfBytes,
  });
  if (!written.ok) {
    throw new HouseholdStatementGenerationError(
      written.reason === "ALREADY_EXISTS" ? "ALREADY_EXISTS" : "INVALID_REQUEST",
      written.reason === "ALREADY_EXISTS"
        ? "An official household statement already exists for this household and year."
        : "The statement PDF could not be saved.",
    );
  }
  const checksum = written.checksum;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM households
        WHERE id = ${household.id}::uuid
          AND "organizationId" = ${organization.id}::uuid
        FOR UPDATE
      `;
      const duplicate = await tx.contributionStatement.findFirst({
        where: blockingHouseholdStatementWhere(
          organization.id,
          household.id,
          year,
          start,
          end,
        ),
        select: { id: true },
      });
      if (duplicate) {
        throw new HouseholdStatementGenerationError(
          "ALREADY_EXISTS",
          "An official household statement already exists for this household and year.",
        );
      }

      const priorVoided = await tx.contributionStatement.findFirst({
        where: voidedHouseholdStatementWhere(
          organization.id,
          household.id,
          year,
          start,
          end,
        ),
        orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          statementIdentifier: true,
        },
      });

      await tx.contributionStatement.create({
        data: {
          id: statementId,
          organizationId: organization.id,
          statementType: StatementType.HOUSEHOLD,
          donorId: null,
          householdId: household.id,
          periodStart: start,
          periodEnd,
          taxYear: year,
          deductibleTotal,
          statementIdentifier,
          pdfStorageKey: storageKey,
          pdfChecksum: checksum,
          status: StatementStatus.GENERATED,
          generatedByUserAccountId: actor.id,
          generatedAt,
        },
      });

      await createAuditEvent(
        {
          organizationId: organization.id,
          actorUserAccountId: actor.id,
          action: GENERATE_CONTRIBUTION_STATEMENT,
          entityType: "ContributionStatement",
          entityId: statementId,
          changes: [
            {
              field: "statementType",
              oldValue: null,
              newValue: StatementType.HOUSEHOLD,
            },
            { field: "taxYear", oldValue: null, newValue: String(year) },
            { field: "householdId", oldValue: null, newValue: household.id },
            {
              field: "deductibleTotal",
              oldValue: null,
              newValue: deductibleTotal,
            },
            {
              field: "statementIdentifier",
              oldValue: null,
              newValue: statementIdentifier,
            },
            {
              field: "status",
              oldValue: null,
              newValue: StatementStatus.GENERATED,
            },
          ],
        },
        tx,
      );

      if (priorVoided) {
        await createAuditEvent(
          {
            organizationId: organization.id,
            actorUserAccountId: actor.id,
            action: REISSUE_CONTRIBUTION_STATEMENT,
            entityType: "ContributionStatement",
            entityId: statementId,
            changes: [
              {
                field: "priorStatementId",
                oldValue: null,
                newValue: priorVoided.id,
              },
              {
                field: "priorStatementIdentifier",
                oldValue: null,
                newValue: priorVoided.statementIdentifier,
              },
              {
                field: "replacementStatementId",
                oldValue: null,
                newValue: statementId,
              },
              {
                field: "statementIdentifier",
                oldValue: null,
                newValue: statementIdentifier,
              },
              {
                field: "statementType",
                oldValue: null,
                newValue: StatementType.HOUSEHOLD,
              },
              { field: "taxYear", oldValue: null, newValue: String(year) },
              {
                field: "deductibleTotal",
                oldValue: null,
                newValue: deductibleTotal,
              },
              {
                field: "generatedByUserAccountId",
                oldValue: null,
                newValue: actor.id,
              },
            ],
          },
          tx,
        );
      }
    });
  } catch (error) {
    await deletePrivateStatementPdf({
      organizationId: organization.id,
      statementId,
      storageKey,
    });
    if (error instanceof HouseholdStatementGenerationError) throw error;
    throw new HouseholdStatementGenerationError(
      "INVALID_REQUEST",
      "The statement could not be generated. Try again.",
    );
  }

  return {
    statementId,
    statementIdentifier,
    status: StatementStatus.GENERATED,
    einMissing,
    year,
    householdId: household.id,
  };
}
