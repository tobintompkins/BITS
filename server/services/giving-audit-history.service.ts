import { RoleCode } from "@/app/generated/prisma/client";
import { getGivingAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  GIVING_AUDIT_PAGE_SIZE,
  buildGivingAuditSummary,
  canReviewGivingAuditHistory,
  encodeGivingAuditCursor,
  findGivingAuditPair,
  givingAuditActorLabel,
  givingAuditPairsForFilter,
  givingAuditRecordHref,
  givingAuditRecordLabel,
  givingAuditTimestampText,
  parseGivingAuditHistoryFilter,
  type GivingAuditFilter,
  type GivingAuditLinkTarget,
} from "@/lib/validation/giving-audit-history";
import { formatLeadershipSecurityActivityDateTime } from "@/lib/validation/leadership-security-activity";
import {
  findGivingAuditEvents,
  findGivingAuditTargets,
} from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type GivingAuditHistoryRow = {
  id: string;
  occurredAtIso: string;
  occurredAtLabel: string;
  entityLabel: string;
  actionLabel: string;
  performedBy: string;
  summary: string;
  recordHref: string | null;
  recordLabel: string | null;
};

export type GivingAuditHistoryView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      filter: GivingAuditFilter;
      rows: GivingAuditHistoryRow[];
      hasOlder: boolean;
      olderCursor: string | null;
      canOpenOrganizationSettings: boolean;
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idsFor(rows: Array<{ entityType: string; entityId: string }>, entityType: string) {
  return [
    ...new Set(
      rows
        .filter((row) => row.entityType === entityType && UUID.test(row.entityId))
        .map((row) => row.entityId),
    ),
  ];
}

/**
 * Read-only giving audit history for the session church.
 * Leadership Security Activity stays organization-admin only because its
 * catalog includes privacy, documents, purchases, and other non-giving rows.
 * This entry point does not query that catalog.
 */
export async function getGivingAuditHistory(
  input: unknown = {},
): Promise<GivingAuditHistoryView> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const access = await getGivingAccess(organization.id);
  if (!canReviewGivingAuditHistory(access)) return { status: "UNAUTHORIZED" };

  const parsed = parseGivingAuditHistoryFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };

  const pairs = givingAuditPairsForFilter(parsed.data);
  const records = await findGivingAuditEvents({
    organizationId: organization.id,
    pairs,
    from: parsed.data.from,
    to: parsed.data.to,
    cursor: parsed.data.cursor,
  });
  const page = records.slice(0, GIVING_AUDIT_PAGE_SIZE);
  const hasOlder = records.length > GIVING_AUDIT_PAGE_SIZE;
  const oldest = page.at(-1);
  const targets = await findGivingAuditTargets({
    organizationId: organization.id,
    donorIds: idsFor(page, "Donor"),
    householdIds: idsFor(page, "Household"),
    offeringTypeIds: idsFor(page, "OfferingType"),
    batchIds: idsFor(page, "OfferingBatch"),
    donationIds: idsFor(page, "Donation"),
    statementIds: idsFor(page, "ContributionStatement"),
    voidRequestIds: idsFor(page, "StatementVoidRequest"),
  });
  const linkTargets: GivingAuditLinkTarget = {
    donors: new Set(targets.donors),
    households: new Set(targets.households),
    offeringTypes: new Set(targets.offeringTypes),
    batches: new Set(targets.batches),
    donations: new Map(targets.donations.map((row) => [row.id, row.batchId])),
    donationBatchesInChurch: new Set(targets.donationBatchesInChurch),
    statements: new Set(targets.statements),
    voidRequestStatements: new Map(
      targets.voidRequests.map((row) => [row.id, row.contributionStatementId]),
    ),
  };
  const canOpenOrganizationSettings =
    access.isSuperAdmin || access.roleCode === RoleCode.ORG_ADMIN;

  return {
    status: "READY",
    filter: parsed.data,
    hasOlder,
    olderCursor: hasOlder && oldest
      ? encodeGivingAuditCursor(oldest.occurredAt, oldest.id)
      : null,
    canOpenOrganizationSettings,
    rows: page.flatMap((record) => {
      const pair = findGivingAuditPair(record.entityType, record.action);
      if (!pair) return [];
      const recordHref = givingAuditRecordHref({
        entityType: record.entityType,
        entityId: record.entityId,
        organizationId: organization.id,
        canOpenOrganizationSettings,
        targets: linkTargets,
      });
      return [
        {
          id: record.id,
          occurredAtIso: record.occurredAt.toISOString(),
          occurredAtLabel: givingAuditTimestampText(
            formatLeadershipSecurityActivityDateTime(record.occurredAt),
          ),
          entityLabel: pair.entityLabel,
          actionLabel: pair.actionLabel,
          performedBy: givingAuditActorLabel(record.actor?.displayName),
          summary: buildGivingAuditSummary(record.changeMetadata),
          recordHref,
          recordLabel: recordHref
            ? givingAuditRecordLabel(record.entityType, pair.entityLabel)
            : null,
        },
      ];
    }),
  };
}
