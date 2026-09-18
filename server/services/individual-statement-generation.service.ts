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
 * Generates one unpublished individual contribution statement from current
 * official data. Status is GENERATED only. After a VOIDED individual
 * statement, this same path creates a replacement with a new ID. Publishing,
 * email, and portal visibility remain later reviewed steps.
 */

const donorIdSchema = z.string().uuid();

export const GENERATE_CONTRIBUTION_STATEMENT = "GENERATE_CONTRIBUTION_STATEMENT";
export const REISSUE_CONTRIBUTION_STATEMENT = "REISSUE_CONTRIBUTION_STATEMENT";

export class IndividualStatementGenerationError extends Error {
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
    this.name = "IndividualStatementGenerationError";
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

function individualStatementPeriodWhere(
  organizationId: string,
  donorId: string,
  year: number,
  start: Date,
  end: Date,
) {
  return {
    organizationId,
    statementType: StatementType.INDIVIDUAL,
    donorId,
    householdId: null,
    OR: [
      { taxYear: year },
      { taxYear: null, periodStart: { gte: start, lt: end } },
    ],
  };
}

function blockingIndividualStatementWhere(
  organizationId: string,
  donorId: string,
  year: number,
  start: Date,
  end: Date,
) {
  return {
    ...individualStatementPeriodWhere(organizationId, donorId, year, start, end),
    status: {
      in: [StatementStatus.GENERATED, StatementStatus.PUBLISHED],
    },
  };
}

function voidedIndividualStatementWhere(
  organizationId: string,
  donorId: string,
  year: number,
  start: Date,
  end: Date,
) {
  return {
    ...individualStatementPeriodWhere(organizationId, donorId, year, start, end),
    status: StatementStatus.VOIDED,
  };
}

function createIndividualStatementIdentifier(year: number) {
  return `IND-${year}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function generateIndividualContributionStatement(
  input: { donorId: string; year?: string | string[] },
  now = new Date(),
) {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new IndividualStatementGenerationError(
      "SIGNED_OUT",
      "You must be signed in.",
    );
  }
  if (!organization) {
    throw new IndividualStatementGenerationError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  try {
    await requireStatementManageAccess(organization.id);
  } catch {
    throw new IndividualStatementGenerationError(
      "FORBIDDEN",
      "You do not have permission to generate contribution statements.",
    );
  }

  if (!donorIdSchema.safeParse(input.donorId).success) {
    throw new IndividualStatementGenerationError("NOT_FOUND", "Donor not found.");
  }

  const year = parseStatementReadinessYear(input.year, now);
  const { start, end } = statementYearDateRange(year);
  const periodEnd = new Date(Date.UTC(year, 11, 31));

  const donor = await prisma.donor.findFirst({
    where: { id: input.donorId, organizationId: organization.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      mailingAddressLine1: true,
      mailingAddressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
    },
  });
  if (!donor) {
    throw new IndividualStatementGenerationError("NOT_FOUND", "Donor not found.");
  }
  if (!hasUsableAddress(donor) || !present(donor.mailingAddressLine1)) {
    throw new IndividualStatementGenerationError(
      "INVALID_REQUEST",
      "Add a complete mailing address for this donor before generating an official statement.",
    );
  }

  const organizationName =
    organization.displayName?.trim() || organization.name.trim();
  if (!present(organizationName)) {
    throw new IndividualStatementGenerationError(
      "INVALID_REQUEST",
      "Add a legal or display name in organization settings before generating an official statement.",
    );
  }
  if (!hasUsableAddress(organization)) {
    throw new IndividualStatementGenerationError(
      "INVALID_REQUEST",
      "Complete the church mailing address before generating an official statement.",
    );
  }
  if (!present(organization.statementFooterText)) {
    throw new IndividualStatementGenerationError(
      "INVALID_REQUEST",
      "Add approved statement footer or acknowledgment text before generating an official statement.",
    );
  }

  const existing = await prisma.contributionStatement.findFirst({
    where: blockingIndividualStatementWhere(
      organization.id,
      donor.id,
      year,
      start,
      end,
    ),
    select: { id: true, statementIdentifier: true, status: true },
  });
  if (existing) {
    throw new IndividualStatementGenerationError(
      "ALREADY_EXISTS",
      "An official individual statement already exists for this donor and year.",
    );
  }

  const gifts = await prisma.donation.findMany({
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
  });
  if (gifts.length === 0) {
    throw new IndividualStatementGenerationError(
      "INVALID_REQUEST",
      "This donor has no official gifts in the selected year.",
    );
  }

  const lines = groupPreviewLines(
    gifts.flatMap((gift) =>
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
    gifts.map((gift) => gift.deductibleAmount.toString()),
  );
  const einMissing = !present(organization.ein);
  const generatedAt = now;
  const statementId = randomUUID();
  const statementIdentifier = createIndividualStatementIdentifier(year);
  const storageKey = buildPrivateStatementPdfStorageKey(
    organization.id,
    statementId,
    statementIdentifier,
  );

  const pdfBytes = await renderContributionStatementPdf({
    statementType: "INDIVIDUAL",
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
      name: `${donor.firstName} ${donor.lastName}`.trim(),
      address: {
        line1: donor.mailingAddressLine1!,
        line2: donor.mailingAddressLine2,
        city: donor.city!,
        state: donor.state!,
        postalCode: donor.postalCode!,
        country: donor.country,
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
    throw new IndividualStatementGenerationError(
      written.reason === "ALREADY_EXISTS" ? "ALREADY_EXISTS" : "INVALID_REQUEST",
      written.reason === "ALREADY_EXISTS"
        ? "An official individual statement already exists for this donor and year."
        : "The statement PDF could not be saved.",
    );
  }
  const checksum = written.checksum;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM donors
        WHERE id = ${donor.id}::uuid
          AND "organizationId" = ${organization.id}::uuid
        FOR UPDATE
      `;
      const duplicate = await tx.contributionStatement.findFirst({
        where: blockingIndividualStatementWhere(
          organization.id,
          donor.id,
          year,
          start,
          end,
        ),
        select: { id: true },
      });
      if (duplicate) {
        throw new IndividualStatementGenerationError(
          "ALREADY_EXISTS",
          "An official individual statement already exists for this donor and year.",
        );
      }

      const priorVoided = await tx.contributionStatement.findFirst({
        where: voidedIndividualStatementWhere(
          organization.id,
          donor.id,
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
          statementType: StatementType.INDIVIDUAL,
          donorId: donor.id,
          householdId: null,
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
            { field: "statementType", oldValue: null, newValue: StatementType.INDIVIDUAL },
            { field: "taxYear", oldValue: null, newValue: String(year) },
            { field: "recipientId", oldValue: null, newValue: donor.id },
            { field: "deductibleTotal", oldValue: null, newValue: deductibleTotal },
            {
              field: "statementIdentifier",
              oldValue: null,
              newValue: statementIdentifier,
            },
            { field: "status", oldValue: null, newValue: StatementStatus.GENERATED },
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
                newValue: StatementType.INDIVIDUAL,
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
    if (error instanceof IndividualStatementGenerationError) throw error;
    throw new IndividualStatementGenerationError(
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
  };
}
