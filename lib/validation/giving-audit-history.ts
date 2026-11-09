import { RoleCode, type Prisma } from "@/app/generated/prisma/client";
import { actorDisplayNameOrFallback } from "@/lib/validation/leadership-security-activity";

export const GIVING_AUDIT_HISTORY_HREF = "/reports/giving-audit";
export const GIVING_AUDIT_PAGE_SIZE = 25;
export const GIVING_AUDIT_UNKNOWN_ACTOR_LABEL = "System or unknown user";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const GIVING_AUDIT_PAIRS = [
  { entityType: "Donor", action: "DONOR_CREATED", entityLabel: "Donor", actionLabel: "Created a donor" },
  { entityType: "Donor", action: "DONOR_PROFILE_UPDATED", entityLabel: "Donor", actionLabel: "Updated a donor" },
  { entityType: "Household", action: "GIVING_HOUSEHOLD_CREATED", entityLabel: "Giving household", actionLabel: "Created a giving household" },
  { entityType: "Household", action: "GIVING_HOUSEHOLD_UPDATED", entityLabel: "Giving household", actionLabel: "Updated a giving household" },
  { entityType: "Household", action: "GIVING_HOUSEHOLD_DEACTIVATED", entityLabel: "Giving household", actionLabel: "Deactivated a giving household" },
  { entityType: "Household", action: "GIVING_HOUSEHOLD_REACTIVATED", entityLabel: "Giving household", actionLabel: "Reactivated a giving household" },
  { entityType: "HouseholdMembership", action: "GIVING_HOUSEHOLD_MEMBER_LINKED", entityLabel: "Giving household membership", actionLabel: "Linked a donor to a giving household" },
  { entityType: "HouseholdMembership", action: "GIVING_HOUSEHOLD_MEMBER_MOVED", entityLabel: "Giving household membership", actionLabel: "Moved a donor between giving households" },
  { entityType: "HouseholdMembership", action: "GIVING_HOUSEHOLD_MEMBER_ENDED", entityLabel: "Giving household membership", actionLabel: "Ended a giving household membership" },
  { entityType: "OfferingType", action: "OFFERING_TYPE_CREATED", entityLabel: "Offering type", actionLabel: "Created an offering type" },
  { entityType: "OfferingType", action: "OFFERING_TYPE_UPDATED", entityLabel: "Offering type", actionLabel: "Updated an offering type" },
  { entityType: "OfferingType", action: "OFFERING_TYPE_DEACTIVATED", entityLabel: "Offering type", actionLabel: "Deactivated an offering type" },
  { entityType: "OfferingType", action: "OFFERING_TYPE_REACTIVATED", entityLabel: "Offering type", actionLabel: "Reactivated an offering type" },
  { entityType: "OfferingBatch", action: "CREATE_OFFERING_BATCH", entityLabel: "Offering batch", actionLabel: "Created an offering batch" },
  { entityType: "OfferingBatch", action: "UPDATE_OFFERING_BATCH", entityLabel: "Offering batch", actionLabel: "Updated an offering batch" },
  { entityType: "OfferingBatch", action: "COMPLETE_OFFERING_BATCH_ENTRY", entityLabel: "Offering batch", actionLabel: "Completed batch entry" },
  { entityType: "OfferingBatch", action: "RECONCILE_OFFERING_BATCH", entityLabel: "Offering batch", actionLabel: "Reconciled an offering batch" },
  { entityType: "OfferingBatch", action: "RECORD_BATCH_DEPOSIT", entityLabel: "Offering batch", actionLabel: "Recorded a batch deposit" },
  { entityType: "OfferingBatch", action: "UPDATE_BATCH_DEPOSIT", entityLabel: "Offering batch", actionLabel: "Updated a batch deposit" },
  { entityType: "OfferingBatch", action: "LOCK_OFFERING_BATCH", entityLabel: "Offering batch", actionLabel: "Locked an offering batch" },
  { entityType: "Donation", action: "CREATE_MANUAL_BATCH_DONATION", entityLabel: "Gift", actionLabel: "Entered a gift" },
  { entityType: "Donation", action: "UPDATE_MANUAL_BATCH_DONATION", entityLabel: "Gift", actionLabel: "Updated a draft gift" },
  { entityType: "Donation", action: "DELETE_MANUAL_BATCH_DONATION", entityLabel: "Gift", actionLabel: "Removed a draft gift" },
  { entityType: "Organization", action: "UPDATE", entityLabel: "Organization", actionLabel: "Updated organization settings" },
  { entityType: "ContributionStatement", action: "GENERATE_CONTRIBUTION_STATEMENT", entityLabel: "Contribution statement", actionLabel: "Generated a contribution statement" },
  { entityType: "ContributionStatement", action: "REISSUE_CONTRIBUTION_STATEMENT", entityLabel: "Contribution statement", actionLabel: "Reissued a contribution statement" },
  { entityType: "ContributionStatement", action: "PUBLISH_CONTRIBUTION_STATEMENT", entityLabel: "Contribution statement", actionLabel: "Published a contribution statement" },
  { entityType: "ContributionStatement", action: "VIEW_GENERATED_CONTRIBUTION_STATEMENT", entityLabel: "Contribution statement", actionLabel: "Viewed a generated statement" },
  { entityType: "ContributionStatement", action: "VOID_CONTRIBUTION_STATEMENT", entityLabel: "Contribution statement", actionLabel: "Voided a contribution statement" },
  { entityType: "StatementVoidRequest", action: "REQUEST_CONTRIBUTION_STATEMENT_VOID", entityLabel: "Statement void request", actionLabel: "Requested a statement void" },
  { entityType: "StatementVoidRequest", action: "APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST", entityLabel: "Statement void request", actionLabel: "Approved a statement void request" },
  { entityType: "StatementVoidRequest", action: "REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST", entityLabel: "Statement void request", actionLabel: "Rejected a statement void request" },
  { entityType: "StatementVoidRequest", action: "EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST", entityLabel: "Statement void request", actionLabel: "Executed a statement void request" },
  { entityType: "ContributionReport", action: "CONTRIBUTION_REPORT_EXPORTED", entityLabel: "Contribution report", actionLabel: "Exported a contribution report" },
  { entityType: "BatchReconciliationReport", action: "BATCH_RECONCILIATION_REPORT_EXPORTED", entityLabel: "Batch reconciliation report", actionLabel: "Exported a batch reconciliation report" },
  { entityType: "StatementAccessReport", action: "STATEMENT_ACCESS_REPORT_EXPORTED", entityLabel: "Statement access report", actionLabel: "Exported a statement access report" },
  { entityType: "FinancialCorrectionRequest", action: "REQUEST_FINANCIAL_CORRECTION", entityLabel: "Financial correction", actionLabel: "Requested a financial correction" },
  { entityType: "FinancialCorrectionRequest", action: "APPROVE_FINANCIAL_CORRECTION", entityLabel: "Financial correction", actionLabel: "Approved a financial correction" },
  { entityType: "FinancialCorrectionRequest", action: "REJECT_FINANCIAL_CORRECTION", entityLabel: "Financial correction", actionLabel: "Rejected a financial correction" },
  { entityType: "FinancialCorrectionRequest", action: "CANCEL_FINANCIAL_CORRECTION", entityLabel: "Financial correction", actionLabel: "Cancelled a financial correction" },
] as const;

