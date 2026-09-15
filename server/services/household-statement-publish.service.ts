import { z } from "zod";

import {
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { requireStatementManageAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  isSafeStatementPdfStorageKey,
  openAuthorizedStatementPdf,
} from "@/lib/storage/statement-pdf";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const statementIdSchema = z.string().uuid();
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/i;

export const PUBLISH_CONTRIBUTION_STATEMENT = "PUBLISH_CONTRIBUTION_STATEMENT";
export const TWO_PERSON_PUBLISH_MESSAGE =
  "A different authorized person must review and publish this statement.";

export class HouseholdStatementPublishError extends Error {
  constructor(
    public readonly code:
      | "SIGNED_OUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INVALID_REQUEST"
      | "SAME_PERSON"
      | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "HouseholdStatementPublishError";
  }
}

function hasValidChecksum(value: string | null | undefined) {
  return Boolean(value && CHECKSUM_PATTERN.test(value.trim()));
}

async function confirmPrivateStatementPdf(input: {
  organizationId: string;
  statementId: string;
  storageKey: string;
  checksum: string;
}) {
  const opened = await openAuthorizedStatementPdf({
    organizationId: input.organizationId,
    statementId: input.statementId,
    storageKey: input.storageKey,
    checksum: input.checksum,
  });
  if (!opened.ok) {
    return false;
  }
  opened.stream.destroy();
  return true;
}

/**
 * Two-person approval: a second authorized manager publishes a reviewed
 * HOUSEHOLD statement from GENERATED to PUBLISHED. Email is a later patch.
 */
export async function publishHouseholdContributionStatement(input: {
  statementId: string;
}) {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new HouseholdStatementPublishError(
      "SIGNED_OUT",
      "You must be signed in.",
    );
  }
  if (!organization) {
    throw new HouseholdStatementPublishError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  try {
    await requireStatementManageAccess(organization.id);
  } catch {
    throw new HouseholdStatementPublishError(
      "FORBIDDEN",
      "You do not have permission to publish contribution statements.",
    );
  }

  if (!statementIdSchema.safeParse(input.statementId).success) {
    throw new HouseholdStatementPublishError("NOT_FOUND", "Statement not found.");
  }

  const statement = await prisma.contributionStatement.findFirst({
    where: {
      id: input.statementId,
      organizationId: organization.id,
      statementType: StatementType.HOUSEHOLD,
      status: StatementStatus.GENERATED,
      donorId: null,
    },
    select: {
      id: true,
      organizationId: true,
      statementType: true,
      status: true,
      statementIdentifier: true,
      pdfStorageKey: true,
      pdfChecksum: true,
      generatedByUserAccountId: true,
      taxYear: true,
      deductibleTotal: true,
      donorId: true,
      householdId: true,
      household: { select: { id: true, organizationId: true } },
    },
  });

  if (
    statement?.donorId != null ||
    !statement?.householdId ||
    !statement.household ||
    statement.household.organizationId !== organization.id ||
    statement.household.id !== statement.householdId
  ) {
    throw new HouseholdStatementPublishError("NOT_FOUND", "Statement not found.");
  }

  if (statement.generatedByUserAccountId === actor.id) {
    throw new HouseholdStatementPublishError(
      "SAME_PERSON",
      TWO_PERSON_PUBLISH_MESSAGE,
    );
  }

  if (
    !statement.pdfStorageKey ||
    !hasValidChecksum(statement.pdfChecksum) ||
    !isSafeStatementPdfStorageKey(
      statement.pdfStorageKey,
      statement.organizationId,
      statement.id,
    )
  ) {
    throw new HouseholdStatementPublishError(
      "UNAVAILABLE",
      "This statement PDF could not be verified. It cannot be published.",
    );
  }

  const pdfOk = await confirmPrivateStatementPdf({
    organizationId: statement.organizationId,
    statementId: statement.id,
    storageKey: statement.pdfStorageKey,
    checksum: statement.pdfChecksum!.trim().toLowerCase(),
  });
  if (!pdfOk) {
    throw new HouseholdStatementPublishError(
      "UNAVAILABLE",
      "This statement PDF could not be verified. It cannot be published.",
    );
  }

  const deductibleTotal = statement.deductibleTotal.toString();

  await prisma.$transaction(async (tx) => {
    const stillGenerated = await tx.contributionStatement.findFirst({
      where: {
        id: statement.id,
        organizationId: organization.id,
        statementType: StatementType.HOUSEHOLD,
        status: StatementStatus.GENERATED,
        donorId: null,
      },
      select: { generatedByUserAccountId: true },
    });
    if (!stillGenerated) {
      throw new HouseholdStatementPublishError(
        "INVALID_REQUEST",
        "This statement was already published or is no longer available to publish.",
      );
    }
    if (stillGenerated.generatedByUserAccountId === actor.id) {
      throw new HouseholdStatementPublishError(
        "SAME_PERSON",
        TWO_PERSON_PUBLISH_MESSAGE,
      );
    }

    const updated = await tx.contributionStatement.updateMany({
      where: {
        id: statement.id,
        organizationId: organization.id,
        statementType: StatementType.HOUSEHOLD,
        householdId: statement.householdId,
        donorId: null,
        status: StatementStatus.GENERATED,
      },
      data: { status: StatementStatus.PUBLISHED },
    });
    if (updated.count !== 1) {
      throw new HouseholdStatementPublishError(
        "INVALID_REQUEST",
        "This statement was already published or is no longer available to publish.",
      );
    }

    await createAuditEvent(
      {
        organizationId: organization.id,
        actorUserAccountId: actor.id,
        action: PUBLISH_CONTRIBUTION_STATEMENT,
        entityType: "ContributionStatement",
        entityId: statement.id,
        changes: [
          {
            field: "status",
            oldValue: StatementStatus.GENERATED,
            newValue: StatementStatus.PUBLISHED,
          },
          {
            field: "statementType",
            oldValue: null,
            newValue: StatementType.HOUSEHOLD,
          },
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: statement.statementIdentifier,
          },
          {
            field: "taxYear",
            oldValue: null,
            newValue:
              statement.taxYear == null ? null : String(statement.taxYear),
          },
          {
            field: "deductibleTotal",
            oldValue: null,
            newValue: deductibleTotal,
          },
          {
            field: "generatedByUserAccountId",
            oldValue: null,
            newValue: statement.generatedByUserAccountId,
          },
          {
            field: "publishedByUserAccountId",
            oldValue: null,
            newValue: actor.id,
          },
        ],
      },
      tx,
    );
  });

  return {
    statementId: statement.id,
    statementIdentifier: statement.statementIdentifier,
    householdId: statement.householdId,
    taxYear: statement.taxYear,
    status: StatementStatus.PUBLISHED,
  };
}
