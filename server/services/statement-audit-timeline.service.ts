import { z } from "zod";

import {
  StatementStatus,
  StatementType,
  StatementVoidRequestStatus,
} from "@/app/generated/prisma/client";
import { requireStatementViewAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/money/decimal";
import { findEntityAuditEvents } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const statementIdSchema = z.string().uuid();
const TIMELINE_LIMIT = 100;
const ENTITY_TYPE = "ContributionStatement";

const ALLOWED_FIELDS = new Set([
  "status",
  "statementType",
  "taxYear",
  "deductibleTotal",
  "statementIdentifier",
  "requestStatus",
  "priorStatementIdentifier",
]);

export const GENERATE_CONTRIBUTION_STATEMENT = "GENERATE_CONTRIBUTION_STATEMENT";
export const VIEW_GENERATED_CONTRIBUTION_STATEMENT =
  "VIEW_GENERATED_CONTRIBUTION_STATEMENT";
export const PUBLISH_CONTRIBUTION_STATEMENT = "PUBLISH_CONTRIBUTION_STATEMENT";
export const REQUEST_CONTRIBUTION_STATEMENT_VOID =
  "REQUEST_CONTRIBUTION_STATEMENT_VOID";
export const APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST =
  "APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST";
export const REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST =
  "REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST";
export const VOID_CONTRIBUTION_STATEMENT = "VOID_CONTRIBUTION_STATEMENT";
export const EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST =
  "EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST";
export const REISSUE_CONTRIBUTION_STATEMENT = "REISSUE_CONTRIBUTION_STATEMENT";
export const UNKNOWN_STATEMENT_ACTIVITY_LABEL = "Recorded statement activity";

export class StatementAuditTimelineError extends Error {
  constructor(
    public readonly code: "SIGNED_OUT" | "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "StatementAuditTimelineError";
  }
}

function actorLabel(actor: {
  displayName: string | null;
  primaryEmail: string;
} | null) {
  if (!actor) return "System";
  return actor.displayName?.trim() || actor.primaryEmail;
}

function displayName(row: { firstName: string; lastName: string }) {
  return `${row.firstName} ${row.lastName}`.trim();
}

function statusLabel(value: string) {
  switch (value) {
    case StatementStatus.GENERATED:
      return "Generated";
    case StatementStatus.PUBLISHED:
      return "Published";
    case StatementStatus.VOIDED:
      return "Voided";
    default:
      return null;
  }
}

function requestStatusLabel(value: string) {
  switch (value) {
    case "PENDING":
      return "Pending";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    default:
      return null;
  }
}

function typeLabel(value: string) {
  switch (value) {
    case StatementType.INDIVIDUAL:
      return "Individual";
    case StatementType.HOUSEHOLD:
      return "Household";
    default:
      return null;
  }
}

function fieldLabel(field: string) {
  switch (field) {
    case "status":
      return "Status";
    case "statementType":
      return "Type";
    case "taxYear":
      return "Tax year";
    case "deductibleTotal":
      return "Deductible total";
    case "statementIdentifier":
      return "Identifier";
    case "priorStatementIdentifier":
      return "Prior identifier";
    case "requestStatus":
      return "Request status";
    default:
      return null;
  }
}

function asText(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function looksSensitive(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/[\\/]/.test(trimmed)) return true;
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return true;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/^(pi_|ch_|cus_|pk_|sk_)/i.test(trimmed)) return true;
  if (/stripe|checksum|storageKey|pdfBytes/i.test(trimmed)) return true;
  return false;
}

function presentableValue(field: string, value: string | null) {
  if (value == null || value.trim() === "") return null;
  const trimmed = value.trim();
  if (looksSensitive(trimmed)) return null;
  if (field === "status") return statusLabel(trimmed);
  if (field === "requestStatus") return requestStatusLabel(trimmed);
  if (field === "statementType") return typeLabel(trimmed);
  if (field === "deductibleTotal") {
    try {
      return formatMoney(trimmed);
    } catch {
      return null;
    }
  }
  if (field === "taxYear") return /^\d{4}$/.test(trimmed) ? trimmed : null;
  if (field === "statementIdentifier" || field === "priorStatementIdentifier") {
    return trimmed;
  }
  return null;
}

