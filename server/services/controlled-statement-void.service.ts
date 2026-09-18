import { z } from "zod";

import {
  StatementStatus,
  StatementType,
  StatementVoidRequestStatus,
} from "@/app/generated/prisma/client";
import { requireStatementManageAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { executeStatementVoidRequestSchema } from "@/lib/validation/controlled-statement-void";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export const VOID_CONTRIBUTION_STATEMENT = "VOID_CONTRIBUTION_STATEMENT";
export const EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST =
  "EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST";

const requestIdSchema = z.string().uuid();

export class ControlledStatementVoidError extends Error {
  constructor(
    public readonly code:
      | "SIGNED_OUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INVALID_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "ControlledStatementVoidError";
  }
}

function isValidStatementShape(
  statement: {
    statementType: StatementType;
    statementIdentifier: string;
    donorId: string | null;
    householdId: string | null;
    donor: { id: string; organizationId: string } | null;
    household: { id: string; organizationId: string } | null;
  },
  organizationId: string,
) {
  if (!statement.statementIdentifier.trim()) return false;
  const individual =
    statement.statementType === StatementType.INDIVIDUAL &&
    statement.householdId == null &&
    statement.donor &&
    statement.donor.organizationId === organizationId &&
    statement.donor.id === statement.donorId;
  const household =
    statement.statementType === StatementType.HOUSEHOLD &&
    statement.donorId == null &&
    statement.household &&
    statement.household.organizationId === organizationId &&
    statement.household.id === statement.householdId;
  return Boolean(individual || household);
}

async function requireExecuteContext() {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new ControlledStatementVoidError(
      "SIGNED_OUT",
      "You must be signed in.",
    );
  }
  if (!organization) {
    throw new ControlledStatementVoidError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  try {
    await requireStatementManageAccess(organization.id);
  } catch {
    throw new ControlledStatementVoidError(
      "FORBIDDEN",
      "You do not have permission to execute a statement void.",
    );
  }
  return { actor, organization };
}

/**
 * Executes an approved void request. Marks the statement VOIDED without
 * deleting the record, PDF, or generated totals. Portal access ends because
 * portal queries only return PUBLISHED statements.
 */
export async function executeApprovedStatementVoid(input: {
  requestId: string;
  confirmed: unknown;
}) {
  const { actor, organization } = await requireExecuteContext();
  if (!requestIdSchema.safeParse(input.requestId).success) {
    throw new ControlledStatementVoidError(
      "NOT_FOUND",
      "Statement void request not found.",
    );
  }
  const parsed = executeStatementVoidRequestSchema.safeParse({
    confirmed: input.confirmed,
  });
  if (!parsed.success) {
    throw new ControlledStatementVoidError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ??
        "Confirm that portal access will be revoked immediately.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const lockedRequest = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM statement_void_requests
      WHERE id = ${input.requestId}::uuid
        AND "organizationId" = ${organization.id}::uuid
      FOR UPDATE
    `;
    if (!lockedRequest[0]) {
      throw new ControlledStatementVoidError(
        "NOT_FOUND",
        "Statement void request not found.",
      );
    }

    const request = await tx.statementVoidRequest.findFirst({
      where: { id: input.requestId, organizationId: organization.id },
      select: {
        id: true,
        status: true,
        contributionStatementId: true,
        requestedByUserAccountId: true,
        reviewedByUserAccountId: true,
      },
    });
    if (!request) {
      throw new ControlledStatementVoidError(
        "NOT_FOUND",
        "Statement void request not found.",
      );
    }
    if (request.requestedByUserAccountId === actor.id) {
      throw new ControlledStatementVoidError(
        "FORBIDDEN",
        "The person who requested this void cannot execute it.",
      );
    }
    if (request.reviewedByUserAccountId !== actor.id) {
      throw new ControlledStatementVoidError(
        "FORBIDDEN",
        "Only the person who approved this void request can execute it.",
      );
    }
    if (request.status !== StatementVoidRequestStatus.APPROVED) {
      throw new ControlledStatementVoidError(
        "INVALID_REQUEST",
        "Only an approved void request can be executed.",
      );
    }

    const lockedStatement = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM contribution_statements
      WHERE id = ${request.contributionStatementId}::uuid
        AND "organizationId" = ${organization.id}::uuid
      FOR UPDATE
    `;
    if (!lockedStatement[0]) {
      throw new ControlledStatementVoidError(
        "NOT_FOUND",
        "Statement void request not found.",
      );
    }

    const statement = await tx.contributionStatement.findFirst({
      where: {
        id: request.contributionStatementId,
        organizationId: organization.id,
      },
      select: {
        id: true,
        status: true,
        statementType: true,
        statementIdentifier: true,
        taxYear: true,
        deductibleTotal: true,
        donorId: true,
        householdId: true,
        donor: { select: { id: true, organizationId: true } },
        household: { select: { id: true, organizationId: true } },
      },
    });
    if (!statement || !isValidStatementShape(statement, organization.id)) {
      throw new ControlledStatementVoidError(
        "NOT_FOUND",
        "Statement void request not found.",
      );
    }
    if (statement.status === StatementStatus.VOIDED) {
      throw new ControlledStatementVoidError(
        "INVALID_REQUEST",
        "This statement has already been voided.",
      );
    }
    if (
      statement.status !== StatementStatus.GENERATED &&
      statement.status !== StatementStatus.PUBLISHED
    ) {
      throw new ControlledStatementVoidError(
        "INVALID_REQUEST",
        "Only a generated or published statement can be voided.",
      );
    }

    const previousStatus = statement.status;
    const updated = await tx.contributionStatement.updateMany({
      where: {
        id: statement.id,
        organizationId: organization.id,
        status: {
          in: [StatementStatus.GENERATED, StatementStatus.PUBLISHED],
        },
      },
      data: { status: StatementStatus.VOIDED },
    });
    if (updated.count !== 1) {
      throw new ControlledStatementVoidError(
        "INVALID_REQUEST",
        "This statement was already voided or is no longer eligible.",
      );
    }

    await createAuditEvent(
      {
        organizationId: organization.id,
        actorUserAccountId: actor.id,
        action: VOID_CONTRIBUTION_STATEMENT,
        entityType: "ContributionStatement",
        entityId: statement.id,
        changes: [
          {
            field: "status",
            oldValue: previousStatus,
            newValue: StatementStatus.VOIDED,
          },
          {
            field: "statementType",
            oldValue: null,
            newValue: statement.statementType,
          },
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: statement.statementIdentifier,
          },
          {
            field: "taxYear",
            oldValue: null,
            newValue: statement.taxYear == null ? null : String(statement.taxYear),
          },
          {
            field: "deductibleTotal",
            oldValue: null,
            newValue: statement.deductibleTotal.toString(),
          },
          {
            field: "statementVoidRequestId",
            oldValue: null,
            newValue: request.id,
          },
          {
            field: "executedByUserAccountId",
            oldValue: null,
            newValue: actor.id,
          },
        ],
      },
      tx,
    );

    await createAuditEvent(
      {
        organizationId: organization.id,
        actorUserAccountId: actor.id,
        action: EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST,
        entityType: "StatementVoidRequest",
        entityId: request.id,
        changes: [
          {
            field: "requestStatus",
            oldValue: null,
            newValue: StatementVoidRequestStatus.APPROVED,
          },
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: statement.statementIdentifier,
          },
          {
            field: "status",
            oldValue: previousStatus,
            newValue: StatementStatus.VOIDED,
          },
        ],
      },
      tx,
    );

    return {
      requestId: request.id,
      statementId: statement.id,
      statementIdentifier: statement.statementIdentifier,
      statementStatus: StatementStatus.VOIDED,
      statementType: statement.statementType,
      donorId: statement.donorId,
      householdId: statement.householdId,
    };
  });
}
