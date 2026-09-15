import { z } from "zod";

import {
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { requireStatementManageAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { isSafeStatementPdfStorageKey } from "@/lib/storage/statement-pdf";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const statementIdSchema = z.string().uuid();
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/i;

export const VIEW_GENERATED_CONTRIBUTION_STATEMENT =
  "VIEW_GENERATED_CONTRIBUTION_STATEMENT";

export type AuthorizedStaffGeneratedStatementPdf =
  | { status: "SIGNED_OUT" }
  | { status: "NOT_AVAILABLE" }
  | {
      status: "AUTHORIZED";
      organizationId: string;
      statementId: string;
      userAccountId: string;
      statementIdentifier: string;
      statementType: "INDIVIDUAL";
      statementStatus: "GENERATED";
      pdfStorageKey: string;
      pdfChecksum: string;
    };

function hasValidChecksum(value: string | null | undefined) {
  return Boolean(value && CHECKSUM_PATTERN.test(value.trim()));
}

/**
 * Staff review of one unpublished INDIVIDUAL statement PDF.
 * Publishing and member visibility are later patches.
 */
export async function authorizeStaffGeneratedStatementPdf(
  statementId: string,
): Promise<AuthorizedStaffGeneratedStatementPdf> {
  const idParsed = statementIdSchema.safeParse(statementId);
  if (!idParsed.success) {
    return { status: "NOT_AVAILABLE" };
  }

  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) {
    return { status: "SIGNED_OUT" };
  }

  const organization = await findPrimaryOrganization();
  if (!organization) {
    return { status: "NOT_AVAILABLE" };
  }

  try {
    await requireStatementManageAccess(organization.id);
  } catch {
    return { status: "NOT_AVAILABLE" };
  }

  const statement = await prisma.contributionStatement.findFirst({
    where: {
      id: idParsed.data,
      organizationId: organization.id,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.GENERATED,
      householdId: null,
    },
    select: {
      id: true,
      organizationId: true,
      statementType: true,
      status: true,
      statementIdentifier: true,
      pdfStorageKey: true,
      pdfChecksum: true,
    },
  });

  if (
    !statement?.pdfStorageKey ||
    !hasValidChecksum(statement.pdfChecksum) ||
    !isSafeStatementPdfStorageKey(
      statement.pdfStorageKey,
      statement.organizationId,
      statement.id,
    )
  ) {
    return { status: "NOT_AVAILABLE" };
  }

  return {
    status: "AUTHORIZED",
    organizationId: statement.organizationId,
    statementId: statement.id,
    userAccountId: userAccount.id,
    statementIdentifier: statement.statementIdentifier,
    statementType: "INDIVIDUAL",
    statementStatus: "GENERATED",
    pdfStorageKey: statement.pdfStorageKey,
    pdfChecksum: statement.pdfChecksum!.trim().toLowerCase(),
  };
}

export async function recordStaffGeneratedStatementView(input: {
  organizationId: string;
  statementId: string;
  userAccountId: string;
  statementIdentifier: string;
}) {
  await createAuditEvent({
    organizationId: input.organizationId,
    actorUserAccountId: input.userAccountId,
    action: VIEW_GENERATED_CONTRIBUTION_STATEMENT,
    entityType: "ContributionStatement",
    entityId: input.statementId,
    changes: [
      {
        field: "statementType",
        oldValue: null,
        newValue: StatementType.INDIVIDUAL,
      },
      {
        field: "statementIdentifier",
        oldValue: null,
        newValue: input.statementIdentifier,
      },
      {
        field: "status",
        oldValue: null,
        newValue: StatementStatus.GENERATED,
      },
    ],
  });
}
