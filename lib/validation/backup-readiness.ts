import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";
import {
  formatVolunteerTimeOffDate,
  parseDateOnly,
  utcToday,
} from "@/lib/validation/volunteer-time-off-request";

export const BACKUP_READINESS_HREF = "/administration/backup-readiness";

export const BACKUP_READINESS_SUBTITLE =
  "Record external backup checks and restore-test results for church data.";

export const BACKUP_READINESS_NOTICE =
  "BITS does not create or verify backups from this page. Record only checks you have actually completed.";

export const BACKUP_READINESS_EMPTY_COPY =
  "No backup checks match this filter yet.";

export const BACKUP_READINESS_STORAGE_SUMMARY_MAX = 80;
export const BACKUP_READINESS_NOTES_MAX = 280;
export const BACKUP_READINESS_MAX_FUTURE_MS = 7 * 24 * 60 * 60 * 1000;

export const BACKUP_READINESS_SCOPES = [
  "DATABASE",
  "LEADERSHIP_DOCUMENTS",
  "MEMBER_DOCUMENTS",
  "PHOTOGRAPHS",
  "OTHER",
] as const;

export type BackupReadinessScope = (typeof BACKUP_READINESS_SCOPES)[number];

export const BACKUP_READINESS_SCOPE_LABELS: Record<
  BackupReadinessScope,
  string
> = {
  DATABASE: "Database",
  LEADERSHIP_DOCUMENTS: "Leadership Documents",
  MEMBER_DOCUMENTS: "Member Documents",
  PHOTOGRAPHS: "Photographs",
  OTHER: "Other",
};

export const BACKUP_READINESS_RESULTS = [
  "VERIFIED",
  "RESTORE_TESTED",
  "NEEDS_ATTENTION",
  "NOT_VERIFIED",
] as const;

export type BackupReadinessResult = (typeof BACKUP_READINESS_RESULTS)[number];

export const BACKUP_READINESS_RESULT_LABELS: Record<
  BackupReadinessResult,
  string
> = {
  VERIFIED: "Verified",
  RESTORE_TESTED: "Restore tested",
  NEEDS_ATTENTION: "Needs attention",
  NOT_VERIFIED: "Not verified",
};

export type BackupReadinessLogRow = {
  id: string;
  scope: BackupReadinessScope;
  scopeLabel: string;
  result: BackupReadinessResult;
  resultLabel: string;
  checkedAtLabel: string;
  nextReviewLabel: string;
  nextReviewAtIso: string | null;
  storageSummary: string | null;
  notes: string | null;
  performedByLabel: string;
};

export type BackupReadinessScopeStatus = {
  scope: BackupReadinessScope;
  scopeLabel: string;
  result: BackupReadinessResult | null;
  resultLabel: string;
  checkedAtLabel: string;
  nextReviewLabel: string;
  storageSummary: string | null;
  needsReview: boolean;
};

export type BackupReadinessFilter = {
  scope: BackupReadinessScope | null;
  result: BackupReadinessResult | null;
};

export type BackupReadinessNavItem = {
  href: string;
  label: string;
};

const DATETIME_LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATETIME_LOCAL_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const SECRET_OR_URL =
  /https?:\/\/|www\.|[a-z][a-z0-9+.-]*:\/\/|sk_live|sk_test|whsec_|password|token|api[_-]?key|secret|@[a-z0-9.-]+\./i;

export function backupReadinessNavItems(
  canManageBackupReadiness: boolean,
): BackupReadinessNavItem[] {
  return canManageBackupReadiness
    ? [
        {
          href: BACKUP_READINESS_HREF,
          label: "Backup & Restore Readiness",
        },
      ]
    : [];
}

export function formatBackupReadinessDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

export function formatBackupCheckedAt(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

export function backupReadinessNeedsReview(
  nextReviewAt: Date | null | undefined,
  hasEntry: boolean,
  now = utcToday(),
) {
  if (!hasEntry) return true;
  if (!nextReviewAt) return false;
  const due = Date.UTC(
    nextReviewAt.getUTCFullYear(),
    nextReviewAt.getUTCMonth(),
    nextReviewAt.getUTCDate(),
  );
  return due <= now.getTime();
}

export function utcDateOnly(value: Date) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    ),
  );
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

function looksLikeSecretOrUrl(value: string) {
  return SECRET_OR_URL.test(value);
}

const storageSummarySchema = z
  .string()
  .trim()
  .max(BACKUP_READINESS_STORAGE_SUMMARY_MAX, {
    error: "Keep the storage summary to 80 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Use plain text only. HTML and markup are not allowed.",
  })
  .refine((value) => !looksLikeSecretOrUrl(value), {
    error: "Do not record URLs, credentials, or tokens.",
  })
  .transform((value) => value.replace(/\s+/g, " ").trim());

const notesSchema = z
  .string()
  .trim()
  .max(BACKUP_READINESS_NOTES_MAX, {
    error: "Keep notes to 280 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Use plain text only. HTML and markup are not allowed.",
  })
  .refine((value) => !looksLikeSecretOrUrl(value), {
    error: "Do not record URLs, credentials, or tokens.",
  })
  .transform((value) => value.trim());

function parseCheckedAt(value: unknown, now: Date) {
  const raw = optionalText(value);
  if (!raw) return { success: false as const };
  let date: Date | null = null;
  if (DATETIME_LOCAL_MINUTE.test(raw)) {
    date = new Date(`${raw}:00.000Z`);
  } else if (DATETIME_LOCAL_SECOND.test(raw)) {
    date = new Date(`${raw}.000Z`);
  } else {
    date = new Date(raw);
  }
  if (!date || Number.isNaN(date.getTime())) return { success: false as const };
  if (date.getTime() > now.getTime() + BACKUP_READINESS_MAX_FUTURE_MS) {
    return { success: false as const };
  }
  return { success: true as const, date };
}

