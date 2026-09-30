import { z } from "zod";

export const LEADERSHIP_SECURITY_ACTIVITY_HREF =
  "/administration/security-activity";
export const LEADERSHIP_SECURITY_ACTIVITY_LIMIT = 100;
export const LEADERSHIP_SECURITY_ACTIVITY_UNKNOWN_ACTOR =
  "System or unknown user";

export const LEADERSHIP_SECURITY_ACTIVITY_NOTICE =
  "This page does not replace Clerk’s full login or two-factor-authentication history.";

export const LEADERSHIP_SECURITY_ACTIVITY_SUBTITLE =
  "Review recent sensitive actions recorded inside BITS.";

export const LEADERSHIP_SECURITY_ACTIVITY_EMPTY_COPY =
  "No recorded security activity matches this filter yet.";

export const LEADERSHIP_SECURITY_ACTIVITY_CATEGORIES = [
  "DOCUMENTS",
  "PURCHASES",
  "MAINTENANCE",
  "EQUIPMENT",
  "FINANCIAL",
  "PRIVACY",
  "ORGANIZATION",
] as const;

export type LeadershipSecurityActivityCategory =
  (typeof LEADERSHIP_SECURITY_ACTIVITY_CATEGORIES)[number];

export const LEADERSHIP_SECURITY_ACTIVITY_CATEGORY_LABELS: Record<
  LeadershipSecurityActivityCategory,
  string
> = {
  DOCUMENTS: "Leadership documents",
  PURCHASES: "Purchase requests",
  MAINTENANCE: "Maintenance requests",
  EQUIPMENT: "Equipment",
  FINANCIAL: "Financial controls",
  PRIVACY: "Privacy requests",
  ORGANIZATION: "Organization settings",
};

export type LeadershipSecurityActivityAllowListEntry = {
  entityType: string;
  action: string;
  category: LeadershipSecurityActivityCategory;
  actionLabel: string;
  summary: string;
};

