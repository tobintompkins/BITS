import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";
import {
  formatVolunteerTimeOffDate,
  parseDateOnly,
  utcToday,
} from "@/lib/validation/volunteer-time-off-request";

export const DATA_RETENTION_POLICIES_HREF = "/administration/data-retention";

export const DATA_RETENTION_TITLE_MIN = 3;
export const DATA_RETENTION_TITLE_MAX = 80;
export const DATA_RETENTION_SUMMARY_MIN = 10;
export const DATA_RETENTION_SUMMARY_MAX = 500;
export const DATA_RETENTION_MONTHS_MIN = 1;
export const DATA_RETENTION_MONTHS_MAX = 600;

export const DATA_RETENTION_POLICIES_SUBTITLE =
  "Record the church’s approved guidance for how long categories of information should be kept.";

export const DATA_RETENTION_POLICIES_NOTICE =
  "These policies do not automatically delete data. Review legal, financial, and pastoral requirements before changing a policy.";

export const DATA_RETENTION_POLICIES_EMPTY_COPY =
  "No data retention policies have been recorded yet.";

export const DATA_RETENTION_CATEGORIES = [
  "MEMBER_RECORDS",
  "GIVING_AND_STATEMENTS",
  "EVENT_AND_ATTENDANCE",
  "VOLUNTEER_AND_TRAINING",
  "LEADERSHIP_DOCUMENTS",
  "MAINTENANCE_AND_OPERATIONS",
  "PRIVACY_REQUESTS",
  "AUDIT_HISTORY",
  "OTHER",
] as const;

export type DataRetentionCategory = (typeof DATA_RETENTION_CATEGORIES)[number];

export const DATA_RETENTION_CATEGORY_LABELS: Record<
  DataRetentionCategory,
  string
> = {
  MEMBER_RECORDS: "Member records",
  GIVING_AND_STATEMENTS: "Giving and statements",
  EVENT_AND_ATTENDANCE: "Events and attendance",
  VOLUNTEER_AND_TRAINING: "Volunteer and training",
  LEADERSHIP_DOCUMENTS: "Leadership documents",
  MAINTENANCE_AND_OPERATIONS: "Maintenance and operations",
  PRIVACY_REQUESTS: "Privacy requests",
  AUDIT_HISTORY: "Audit history",
  OTHER: "Other",
};

export type DataRetentionPolicyRow = {
  id: string;
  category: DataRetentionCategory;
  categoryLabel: string;
  title: string;
  retentionPeriodMonths: number | null;
  retentionPeriodLabel: string;
  policySummary: string;
  reviewDueAtIso: string | null;
  reviewDueLabel: string;
  reviewDue: boolean;
  isActive: boolean;
  stateLabel: string;
  updatedOnLabel: string;
};

export type DataRetentionPolicyCounts = {
  activePolicies: number;
  reviewDue: number;
  noFixedPeriod: number;
};

export type DataRetentionPolicyNavItem = {
  href: string;
  label: string;
};

export function dataRetentionPolicyNavItems(
  canManagePolicies: boolean,
): DataRetentionPolicyNavItem[] {
  return canManagePolicies
    ? [{ href: DATA_RETENTION_POLICIES_HREF, label: "Data Retention Policies" }]
    : [];
}

export function formatDataRetentionDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

export function formatRetentionPeriod(months: number | null) {
  if (months == null) return "No fixed period";
  return months === 1 ? "1 month" : `${months} months`;
}

export function isDataRetentionReviewDue(
  reviewDueAt: Date | null,
  now = utcToday(),
) {
  if (!reviewDueAt) return false;
  const due = Date.UTC(
    reviewDueAt.getUTCFullYear(),
    reviewDueAt.getUTCMonth(),
    reviewDueAt.getUTCDate(),
  );
  return due <= now.getTime();
}

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function optionalText(value: unknown) {
  const text = firstString(value).trim();
  return text || undefined;
}