export type GivingAuditPair = (typeof GIVING_AUDIT_PAIRS)[number];
export type GivingAuditEntityType = GivingAuditPair["entityType"];
export type GivingAuditAction = GivingAuditPair["action"];

const FIELD_LABELS: Record<string, string> = {
  firstName: "Name",
  lastName: "Name",
  displayName: "Name",
  name: "Name",
  email: "Email",
  contactEmail: "Email",
  phone: "Phone",
  contactPhone: "Phone",
  preferredCommunicationMethod: "Contact preference",
  mailingAddressLine1: "Address",
  mailingAddressLine2: "Address",
  city: "Address",
  state: "Address",
  postalCode: "Address",
  country: "Address",
  notes: "Notes",
  active: "Active status",
  deceased: "Deceased flag",
  deceasedDate: "Deceased date",
  checkNumber: "Check number",
  paymentMethod: "Payment method",
  anonymous: "Anonymous flag",
  totalAmount: "Amount",
  deductibleAmount: "Deductible amount",
  deductibleTotal: "Deductible amount",
  isTaxDeductible: "Deductible status",
  goodsOrServicesProvided: "Goods or services",
  goodsOrServicesDescription: "Goods or services",
  goodsOrServicesEstimatedValue: "Goods or services",
  logoStorageKey: "Logo",
  ein: "Tax identification number",
  statementFooterText: "Statement footer",
  websiteUrl: "Website",
  timeZone: "Time zone",
  locale: "Locale",
  status: "Status",
  code: "Fund code",
  defaultTaxDeductible: "Tax-deductible flag",
  availableForOnlineGiving: "Online availability",
  expectedTotal: "Expected total",
  depositDate: "Deposit date",
  depositReference: "Deposit reference",
  householdId: "Household",
  donorId: "Donor",
  startDate: "Start date",
  endDate: "End date",
  fromHouseholdId: "Previous household",
  toHouseholdId: "Household",
  closedOn: "End date",
  startedOn: "Start date",
  recipientReview: "Statement recipient review",
  statementType: "Statement type",
  taxYear: "Tax year",
  statementIdentifier: "Statement identifier",
  requestStatus: "Request status",
  priorStatementIdentifier: "Prior statement",
  contributionStatementId: "Statement",
  statementVoidRequestId: "Void request",
  executedByUserAccountId: "Reviewer",
  batchName: "Batch name",
  offeringDate: "Offering date",
};