const ALLOW_LIST = [
  {
    entityType: "LeadershipDocument",
    action: "UPLOAD_LEADERSHIP_DOCUMENT",
    category: "DOCUMENTS",
    actionLabel: "Uploaded a leadership document",
    summary: "A leadership document was uploaded.",
  },
  {
    entityType: "LeadershipDocument",
    action: "ARCHIVE_LEADERSHIP_DOCUMENT",
    category: "DOCUMENTS",
    actionLabel: "Archived a leadership document",
    summary: "A leadership document was archived.",
  },
  {
    entityType: "LeadershipDocument",
    action: "RESTORE_LEADERSHIP_DOCUMENT",
    category: "DOCUMENTS",
    actionLabel: "Restored a leadership document",
    summary: "A leadership document was restored.",
  },
  {
    entityType: "LeadershipDocument",
    action: "DOWNLOAD_LEADERSHIP_DOCUMENT",
    category: "DOCUMENTS",
    actionLabel: "Downloaded a leadership document",
    summary: "A leadership document was downloaded.",
  },
  {
    entityType: "PurchaseRequest",
    action: "CREATE_PURCHASE_REQUEST",
    category: "PURCHASES",
    actionLabel: "Submitted a purchase request",
    summary: "A purchase request was submitted.",
  },
  {
    entityType: "PurchaseRequest",
    action: "APPROVE_PURCHASE_REQUEST",
    category: "PURCHASES",
    actionLabel: "Approved a purchase request",
    summary: "A purchase request was approved.",
  },
  {
    entityType: "PurchaseRequest",
    action: "DECLINE_PURCHASE_REQUEST",
    category: "PURCHASES",
    actionLabel: "Declined a purchase request",
    summary: "A purchase request was declined.",
  },
  {
    entityType: "PurchaseRequest",
    action: "CANCEL_PURCHASE_REQUEST",
    category: "PURCHASES",
    actionLabel: "Cancelled a purchase request",
    summary: "A purchase request was cancelled.",
  },
  {
    entityType: "MaintenanceRequest",
    action: "CREATE_MAINTENANCE_REQUEST",
    category: "MAINTENANCE",
    actionLabel: "Submitted a maintenance request",
    summary: "A maintenance request was submitted.",
  },
  {
    entityType: "MaintenanceRequest",
    action: "UPDATE_MAINTENANCE_REQUEST",
    category: "MAINTENANCE",
    actionLabel: "Updated a maintenance request",
    summary: "A maintenance request was updated.",
  },
  {
    entityType: "MaintenanceRequest",
    action: "CHANGE_MAINTENANCE_REQUEST_STATUS",
    category: "MAINTENANCE",
    actionLabel: "Changed a maintenance request status",
    summary: "A maintenance request status was changed.",
  },
  {
    entityType: "EquipmentItem",
    action: "CREATE_EQUIPMENT_ITEM",
    category: "EQUIPMENT",
    actionLabel: "Added equipment",
    summary: "An equipment record was added.",
  },
  {
    entityType: "EquipmentItem",
    action: "UPDATE_EQUIPMENT_ITEM",
    category: "EQUIPMENT",
    actionLabel: "Updated equipment",
    summary: "An equipment record was updated.",
  },
  {
    entityType: "EquipmentItem",
    action: "ARCHIVE_EQUIPMENT_ITEM",
    category: "EQUIPMENT",
    actionLabel: "Archived equipment",
    summary: "An equipment record was archived.",
  },
  {
    entityType: "EquipmentItem",
    action: "RESTORE_EQUIPMENT_ITEM",
    category: "EQUIPMENT",
    actionLabel: "Restored equipment",
    summary: "An equipment record was restored.",
  },
  {
    entityType: "EquipmentCheckout",
    action: "CHECK_OUT_EQUIPMENT",
    category: "EQUIPMENT",
    actionLabel: "Checked out equipment",
    summary: "Equipment was checked out.",
  },
  {
    entityType: "EquipmentCheckout",
    action: "RETURN_EQUIPMENT",
    category: "EQUIPMENT",
    actionLabel: "Returned equipment",
    summary: "Equipment was returned.",
  },
  {
    entityType: "FinancialCorrectionRequest",
    action: "REQUEST_FINANCIAL_CORRECTION",
    category: "FINANCIAL",
    actionLabel: "Requested a financial correction",
    summary: "A financial correction was requested.",
  },
  {
    entityType: "FinancialCorrectionRequest",
    action: "APPROVE_FINANCIAL_CORRECTION",
    category: "FINANCIAL",
    actionLabel: "Approved a financial correction",
    summary: "A financial correction was approved.",
  },
  {
    entityType: "FinancialCorrectionRequest",
    action: "REJECT_FINANCIAL_CORRECTION",
    category: "FINANCIAL",
    actionLabel: "Rejected a financial correction",
    summary: "A financial correction was rejected.",
  },
  {
    entityType: "FinancialCorrectionRequest",
    action: "CANCEL_FINANCIAL_CORRECTION",
    category: "FINANCIAL",
    actionLabel: "Cancelled a financial correction",
    summary: "A financial correction was cancelled.",
  },
  {
    entityType: "ContributionStatement",
    action: "GENERATE_CONTRIBUTION_STATEMENT",
    category: "FINANCIAL",
    actionLabel: "Generated a contribution statement",
    summary: "A contribution statement was generated.",
  },
  {
    entityType: "ContributionStatement",
    action: "REISSUE_CONTRIBUTION_STATEMENT",
    category: "FINANCIAL",
    actionLabel: "Reissued a contribution statement",
    summary: "A contribution statement was reissued.",
  },
  {
    entityType: "ContributionStatement",
    action: "PUBLISH_CONTRIBUTION_STATEMENT",
    category: "FINANCIAL",
    actionLabel: "Published a contribution statement",
    summary: "A contribution statement was published.",
  },
  {
    entityType: "ContributionStatement",
    action: "VOID_CONTRIBUTION_STATEMENT",
    category: "FINANCIAL",
    actionLabel: "Voided a contribution statement",
    summary: "A contribution statement was voided.",
  },
  {
    entityType: "StatementVoidRequest",
    action: "REQUEST_CONTRIBUTION_STATEMENT_VOID",
    category: "FINANCIAL",
    actionLabel: "Requested a statement void",
    summary: "A statement void was requested.",
  },
  {
    entityType: "StatementVoidRequest",
    action: "APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST",
    category: "FINANCIAL",
    actionLabel: "Approved a statement void request",
    summary: "A statement void request was approved.",
  },
  {
    entityType: "StatementVoidRequest",
    action: "REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST",
    category: "FINANCIAL",
    actionLabel: "Rejected a statement void request",
    summary: "A statement void request was rejected.",
  },
  {
    entityType: "StatementVoidRequest",
    action: "EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST",
    category: "FINANCIAL",
    actionLabel: "Executed a statement void request",
    summary: "A statement void request was executed.",
  },
  {
    entityType: "MemberPrivacyDataRequest",
    action: "UPDATE_PRIVACY_DATA_REQUEST_STATUS",
    category: "PRIVACY",
    actionLabel: "Updated a privacy request",
    summary: "A privacy data request decision was recorded.",
  },
  {
    entityType: "Organization",
    action: "UPDATE",
    category: "ORGANIZATION",
    actionLabel: "Updated organization settings",
    summary: "Organization settings were updated.",
  },
  {
    entityType: "Organization",
    action: "CREATE",
    category: "ORGANIZATION",
    actionLabel: "Created organization settings",
    summary: "Organization settings were created.",
  },
] as const satisfies readonly LeadershipSecurityActivityAllowListEntry[];

