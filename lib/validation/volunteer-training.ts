import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";
import {
  formatVolunteerTimeOffDate,
  parseDateOnly,
} from "@/lib/validation/volunteer-time-off-request";

export const VOLUNTEER_TRAINING_TITLE_MIN = 3;
export const VOLUNTEER_TRAINING_TITLE_MAX = 80;
export const VOLUNTEER_TRAINING_EXPIRING_SOON_DAYS = 60;

export const VOLUNTEER_TRAINING_STATUS_FILTERS = [
  "CURRENT",
  "EXPIRING_SOON",
  "EXPIRED",
  "NO_EXPIRATION",
  "ARCHIVED",
] as const;

export type VolunteerTrainingStatusFilter =
  (typeof VOLUNTEER_TRAINING_STATUS_FILTERS)[number];

export const VOLUNTEER_TRAINING_STATUSES = [
  "CURRENT",
  "EXPIRING_SOON",
  "EXPIRED",
  "NO_EXPIRATION",
] as const;

export type VolunteerTrainingStatus =
  (typeof VOLUNTEER_TRAINING_STATUSES)[number];

export const VOLUNTEER_TRAINING_STATUS_LABELS: Record<
  VolunteerTrainingStatus,
  string
> = {
  CURRENT: "Current",
  EXPIRING_SOON: "Expiring soon",
  EXPIRED: "Expired",
  NO_EXPIRATION: "No expiration date",
};

export const VOLUNTEER_TRAINING_FILTER_LABELS: Record<
  VolunteerTrainingStatusFilter,
  string
> = {
  ...VOLUNTEER_TRAINING_STATUS_LABELS,
  ARCHIVED: "Archived",
};

export const STAFF_VOLUNTEER_TRAINING_NOTICE =
  "Record ordinary ministry training and optional expiration dates. This is not a background-check system and does not store certificates, documents, contact details, or confidential notes.";

export const STAFF_VOLUNTEER_TRAINING_EMPTY_COPY =
  "No volunteer training records match this view.";

export const VOLUNTEER_TRAINING_ROW_FIELDS = [
  "recordId",
  "memberName",
  "ministryName",
  "title",
  "completedOnLabel",
  "expiresOnLabel",
  "completedOnValue",
  "expiresOnValue",
  "status",
  "statusLabel",
  "archived",
] as const;

export type VolunteerTrainingRow = {
  recordId: string;
  memberName: string;
  ministryName: string | null;
  title: string;
  completedOnLabel: string;
  expiresOnLabel: string | null;
  completedOnValue: string;
  expiresOnValue: string;
  status: VolunteerTrainingStatus;
  statusLabel: string;
  archived: boolean;
};

export type StaffVolunteerTrainingNavItem = {
  href: string;
  label: string;
};

export function staffVolunteerTrainingNavItems(
  canManageMinistryRosters: boolean,
): StaffVolunteerTrainingNavItem[] {
  return canManageMinistryRosters
    ? [{ href: "/volunteer-training", label: "Volunteer Training" }]
    : [];
}

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function optionalText(value: unknown) {
  const text = firstString(value)?.trim() ?? "";
  return text === "" ? undefined : text;
}

function normalizeTrainingTitle(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function volunteerTrainingToday(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

export function formatVolunteerTrainingDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

export function toVolunteerTrainingDateValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function volunteerTrainingStatus(
  expiresOn: Date | null,
  now = new Date(),
): VolunteerTrainingStatus {
  if (!expiresOn) return "NO_EXPIRATION";
  const today = volunteerTrainingToday(now);
  if (expiresOn.getTime() < today.getTime()) return "EXPIRED";
  if (
    expiresOn.getTime() <=
    addUtcDays(today, VOLUNTEER_TRAINING_EXPIRING_SOON_DAYS).getTime()
  ) {
    return "EXPIRING_SOON";
  }
  return "CURRENT";
}

const titleSchema = z
  .string()
  .trim()
  .min(VOLUNTEER_TRAINING_TITLE_MIN, {
    error: "Title must be 3–80 characters.",
  })
  .max(VOLUNTEER_TRAINING_TITLE_MAX, {
    error: "Title must be 3–80 characters.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Use plain text only. HTML and markup are not allowed.",
  });

function refineTrainingDates(
  value: { completedOn: string; expiresOn?: string },
  ctx: z.RefinementCtx,
) {
  const completedOn = parseDateOnly(value.completedOn);
  if (!completedOn) {
    ctx.addIssue({
      code: "custom",
      path: ["completedOn"],
      message: "Enter a valid completed date.",
    });
    return;
  }
  if (value.expiresOn) {
    const expiresOn = parseDateOnly(value.expiresOn);
    if (!expiresOn) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresOn"],
        message: "Enter a valid expiration date.",
      });
      return;
    }
    if (expiresOn.getTime() < completedOn.getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresOn"],
        message: "Expiration date must be on or after the completed date.",
      });
    }
  }
}

export function parseStaffVolunteerTrainingFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const status = optionalText(record.status);
  if (!status) return { success: true as const, data: { status: null } };
  const parsed = z.enum(VOLUNTEER_TRAINING_STATUS_FILTERS).safeParse(status);
  if (!parsed.success) return { success: false as const };
  return { success: true as const, data: { status: parsed.data } };
}

export function parseVolunteerTrainingCreate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const title = optionalText(record.title);
  return z
    .object({
      memberId: z.string().uuid(),
      ministryId: z.string().uuid().optional(),
      title: titleSchema,
      completedOn: z.string(),
      expiresOn: z.string().optional(),
    })
    .superRefine(refineTrainingDates)
    .safeParse({
      memberId: firstString(record.memberId),
      ministryId: optionalText(record.ministryId),
      title: title ? normalizeTrainingTitle(title) : title,
      completedOn: firstString(record.completedOn),
      expiresOn: optionalText(record.expiresOn),
    });
}

export function parseVolunteerTrainingUpdate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const title = optionalText(record.title);
  return z
    .object({
      recordId: z.string().uuid(),
      title: titleSchema,
      completedOn: z.string(),
      expiresOn: z.string().optional(),
    })
    .superRefine(refineTrainingDates)
    .safeParse({
      recordId: firstString(record.recordId),
      title: title ? normalizeTrainingTitle(title) : title,
      completedOn: firstString(record.completedOn),
      expiresOn: optionalText(record.expiresOn),
    });
}

export function parseVolunteerTrainingRecordId(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return z.string().uuid().safeParse(
    typeof input === "string" ? input : firstString(record.recordId),
  );
}