function parseNextReviewAt(value: unknown) {
  const raw = optionalText(value);
  if (!raw) return { success: true as const, date: null };
  const date = parseDateOnly(raw);
  if (!date) return { success: false as const };
  return { success: true as const, date };
}

function optionalPlain(
  schema: typeof storageSummarySchema | typeof notesSchema,
  value: unknown,
) {
  const raw = optionalText(value);
  if (!raw) return { success: true as const, text: null };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { success: false as const };
  return { success: true as const, text: parsed.data };
}

export function parseBackupReadinessFilter(input: unknown):
  | { success: true; data: BackupReadinessFilter }
  | { success: false } {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const scopeRaw = optionalText(record.scope);
  const resultRaw = optionalText(record.result);
  const scope = scopeRaw
    ? z.enum(BACKUP_READINESS_SCOPES).safeParse(scopeRaw)
    : { success: true as const, data: null };
  const result = resultRaw
    ? z.enum(BACKUP_READINESS_RESULTS).safeParse(resultRaw)
    : { success: true as const, data: null };
  if (!scope.success || !result.success) return { success: false };
  return {
    success: true,
    data: {
      scope: scope.data,
      result: result.data,
    },
  };
}

export function parseBackupReadinessCreate(
  input: unknown,
  now = new Date(),
) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const scope = z.enum(BACKUP_READINESS_SCOPES).safeParse(record.scope);
  const result = z.enum(BACKUP_READINESS_RESULTS).safeParse(record.result);
  const checkedAt = parseCheckedAt(record.checkedAt, now);
  const nextReviewAt = parseNextReviewAt(record.nextReviewAt);
  const storageSummary = optionalPlain(
    storageSummarySchema,
    record.storageSummary,
  );
  const notes = optionalPlain(notesSchema, record.notes);
  if (
    !scope.success ||
    !result.success ||
    !checkedAt.success ||
    !nextReviewAt.success ||
    !storageSummary.success ||
    !notes.success
  ) {
    return { success: false as const };
  }
  if (
    nextReviewAt.date &&
    utcDateOnly(nextReviewAt.date).getTime() <
      utcDateOnly(checkedAt.date).getTime()
  ) {
    return { success: false as const };
  }
  return {
    success: true as const,
    data: {
      scope: scope.data,
      result: result.data,
      checkedAt: checkedAt.date,
      nextReviewAt: nextReviewAt.date,
      storageSummary: storageSummary.text,
      notes: notes.text,
    },
  };
}

type LatestLogInput = {
  id: string;
  scope: BackupReadinessScope;
  result: BackupReadinessResult;
  checkedAt: Date;
  createdAt: Date;
  nextReviewAt: Date | null;
  storageSummary: string | null;
  notes: string | null;
  performedByLabel: string;
};

export function deriveBackupReadinessStatus(
  rows: LatestLogInput[],
  now = utcToday(),
): BackupReadinessScopeStatus[] {
  const latest = new Map<BackupReadinessScope, LatestLogInput>();
  for (const row of rows) {
    const existing = latest.get(row.scope);
    if (!existing) {
      latest.set(row.scope, row);
      continue;
    }
    const newerCheck = row.checkedAt.getTime() > existing.checkedAt.getTime();
    const sameCheckNewer =
      row.checkedAt.getTime() === existing.checkedAt.getTime() &&
      row.createdAt.getTime() > existing.createdAt.getTime();
    if (newerCheck || sameCheckNewer) latest.set(row.scope, row);
  }

  return BACKUP_READINESS_SCOPES.map((scope) => {
    const entry = latest.get(scope) ?? null;
    return {
      scope,
      scopeLabel: BACKUP_READINESS_SCOPE_LABELS[scope],
      result: entry?.result ?? null,
      resultLabel: entry
        ? BACKUP_READINESS_RESULT_LABELS[entry.result]
        : "No check recorded",
      checkedAtLabel: entry
        ? formatBackupCheckedAt(entry.checkedAt)
        : "Not recorded",
      nextReviewLabel: entry?.nextReviewAt
        ? formatBackupReadinessDate(entry.nextReviewAt)
        : "No review date",
      storageSummary: entry?.storageSummary ?? null,
      needsReview: backupReadinessNeedsReview(
        entry?.nextReviewAt ?? null,
        Boolean(entry),
        now,
      ),
    };
  });
}

export function filterBackupReadinessHistory(
  rows: LatestLogInput[],
  filter: BackupReadinessFilter,
) {
  return rows.filter((row) => {
    if (filter.scope && row.scope !== filter.scope) return false;
    if (filter.result && row.result !== filter.result) return false;
    return true;
  });
}

export function toBackupReadinessLogRow(
  row: LatestLogInput,
): BackupReadinessLogRow {
  return {
    id: row.id,
    scope: row.scope,
    scopeLabel: BACKUP_READINESS_SCOPE_LABELS[row.scope],
    result: row.result,
    resultLabel: BACKUP_READINESS_RESULT_LABELS[row.result],
    checkedAtLabel: formatBackupCheckedAt(row.checkedAt),
    nextReviewLabel: row.nextReviewAt
      ? formatBackupReadinessDate(row.nextReviewAt)
      : "No review date",
    nextReviewAtIso: row.nextReviewAt
      ? row.nextReviewAt.toISOString().slice(0, 10)
      : null,
    storageSummary: row.storageSummary,
    notes: row.notes,
    performedByLabel: row.performedByLabel,
  };
}