const SAFE_SUMMARY_FIELDS = new Set(["status", "documentType", "requestType"]);

export type LeadershipSecurityActivityRow = {
  occurredAtIso: string;
  occurredAtLabel: string;
  category: LeadershipSecurityActivityCategory;
  categoryLabel: string;
  actionLabel: string;
  performedBy: string;
  summary: string;
};

export type LeadershipSecurityActivityCount = {
  category: LeadershipSecurityActivityCategory;
  categoryLabel: string;
  count: number;
};

export type LeadershipSecurityActivityRelatedLink = {
  href: string;
  label: string;
};

export type LeadershipSecurityActivityNavItem = {
  href: string;
  label: string;
};

export function leadershipSecurityActivityNavItems(
  canViewSecurityActivity: boolean,
): LeadershipSecurityActivityNavItem[] {
  return canViewSecurityActivity
    ? [
        {
          href: LEADERSHIP_SECURITY_ACTIVITY_HREF,
          label: "Security Activity",
        },
      ]
    : [];
}

export function leadershipSecurityActivityAllowList(
  category?: LeadershipSecurityActivityCategory | null,
): LeadershipSecurityActivityAllowListEntry[] {
  const entries = [...ALLOW_LIST];
  if (!category) return entries;
  return entries.filter((entry) => entry.category === category);
}

export function findLeadershipSecurityActivityAllowListEntry(
  entityType: string,
  action: string,
): LeadershipSecurityActivityAllowListEntry | null {
  return (
    ALLOW_LIST.find(
      (entry) => entry.entityType === entityType && entry.action === action,
    ) ?? null
  );
}

export function formatLeadershipSecurityActivityDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function optionalText(value: unknown) {
  const text = firstString(value).trim();
  return text || undefined;
}

export function parseLeadershipSecurityActivityFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const category = optionalText(record.category);
  if (!category) {
    return { success: true as const, data: { category: null } };
  }
  const parsed = z
    .enum(LEADERSHIP_SECURITY_ACTIVITY_CATEGORIES)
    .safeParse(category);
  if (!parsed.success) return { success: false as const };
  return { success: true as const, data: { category: parsed.data } };
}

function humanizeCode(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isUnsafeSummaryValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 48) return true;
  if (/[\\/]/.test(trimmed)) return true;
  if (/@/.test(trimmed)) return true;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return /secret|password|token|api[_-]?key|storage|filekey|sk_live|sk_test/i.test(
    trimmed,
  );
}

type AuditChange = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

function readChanges(metadata: unknown): AuditChange[] {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("changes" in metadata) ||
    !Array.isArray(metadata.changes)
  ) {
    return [];
  }
  return metadata.changes.flatMap((change) => {
    if (!change || typeof change !== "object") return [];
    const record = change as Record<string, unknown>;
    if (typeof record.field !== "string") return [];
    return [
      {
        field: record.field,
        oldValue: typeof record.oldValue === "string" ? record.oldValue : null,
        newValue: typeof record.newValue === "string" ? record.newValue : null,
      },
    ];
  });
}

export function buildLeadershipSecurityActivitySummary(
  entry: LeadershipSecurityActivityAllowListEntry,
  metadata: unknown,
) {
  if (entry.category === "ORGANIZATION") return entry.summary;

  const extras = readChanges(metadata).flatMap((change) => {
    if (!SAFE_SUMMARY_FIELDS.has(change.field)) return [];
    const value = change.newValue?.trim();
    if (!value || isUnsafeSummaryValue(value)) return [];
    if (change.field === "status") {
      return [`Status is now ${humanizeCode(value)}.`] as const;
    }
    if (change.field === "documentType") {
      return [`Document type: ${humanizeCode(value)}.`] as const;
    }
    if (change.field === "requestType") {
      return [`Request type: ${humanizeCode(value)}.`] as const;
    }
    return [];
  });

  if (extras.length === 0) return entry.summary;
  return `${entry.summary} ${extras.join(" ")}`;
}

export function actorDisplayNameOrFallback(displayName: string | null | undefined) {
  const name = displayName?.trim();
  return name || LEADERSHIP_SECURITY_ACTIVITY_UNKNOWN_ACTOR;
}