export type GivingAuditFilter = {
  entityType: GivingAuditEntityType | null;
  action: GivingAuditAction | null;
  from: string | null;
  to: string | null;
  cursor: { occurredAt: Date; id: string } | null;
};

export function canReviewGivingAuditHistory(access: {
  roleCode: RoleCode | null;
  isSuperAdmin: boolean;
}) {
  return (
    access.isSuperAdmin ||
    access.roleCode === RoleCode.ORG_ADMIN ||
    access.roleCode === RoleCode.TREASURER
  );
}

export function givingAuditHistoryNavItems(canReview: boolean) {
  return canReview
    ? [{ href: GIVING_AUDIT_HISTORY_HREF, label: "Giving Audit" }]
    : [];
}

export function givingAuditEntityOptions() {
  const seen = new Set<string>();
  return GIVING_AUDIT_PAIRS.filter((pair) => {
    if (seen.has(pair.entityType)) return false;
    seen.add(pair.entityType);
    return true;
  }).map((pair) => ({
    value: pair.entityType,
    label: pair.entityLabel,
  }));
}

export function givingAuditActionOptions(entityType?: GivingAuditEntityType | null) {
  return GIVING_AUDIT_PAIRS.filter(
    (pair) => !entityType || pair.entityType === entityType,
  ).map((pair) => ({
    value: pair.action,
    label: pair.actionLabel,
  }));
}

export function findGivingAuditPair(entityType: string, action: string) {
  return (
    GIVING_AUDIT_PAIRS.find(
      (pair) => pair.entityType === entityType && pair.action === action,
    ) ?? null
  );
}

export function givingAuditPairsForFilter(filter: {
  entityType: GivingAuditEntityType | null;
  action: GivingAuditAction | null;
}) {
  return GIVING_AUDIT_PAIRS.filter((pair) => {
    if (filter.entityType && pair.entityType !== filter.entityType) return false;
    if (filter.action && pair.action !== filter.action) return false;
    return true;
  });
}