function getChanges(metadata: unknown): Array<{
  field: string;
  oldValue: string | null;
  newValue: string | null;
}> {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("changes" in metadata) ||
    !Array.isArray(metadata.changes)
  ) {
    return [];
  }
  return metadata.changes.flatMap((change) => {
    if (!change || typeof change !== "object" || !("field" in change)) {
      return [];
    }
    const field = typeof change.field === "string" ? change.field : "";
    if (!ALLOWED_FIELDS.has(field)) return [];
    return [
      {
        field,
        oldValue: asText("oldValue" in change ? change.oldValue : null),
        newValue: asText("newValue" in change ? change.newValue : null),
      },
    ];
  });
}

function relatedVoidedStatementLink(metadata: unknown) {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("changes" in metadata) ||
    !Array.isArray(metadata.changes)
  ) {
    return null;
  }
  let priorId: string | null = null;
  let priorIdentifier: string | null = null;
  for (const change of metadata.changes) {
    if (!change || typeof change !== "object" || !("field" in change)) continue;
    const field = typeof change.field === "string" ? change.field : "";
    const value = asText("newValue" in change ? change.newValue : null);
    if (!value) continue;
    if (field === "priorStatementId") priorId = value;
    if (field === "priorStatementIdentifier") priorIdentifier = value;
  }
  if (
    !priorId ||
    !statementIdSchema.safeParse(priorId).success ||
    !priorIdentifier ||
    looksSensitive(priorIdentifier)
  ) {
    return null;
  }
  return {
    href: `/statements/registry/${priorId}`,
    label: priorIdentifier,
  };
}

export function statementAuditActionLabel(action: string) {
  switch (action) {
    case GENERATE_CONTRIBUTION_STATEMENT:
      return "Generate contribution statement";
    case VIEW_GENERATED_CONTRIBUTION_STATEMENT:
      return "View generated statement for review";
    case PUBLISH_CONTRIBUTION_STATEMENT:
      return "Publish contribution statement";
    case REQUEST_CONTRIBUTION_STATEMENT_VOID:
      return "Statement void requested";
    case APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST:
      return "Approve statement void request";
    case REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST:
      return "Reject statement void request";
    case VOID_CONTRIBUTION_STATEMENT:
      return "Void contribution statement";
    case EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST:
      return "Execute statement void request";
    case REISSUE_CONTRIBUTION_STATEMENT:
      return "Replacement statement generated";
    default:
      return UNKNOWN_STATEMENT_ACTIVITY_LABEL;
  }
}

export function summarizeStatementAuditChanges(
  action: string,
  metadata: unknown,
) {
  const known = statementAuditActionLabel(action);
  if (known === UNKNOWN_STATEMENT_ACTIVITY_LABEL) {
    return "A statement activity was recorded.";
  }

  const changes = getChanges(metadata);
  const parts = changes.flatMap((change) => {
    const label = fieldLabel(change.field);
    const from = presentableValue(change.field, change.oldValue);
    const to = presentableValue(change.field, change.newValue);
    if (!label || !to) return [];
    if (from) return [`${label} changed from ${from} to ${to}.`];
    return [`${label} set to ${to}.`];
  });

  if (action === REQUEST_CONTRIBUTION_STATEMENT_VOID) {
    return parts.length
      ? `Statement void requested. ${parts.join(" ")}`
      : "Statement void requested.";
  }
  if (action === APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST) {
    return parts.length
      ? `Statement void request approved. ${parts.join(" ")}`
      : "Statement void request approved.";
  }
  if (action === REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST) {
    return parts.length
      ? `Statement void request rejected. ${parts.join(" ")}`
      : "Statement void request rejected.";
  }
  if (action === VOID_CONTRIBUTION_STATEMENT) {
    return parts.length
      ? `Statement voided. ${parts.join(" ")}`
      : "The statement was voided. Portal access is revoked. The record and PDF were retained for audit.";
  }
  if (action === EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST) {
    return parts.length
      ? `Approved void request executed. ${parts.join(" ")}`
      : "The approved void request was executed.";
  }
  if (action === REISSUE_CONTRIBUTION_STATEMENT) {
    const household = changes.some(
      (change) =>
        change.field === "statementType" &&
        change.newValue === StatementType.HOUSEHOLD,
    );
    const prefix = household
      ? "Replacement household statement generated."
      : "Replacement statement generated.";
    return parts.length ? `${prefix} ${parts.join(" ")}` : prefix;
  }
  if (parts.length) return parts.join(" ");
  if (action === VIEW_GENERATED_CONTRIBUTION_STATEMENT) {
    return "A generated statement PDF was opened for review.";
  }
  if (action === PUBLISH_CONTRIBUTION_STATEMENT) {
    return "The statement was published to the member portal.";
  }
  return "An official contribution statement was generated.";
}