function normalizePlain(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

const titleSchema = z
  .string()
  .trim()
  .min(DATA_RETENTION_TITLE_MIN, {
    error: "Enter a short policy title.",
  })
  .max(DATA_RETENTION_TITLE_MAX, {
    error: "Keep the title to 80 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Use plain text only. HTML and markup are not allowed.",
  })
  .transform(normalizePlain);

const summarySchema = z
  .string()
  .trim()
  .min(DATA_RETENTION_SUMMARY_MIN, {
    error: "Summarize the approved retention guidance.",
  })
  .max(DATA_RETENTION_SUMMARY_MAX, {
    error: "Keep the summary to 500 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Use plain text only. HTML and markup are not allowed.",
  })
  .transform((value) => value.trim());

function parseRetentionMonths(value: unknown) {
  const raw = optionalText(value);
  if (!raw) return { success: true as const, months: null };
  if (!/^[0-9]+$/.test(raw)) return { success: false as const };
  const months = Number(raw);
  if (
    !Number.isInteger(months) ||
    months < DATA_RETENTION_MONTHS_MIN ||
    months > DATA_RETENTION_MONTHS_MAX
  ) {
    return { success: false as const };
  }
  return { success: true as const, months };
}

function parseReviewDueAt(value: unknown) {
  const raw = optionalText(value);
  if (!raw) return { success: true as const, date: null };
  const date = parseDateOnly(raw);
  if (!date) return { success: false as const };
  return { success: true as const, date };
}

export function parseDataRetentionPolicyCreate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const category = z.enum(DATA_RETENTION_CATEGORIES).safeParse(record.category);
  const title = titleSchema.safeParse(firstString(record.title));
  const summary = summarySchema.safeParse(firstString(record.policySummary));
  const months = parseRetentionMonths(record.retentionPeriodMonths);
  const reviewDueAt = parseReviewDueAt(record.reviewDueAt);
  if (
    !category.success ||
    !title.success ||
    !summary.success ||
    !months.success ||
    !reviewDueAt.success
  ) {
    return { success: false as const };
  }
  return {
    success: true as const,
    data: {
      category: category.data,
      title: title.data,
      policySummary: summary.data,
      retentionPeriodMonths: months.months,
      reviewDueAt: reviewDueAt.date,
    },
  };
}

export function parseDataRetentionPolicyUpdate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const policyId = z.string().uuid().safeParse(optionalText(record.policyId));
  const title = titleSchema.safeParse(firstString(record.title));
  const summary = summarySchema.safeParse(firstString(record.policySummary));
  const months = parseRetentionMonths(record.retentionPeriodMonths);
  const reviewDueAt = parseReviewDueAt(record.reviewDueAt);
  if (
    !policyId.success ||
    !title.success ||
    !summary.success ||
    !months.success ||
    !reviewDueAt.success
  ) {
    return { success: false as const };
  }
  return {
    success: true as const,
    data: {
      policyId: policyId.data,
      title: title.data,
      policySummary: summary.data,
      retentionPeriodMonths: months.months,
      reviewDueAt: reviewDueAt.date,
    },
  };
}

export function parseDataRetentionPolicyId(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const policyId = z.string().uuid().safeParse(
    optionalText(record.policyId) ?? firstString(input),
  );
  if (!policyId.success) return { success: false as const };
  return { success: true as const, data: policyId.data };
}

export function countDataRetentionPolicies(
  rows: Array<{
    isActive: boolean;
    retentionPeriodMonths: number | null;
    reviewDue: boolean;
  }>,
): DataRetentionPolicyCounts {
  return {
    activePolicies: rows.filter((row) => row.isActive).length,
    reviewDue: rows.filter((row) => row.isActive && row.reviewDue).length,
    noFixedPeriod: rows.filter(
      (row) => row.isActive && row.retentionPeriodMonths == null,
    ).length,
  };
}
