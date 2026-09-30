import { getOrganizationAccess } from "@/lib/auth/permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { staffLeadershipDocumentNavItems } from "@/lib/validation/leadership-document";
import {
  LEADERSHIP_SECURITY_ACTIVITY_CATEGORY_LABELS,
  LEADERSHIP_SECURITY_ACTIVITY_LIMIT,
  actorDisplayNameOrFallback,
  buildLeadershipSecurityActivitySummary,
  findLeadershipSecurityActivityAllowListEntry,
  formatLeadershipSecurityActivityDateTime,
  leadershipSecurityActivityAllowList,
  parseLeadershipSecurityActivityFilter,
  type LeadershipSecurityActivityCategory,
  type LeadershipSecurityActivityCount,
  type LeadershipSecurityActivityRelatedLink,
  type LeadershipSecurityActivityRow,
} from "@/lib/validation/leadership-security-activity";
import { staffAccessDirectoryNavItems } from "@/lib/validation/staff-access-directory";
import { findAllowListedAuditEvents } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type LeadershipSecurityActivityView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      category: LeadershipSecurityActivityCategory | null;
      rows: LeadershipSecurityActivityRow[];
      categoryCounts: LeadershipSecurityActivityCount[];
      relatedLinks: LeadershipSecurityActivityRelatedLink[];
    };

function toSafeRow(record: {
  action: string;
  entityType: string;
  occurredAt: Date;
  changeMetadata: unknown;
  actor: { displayName: string | null } | null;
}): LeadershipSecurityActivityRow | null {
  const entry = findLeadershipSecurityActivityAllowListEntry(
    record.entityType,
    record.action,
  );
  if (!entry) return null;

  return {
    occurredAtIso: record.occurredAt.toISOString(),
    occurredAtLabel: formatLeadershipSecurityActivityDateTime(record.occurredAt),
    category: entry.category,
    categoryLabel: LEADERSHIP_SECURITY_ACTIVITY_CATEGORY_LABELS[entry.category],
    actionLabel: entry.actionLabel,
    performedBy: actorDisplayNameOrFallback(record.actor?.displayName),
    summary: buildLeadershipSecurityActivitySummary(
      entry,
      record.changeMetadata,
    ),
  };
}

function countCategories(
  rows: LeadershipSecurityActivityRow[],
): LeadershipSecurityActivityCount[] {
  const counts = new Map<LeadershipSecurityActivityCategory, number>();
  for (const row of rows) {
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => ({
      category,
      categoryLabel: LEADERSHIP_SECURITY_ACTIVITY_CATEGORY_LABELS[category],
      count,
    }));
}

function relatedLinks(
  canEditOrganization: boolean,
): LeadershipSecurityActivityRelatedLink[] {
  return [
    ...staffAccessDirectoryNavItems(canEditOrganization),
    ...staffLeadershipDocumentNavItems(canEditOrganization),
  ];
}

/**
 * Read-only BITS application audit view for organization administrators.
 * Client organization, actor, and event identifiers are ignored.
 */
export async function getLeadershipSecurityActivity(
  input: unknown = {},
): Promise<LeadershipSecurityActivityView> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const access = await getOrganizationAccess(organization.id);
  if (!access.canEdit) return { status: "UNAUTHORIZED" };

  const parsed = parseLeadershipSecurityActivityFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };

  const allowList = leadershipSecurityActivityAllowList(parsed.data.category);
  const records = await findAllowListedAuditEvents({
    organizationId: organization.id,
    allowList: allowList.map((entry) => ({
      entityType: entry.entityType,
      action: entry.action,
    })),
    take: LEADERSHIP_SECURITY_ACTIVITY_LIMIT,
  });

  const rows = records.flatMap((record) => {
    const mapped = toSafeRow(record);
    return mapped ? [mapped] : [];
  });

  return {
    status: "READY",
    category: parsed.data.category,
    rows,
    categoryCounts: countCategories(rows),
    relatedLinks: relatedLinks(access.canEdit),
  };
}