async function requireTimelineContext() {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new StatementAuditTimelineError(
      "SIGNED_OUT",
      "You must be signed in.",
    );
  }
  if (!organization) {
    throw new StatementAuditTimelineError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  let access;
  try {
    access = await requireStatementViewAccess(organization.id);
  } catch {
    throw new StatementAuditTimelineError(
      "FORBIDDEN",
      "You do not have permission to view contribution statements.",
    );
  }
  return { organization, access };
}

/**
 * Read-only audit timeline for one current-organization contribution statement.
 */
export async function getStatementAuditTimeline(statementId: string) {
  const { organization, access } = await requireTimelineContext();
  if (!statementIdSchema.safeParse(statementId).success) {
    throw new StatementAuditTimelineError("NOT_FOUND", "Statement not found.");
  }

  const statement = await prisma.contributionStatement.findFirst({
    where: { id: statementId, organizationId: organization.id },
    select: {
      id: true,
      statementIdentifier: true,
      statementType: true,
      status: true,
      taxYear: true,
      periodStart: true,
      periodEnd: true,
      deductibleTotal: true,
      generatedAt: true,
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
  });

  if (!statement) {
    throw new StatementAuditTimelineError("NOT_FOUND", "Statement not found.");
  }

  const individual =
    statement.statementType === StatementType.INDIVIDUAL &&
    statement.householdId == null &&
    statement.donor &&
    statement.donor.organizationId === organization.id &&
    statement.donor.id === statement.donorId;
  const household =
    statement.statementType === StatementType.HOUSEHOLD &&
    statement.donorId == null &&
    statement.household &&
    statement.household.organizationId === organization.id &&
    statement.household.id === statement.householdId;
  if (!individual && !household) {
    throw new StatementAuditTimelineError("NOT_FOUND", "Statement not found.");
  }

  const [statementEvents, voidRequestRows] = await Promise.all([
    findEntityAuditEvents(
      organization.id,
      ENTITY_TYPE,
      statement.id,
      TIMELINE_LIMIT,
    ),
    prisma.statementVoidRequest.findMany({
      where: {
        organizationId: organization.id,
        contributionStatementId: statement.id,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        reason: true,
        reviewNote: true,
        reviewedAt: true,
        createdAt: true,
        requestedBy: {
          select: { displayName: true, primaryEmail: true },
        },
        reviewedBy: {
          select: { displayName: true, primaryEmail: true },
        },
      },
    }),
  ]);
  const voidRequestIds = voidRequestRows.map((row) => row.id);
  const voidRequestEvents =
    voidRequestIds.length === 0
      ? []
      : await prisma.auditEvent.findMany({
          where: {
            organizationId: organization.id,
            entityType: "StatementVoidRequest",
            entityId: { in: voidRequestIds },
          },
          include: {
            actor: {
              select: { displayName: true, primaryEmail: true },
            },
          },
          orderBy: { occurredAt: "desc" },
          take: TIMELINE_LIMIT,
        });
  const chronological = [...statementEvents, ...voidRequestEvents]
    .sort((left, right) => {
      const byTime = left.occurredAt.getTime() - right.occurredAt.getTime();
      if (byTime !== 0) return byTime;
      return left.id.localeCompare(right.id);
    })
    .slice(-TIMELINE_LIMIT);
  const voidRequests = voidRequestRows.map((row) => ({
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    requesterLabel: actorLabel(row.requestedBy),
    reason: row.reason,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt,
    reviewerLabel: row.reviewedBy ? actorLabel(row.reviewedBy) : null,
  }));

  return {
    canManageStatements: access.canManageStatements,
    hasPendingVoidRequest: voidRequests.some(
      (row) => row.status === StatementVoidRequestStatus.PENDING,
    ),
    voidRequests,
    statement: {
      id: statement.id,
      statementIdentifier: statement.statementIdentifier,
      statementType: statement.statementType,
      status: statement.status,
      taxYear: statement.taxYear,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      deductibleTotal: statement.deductibleTotal.toString(),
      generatedAt: statement.generatedAt,
      recipientLabel: individual
        ? displayName(statement.donor!)
        : statement.household!.displayName,
    },
    events: chronological.map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt,
      actionLabel: statementAuditActionLabel(event.action),
      actorLabel: actorLabel(event.actor),
      summary: summarizeStatementAuditChanges(
        event.action,
        event.changeMetadata,
      ),
      relatedStatement:
        event.action === REISSUE_CONTRIBUTION_STATEMENT
          ? relatedVoidedStatementLink(event.changeMetadata)
          : null,
    })),
  };
}