function text(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseDay(value: string) {
  const match = DAY.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

export function encodeGivingAuditCursor(occurredAt: Date, id: string) {
  return Buffer.from(
    JSON.stringify({ t: occurredAt.toISOString(), i: id }),
    "utf8",
  ).toString("base64url");
}

export function decodeGivingAuditCursor(value: string) {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { t?: unknown; i?: unknown };
    if (typeof parsed.t !== "string" || typeof parsed.i !== "string") return null;
    if (!UUID.test(parsed.i)) return null;
    const occurredAt = new Date(parsed.t);
    if (Number.isNaN(occurredAt.getTime())) return null;
    if (occurredAt.toISOString() !== parsed.t) return null;
    return { occurredAt, id: parsed.i };
  } catch {
    return null;
  }
}

export function parseGivingAuditHistoryFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;
  if (!record) return { success: false as const };
  if ("category" in record) return { success: false as const };
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) return { success: false as const };
  }

  const entityText = text(record.entity);
  const actionText = text(record.action);
  const fromText = text(record.from);
  const toText = text(record.to);
  const cursorText = text(record.cursor);

  const entityType = entityText
    ? GIVING_AUDIT_PAIRS.find((pair) => pair.entityType === entityText)?.entityType ??
      null
    : null;
  if (entityText && !entityType) return { success: false as const };

  const action = actionText
    ? GIVING_AUDIT_PAIRS.find((pair) => pair.action === actionText)?.action ?? null
    : null;
  if (actionText && !action) return { success: false as const };
  if (
    entityType &&
    action &&
    !GIVING_AUDIT_PAIRS.some(
      (pair) => pair.entityType === entityType && pair.action === action,
    )
  ) {
    return { success: false as const };
  }

  const from = fromText ? parseDay(fromText) : null;
  if (fromText && !from) return { success: false as const };
  const to = toText ? parseDay(toText) : null;
  if (toText && !to) return { success: false as const };
  if (from && to && from > to) return { success: false as const };

  const cursor = cursorText ? decodeGivingAuditCursor(cursorText) : null;
  if (cursorText && !cursor) return { success: false as const };

  return {
    success: true as const,
    data: { entityType, action, from, to, cursor } satisfies GivingAuditFilter,
  };
}

function dayStart(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

export function givingAuditListQuery(input: {
  organizationId: string;
  pairs: ReadonlyArray<{ entityType: string; action: string }>;
  from: string | null;
  to: string | null;
  cursor: { occurredAt: Date; id: string } | null;
}) {
  const and: Prisma.AuditEventWhereInput[] = [
    { organizationId: input.organizationId },
    {
      OR: input.pairs.map((pair) => ({
        entityType: pair.entityType,
        action: pair.action,
      })),
    },
  ];
  if (input.from) {
    and.push({ occurredAt: { gte: dayStart(input.from) } });
  }
  if (input.to) {
    const end = dayStart(input.to);
    end.setUTCDate(end.getUTCDate() + 1);
    and.push({ occurredAt: { lt: end } });
  }
  if (input.cursor) {
    and.push({
      OR: [
        { occurredAt: { lt: input.cursor.occurredAt } },
        {
          AND: [
            { occurredAt: input.cursor.occurredAt },
            { id: { lt: input.cursor.id } },
          ],
        },
      ],
    });
  }
  return {
    where: { AND: and },
    orderBy: [{ occurredAt: "desc" as const }, { id: "desc" as const }],
    take: GIVING_AUDIT_PAGE_SIZE + 1,
  };
}

function readFieldNames(metadata: unknown) {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("changes" in metadata) ||
    !Array.isArray(metadata.changes)
  ) {
    return { labels: [] as string[], hasUnlisted: false, readable: false };
  }
  const labels = new Set<string>();
  let hasUnlisted = false;
  for (const change of metadata.changes) {
    if (!change || typeof change !== "object" || Array.isArray(change)) {
      hasUnlisted = true;
      continue;
    }
    const field = (change as { field?: unknown }).field;
    if (typeof field !== "string") {
      hasUnlisted = true;
      continue;
    }
    const label = FIELD_LABELS[field];
    if (!label) hasUnlisted = true;
    else labels.add(label);
  }
  return { labels: [...labels], hasUnlisted, readable: true };
}

