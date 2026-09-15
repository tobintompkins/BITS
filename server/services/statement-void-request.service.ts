import { z } from "zod";

import {
  StatementStatus,
  StatementType,
  StatementVoidRequestStatus,
} from "@/app/generated/prisma/client";
import { requireStatementManageAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { statementVoidRequestReasonSchema } from "@/lib/validation/statement-void-request";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export const REQUEST_CONTRIBUTION_STATEMENT_VOID =
  "REQUEST_CONTRIBUTION_STATEMENT_VOID";

const statementIdSchema = z.string().uuid();

export class StatementVoidRequestError extends Error {
  constructor(
    public readonly code:
      | "SIGNED_OUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INVALID_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "StatementVoidRequestError";
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function isValidStatementShape(
  statement: {
    statementType: StatementType;
    donorId: string | null;
    householdId: string | null;
    donor: { id: string; organizationId: string } | null;
    household: { id: string; organizationId: string } | null;
  },
  organizationId: string,
) {
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

async function requireManageContext() {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new StatementVoidRequestError("SIGNED_OUT", "You must be signed in.");
  }
  if (!organization) {
    throw new StatementVoidRequestError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  try {
    await requireStatementManageAccess(organization.id);
  } catch {
    throw new StatementVoidRequestError(
      "FORBIDDEN",
      "You do not have permission to request a statement void.",
    );
  }
  return { actor, organization };
}

/**
 * Creates a pending void request. Does not void the statement, change its PDF,
 * or alter portal access. A later review patch must approve before voiding.
 */
export async function createStatementVoidRequest(input: {
  statementId: string;
  reason: unknown;
}) {
  const { actor, organization } = await requireManageContext();
  if (!statementIdSchema.safeParse(input.statementId).success) {
    throw new StatementVoidRequestError("NOT_FOUND", "Statement not found.");
  }
  const parsed = statementVoidRequestReasonSchema.safeParse({
    reason: input.reason,
  });
  if (!parsed.success) {
    throw new StatementVoidRequestError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Check the void request.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM contribution_statements
      WHERE id = ${input.statementId}::uuid
        AND "organizationId" = ${organization.id}::uuid
      FOR UPDATE
    `;
    if (!locked[0]) {
      throw new StatementVoidRequestError("NOT_FOUND", "Statement not found.");
    }

    const statement = await tx.contributionStatement.findFirst({
      where: { id: input.statementId, organizationId: organization.id },
      select: {
        id: true,
        status: true,
        statementType: true,
        statementIdentifier: true,
        donorId: true,
        householdId: true,
        donor: { select: { id: true, organizationId: true } },
        household: { select: { id: true, organizationId: true } },
      },
    });
    if (!statement || !isValidStatementShape(statement, organization.id)) {
      throw new StatementVoidRequestError("NOT_FOUND", "Statement not found.");
    }
    if (
      statement.status !== StatementStatus.GENERATED &&
      statement.status !== StatementStatus.PUBLISHED
    ) {
      throw new StatementVoidRequestError(
        "INVALID_REQUEST",
        "A void can only be requested for a generated or published statement.",
      );
    }

    const pending = await tx.statementVoidRequest.findFirst({
      where: {
        organizationId: organization.id,
        contributionStatementId: statement.id,
        status: StatementVoidRequestStatus.PENDING,
      },
      select: { id: true },
    });
    if (pending) {
      throw new StatementVoidRequestError(
        "INVALID_REQUEST",
        "A pending void request already exists for this statement.",
      );
    }

    let request;
    try {
      request = await tx.statementVoidRequest.create({
        data: {
          organizationId: organization.id,
          contributionStatementId: statement.id,
          requestedByUserAccountId: actor.id,
          reason: parsed.data.reason,
          status: StatementVoidRequestStatus.PENDING,
        },
        select: {
          id: true,
          status: true,
          contributionStatementId: true,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new StatementVoidRequestError(
          "INVALID_REQUEST",
          "A pending void request already exists for this statement.",
        );
      }
      throw error;
    }

    await createAuditEvent(
      {
        organizationId: organization.id,
        actorUserAccountId: actor.id,
        action: REQUEST_CONTRIBUTION_STATEMENT_VOID,
        entityType: "StatementVoidRequest",
        entityId: request.id,
        changes: [
          {
            field: "contributionStatementId",
            oldValue: null,
            newValue: statement.id,
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
            field: "status",
            oldValue: null,
            newValue: statement.status,
          },
          {
            field: "requestStatus",
            oldValue: null,
            newValue: StatementVoidRequestStatus.PENDING,
          },
        ],
      },
      tx,
    );

    return {
      id: request.id,
      status: request.status,
      statementId: statement.id,
      statementStatus: statement.status,
      statementIdentifier: statement.statementIdentifier,
    };
  });
}
