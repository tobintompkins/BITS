import { z } from "zod";

import {
  StatementStatus,
  StatementType,
  StatementVoidRequestStatus,
} from "@/app/generated/prisma/client";
import { requireStatementManageAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { statementVoidRequestDecisionSchema } from "@/lib/validation/statement-void-review";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export const APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST =
  "APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST";
export const REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST =
  "REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST";

const requestIdSchema = z.string().uuid();
const REVIEW_QUEUE_LIMIT = 100;

export class StatementVoidReviewError extends Error {
  constructor(
    public readonly code:
      | "SIGNED_OUT"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INVALID_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "StatementVoidReviewError";
  }
}

function displayName(row: { firstName: string; lastName: string }) {
  return `${row.firstName} ${row.lastName}`.trim();
}

function personLabel(person: {
  displayName: string | null;
  primaryEmail: string;
} | null) {
  if (!person) return null;
  const name = person.displayName?.trim();
  return {
    name: name || person.primaryEmail,
    email: person.primaryEmail,
  };
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

function recipientLabel(
  statement: {
    statementType: StatementType;
    donorId: string | null;
    householdId: string | null;
    donor: {
      id: string;
      organizationId: string;
      firstName: string;
      lastName: string;
    } | null;
    household: {
      id: string;
      organizationId: string;
      displayName: string;
    } | null;
  },
  organizationId: string,
) {
  if (!isValidStatementShape(statement, organizationId)) {
    return "Statement recipient";
  }
  return statement.statementType === StatementType.INDIVIDUAL
    ? displayName(statement.donor!)
    : statement.household!.displayName;
}

async function requireReviewContext() {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new StatementVoidReviewError("SIGNED_OUT", "You must be signed in.");
  }
  if (!organization) {
    throw new StatementVoidReviewError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  try {
    await requireStatementManageAccess(organization.id);
  } catch {
    throw new StatementVoidReviewError(
      "FORBIDDEN",
      "You do not have permission to review statement void requests.",
    );
  }
  return { actor, organization };
}

const queueInclude = {
  requestedBy: { select: { displayName: true, primaryEmail: true } },
  reviewedBy: { select: { displayName: true, primaryEmail: true } },
  statement: {
    select: {
      id: true,
      statementIdentifier: true,
      statementType: true,
      status: true,
      donorId: true,
      householdId: true,
      donor: {
        select: {
          id: true,
          organizationId: true,
          firstName: true,
          lastName: true,
        },
      },
      household: {
        select: {
          id: true,
          organizationId: true,
          displayName: true,
        },
      },
    },
  },
} as const;

function toQueueItem(
  row: {
    id: string;
    status: StatementVoidRequestStatus;
    reason: string;
    reviewNote: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    requestedByUserAccountId: string;
    reviewedByUserAccountId: string | null;
    requestedBy: { displayName: string | null; primaryEmail: string };
    reviewedBy: { displayName: string | null; primaryEmail: string } | null;
    statement: {
      id: string;
      statementIdentifier: string;
      statementType: StatementType;
      status: StatementStatus;
      donorId: string | null;
      householdId: string | null;
      donor: {
        id: string;
        organizationId: string;
        firstName: string;
        lastName: string;
      } | null;
      household: {
        id: string;
        organizationId: string;
        displayName: string;
      } | null;
    };
  },
  organizationId: string,
  actorId: string,
) {
  const requester = personLabel(row.requestedBy);
  const reviewer = personLabel(row.reviewedBy);
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt,
    statementIdentifier: row.statement.statementIdentifier,
    statementTimelineHref: `/statements/registry/${row.statement.id}`,
    statementType: row.statement.statementType,
    statementStatus: row.statement.status,
    recipientLabel: recipientLabel(row.statement, organizationId),
    submittedByCurrentUser: row.requestedByUserAccountId === actorId,
    canExecuteApprovedVoid:
      row.status === StatementVoidRequestStatus.APPROVED &&
      row.reviewedByUserAccountId === actorId &&
      (row.statement.status === StatementStatus.GENERATED ||
        row.statement.status === StatementStatus.PUBLISHED) &&
      Boolean(row.statement.statementIdentifier.trim()) &&
      isValidStatementShape(row.statement, organizationId),
    requester: requester ?? { name: "Church staff", email: "" },
    reviewer: reviewer
      ? {
          name: reviewer.name,
          email: reviewer.email,
          reviewNote: row.reviewNote,
          reviewedAt: row.reviewedAt,
        }
      : null,
  };
}

/**
 * Organization-scoped queue of pending then recently reviewed void requests.
 * Does not void statements or expose private storage or payment details.
 */
export async function getStatementVoidReviewQueue() {
  const { actor, organization } = await requireReviewContext();
  const orgWhere = { organizationId: organization.id };

  const [pendingCount, completedCount, pendingRows] = await Promise.all([
    prisma.statementVoidRequest.count({
      where: { ...orgWhere, status: StatementVoidRequestStatus.PENDING },
    }),
    prisma.statementVoidRequest.count({
      where: {
        ...orgWhere,
        status: { not: StatementVoidRequestStatus.PENDING },
      },
    }),
    prisma.statementVoidRequest.findMany({
      where: { ...orgWhere, status: StatementVoidRequestStatus.PENDING },
      include: queueInclude,
      orderBy: { createdAt: "asc" },
      take: REVIEW_QUEUE_LIMIT,
    }),
  ]);

  const remaining = REVIEW_QUEUE_LIMIT - pendingRows.length;
  const completedRows =
    remaining > 0
      ? await prisma.statementVoidRequest.findMany({
          where: {
            ...orgWhere,
            status: { not: StatementVoidRequestStatus.PENDING },
          },
          include: queueInclude,
          orderBy: { createdAt: "desc" },
          take: remaining,
        })
      : [];

  return {
    pendingCount,
    completedCount,
    requests: [...pendingRows, ...completedRows].map((row) =>
      toQueueItem(row, organization.id, actor.id),
    ),
  };
}

/**
 * Approves or rejects a pending void request. Does not void the statement,
 * change its PDF, or alter portal access.
 */
export async function decideStatementVoidRequest(
  requestId: string,
  rawInput: unknown,
) {
  const { actor, organization } = await requireReviewContext();
  if (!requestIdSchema.safeParse(requestId).success) {
    throw new StatementVoidReviewError(
      "NOT_FOUND",
      "Statement void request not found.",
    );
  }
  const parsed = statementVoidRequestDecisionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new StatementVoidReviewError(
      "INVALID_REQUEST",
      parsed.error.issues[0]?.message ?? "Check the decision.",
    );
  }

  const nextStatus =
    parsed.data.decision === "APPROVED"
      ? StatementVoidRequestStatus.APPROVED
      : StatementVoidRequestStatus.REJECTED;

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM statement_void_requests
      WHERE id = ${requestId}::uuid
        AND "organizationId" = ${organization.id}::uuid
      FOR UPDATE
    `;
    if (!locked[0]) {
      throw new StatementVoidReviewError(
        "NOT_FOUND",
        "Statement void request not found.",
      );
    }

    const request = await tx.statementVoidRequest.findFirst({
      where: { id: requestId, organizationId: organization.id },
      select: {
        id: true,
        status: true,
        contributionStatementId: true,
        requestedByUserAccountId: true,
      },
    });
    if (!request) {
      throw new StatementVoidReviewError(
        "NOT_FOUND",
        "Statement void request not found.",
      );
    }
    if (request.requestedByUserAccountId === actor.id) {
      throw new StatementVoidReviewError(
        "FORBIDDEN",
        "A second authorized person must review this request. You cannot approve or reject a void request you submitted.",
      );
    }
    if (request.status !== StatementVoidRequestStatus.PENDING) {
      throw new StatementVoidReviewError(
        "INVALID_REQUEST",
        "This void request has already been reviewed.",
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
      },
    });
    if (!statement) {
      throw new StatementVoidReviewError(
        "NOT_FOUND",
        "Statement void request not found.",
      );
    }

    const reviewedAt = new Date();
    const updated = await tx.statementVoidRequest.updateMany({
      where: {
        id: request.id,
        organizationId: organization.id,
        status: StatementVoidRequestStatus.PENDING,
      },
      data: {
        status: nextStatus,
        reviewNote: parsed.data.reviewNote,
        reviewedByUserAccountId: actor.id,
        reviewedAt,
      },
    });
    if (updated.count !== 1) {
      throw new StatementVoidReviewError(
        "INVALID_REQUEST",
        "Another reviewer already decided this request.",
      );
    }

    await createAuditEvent(
      {
        organizationId: organization.id,
        actorUserAccountId: actor.id,
        action:
          nextStatus === StatementVoidRequestStatus.APPROVED
            ? APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST
            : REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST,
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
            oldValue: StatementVoidRequestStatus.PENDING,
            newValue: nextStatus,
          },
          {
            field: "requestedByUserAccountId",
            oldValue: null,
            newValue: request.requestedByUserAccountId,
          },
          {
            field: "reviewedByUserAccountId",
            oldValue: null,
            newValue: actor.id,
          },
        ],
      },
      tx,
    );

    return {
      id: request.id,
      status: nextStatus,
      statementId: statement.id,
      statementStatus: statement.status,
      statementIdentifier: statement.statementIdentifier,
    };
  });
}