function joinLabels(labels: string[]) {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function buildGivingAuditSummary(metadata: unknown) {
  const parsed = readFieldNames(metadata);
  if (!parsed.readable || (parsed.labels.length === 0 && !parsed.hasUnlisted)) {
    return "No additional details were recorded.";
  }
  const parts: string[] = [];
  if (parsed.labels.length > 0) {
    parts.push(`${joinLabels(parsed.labels)} changed.`);
  }
  if (parsed.hasUnlisted) parts.push("Additional details were recorded.");
  return parts.join(" ");
}

export function givingAuditActorLabel(displayName: string | null | undefined) {
  const label = actorDisplayNameOrFallback(displayName);
  return label || GIVING_AUDIT_UNKNOWN_ACTOR_LABEL;
}

export type GivingAuditLinkTarget = {
  donors: ReadonlySet<string>;
  households: ReadonlySet<string>;
  offeringTypes: ReadonlySet<string>;
  batches: ReadonlySet<string>;
  donations: ReadonlyMap<string, string | null>;
  donationBatchesInChurch: ReadonlySet<string>;
  statements: ReadonlySet<string>;
  voidRequestStatements: ReadonlyMap<string, string>;
};

export function confirmedGivingAuditDonationBatchId(
  batchId: string | null | undefined,
  batchesInChurch: ReadonlySet<string>,
) {
  if (!batchId || !UUID.test(batchId)) return null;
  return batchesInChurch.has(batchId) ? batchId : null;
}

export function givingAuditRecordLabel(entityType: string, entityLabel: string) {
  if (entityType === "Donation") return "View gift's batch";
  return `Open ${entityLabel.toLowerCase()}`;
}

export function givingAuditTimestampText(formattedUtc: string) {
  return `${formattedUtc} UTC`;
}

export function givingAuditRecordHref(input: {
  entityType: string;
  entityId: string;
  organizationId: string;
  canOpenOrganizationSettings: boolean;
  targets: GivingAuditLinkTarget;
}) {
  if (!UUID.test(input.entityId)) return null;
  switch (input.entityType) {
    case "Donor":
      return input.targets.donors.has(input.entityId)
        ? `/donors/${input.entityId}`
        : null;
    case "Household":
      return input.targets.households.has(input.entityId)
        ? `/giving-households/${input.entityId}`
        : null;
    case "OfferingType":
      return input.targets.offeringTypes.has(input.entityId)
        ? `/offering-types/${input.entityId}`
        : null;
    case "OfferingBatch":
      return input.targets.batches.has(input.entityId)
        ? `/batches/${input.entityId}`
        : null;
    case "Donation": {
      const batchId = confirmedGivingAuditDonationBatchId(
        input.targets.donations.get(input.entityId),
        input.targets.donationBatchesInChurch,
      );
      if (!batchId) return null;
      return `/batches/${batchId}`;
    }
    case "Organization":
      return input.canOpenOrganizationSettings &&
        input.entityId === input.organizationId
        ? "/settings/organization"
        : null;
    case "ContributionStatement":
      return input.targets.statements.has(input.entityId)
        ? `/statements/registry/${input.entityId}`
        : null;
    case "StatementVoidRequest": {
      const statementId = input.targets.voidRequestStatements.get(input.entityId);
      if (!statementId || !input.targets.statements.has(statementId)) return null;
      return `/statements/registry/${statementId}`;
    }
    default:
      return null;
  }
}
