import Decimal from "decimal.js";
import { z } from "zod";

import { formatMoney } from "@/lib/money/decimal";
import { containsMarkup } from "@/lib/validation/church-announcement";
import { formatVolunteerTimeOffDate } from "@/lib/validation/volunteer-time-off-request";

export const PURCHASE_TITLE_MIN = 3;
export const PURCHASE_TITLE_MAX = 80;
export const PURCHASE_DESCRIPTION_MIN = 10;
export const PURCHASE_DESCRIPTION_MAX = 1000;
export const PURCHASE_CATEGORY_MAX = 40;
export const PURCHASE_LOCATION_MAX = 80;
export const PURCHASE_DECISION_NOTE_MIN = 5;
export const PURCHASE_DECISION_NOTE_MAX = 500;
export const PURCHASE_CANCEL_NOTE_MAX = 500;
export const PURCHASE_MAX_AMOUNT_CENTS = 99_999_999;

export const PURCHASE_REQUEST_STATUSES = [
  "PENDING",
  "APPROVED",
  "DECLINED",
  "CANCELLED",
] as const;

export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number];

export const PURCHASE_REQUEST_STATUS_LABELS: Record<
  PurchaseRequestStatus,
  string
> = {
  PENDING: "Pending review",
  APPROVED: "Approved to proceed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

export const PURCHASE_REQUESTS_NOTICE =
  "Request ministry or facility purchases for leadership review. This page does not place orders or move money.";

export const PURCHASE_REQUESTS_EMPTY_COPY =
  "No purchase requests match this view.";

export const PURCHASE_REQUESTS_HREF = "/purchase-requests";

export const PURCHASE_REQUEST_ROW_FIELDS = [
  "id",
  "title",
  "description",
  "category",
  "estimatedAmountCents",
  "estimatedAmountLabel",
  "requestedForLocation",
  "equipmentName",
  "status",
  "statusLabel",
  "requesterName",
  "submittedOnLabel",
  "decisionNote",
  "reviewedOnLabel",
  "canCancel",
  "canDecide",
] as const;

export type PurchaseRequestRow = {
  id: string;
  title: string;
  description: string;
  category: string | null;
  estimatedAmountCents: number | null;
  estimatedAmountLabel: string;
  requestedForLocation: string | null;
  equipmentName: string | null;
  status: PurchaseRequestStatus;
  statusLabel: string;
  requesterName: string | null;
  submittedOnLabel: string;
  decisionNote: string | null;
  reviewedOnLabel: string | null;
  canCancel: boolean;
  canDecide: boolean;
};

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function optionalText(value: unknown) {
  const text = firstString(value)?.trim() ?? "";
  return text === "" ? undefined : text;
}

export function normalizePurchaseText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function formatPurchaseDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

export function formatPurchaseAmount(cents: number | null | undefined) {
  if (cents == null) return "No estimate";
  return formatMoney(new Decimal(cents).dividedBy(100).toFixed(2));
}

/**
 * Convert a US-dollar estimate to integer cents. Empty values are null.
 * Optional $ and grouping commas are allowed; other symbols and extra decimals are not.
 */
export function parseEstimatedAmountToCents(value: unknown):
  | { ok: true; cents: number | null }
  | { ok: false } {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > PURCHASE_MAX_AMOUNT_CENTS) {
      return { ok: false };
    }
    return { ok: true, cents: value };
  }

  const raw = firstString(value)?.trim() ?? "";
  if (raw === "") return { ok: true, cents: null };

  let text = raw;
  if (text.startsWith("$")) text = text.slice(1).trim();
  if (text.includes(",")) {
    if (!/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(text)) return { ok: false };
    text = text.replace(/,/g, "");
  }
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) return { ok: false };

  const cents = new Decimal(text).times(100);
  if (!cents.isInteger() || cents.lt(1) || cents.gt(PURCHASE_MAX_AMOUNT_CENTS)) {
    return { ok: false };
  }
  return { ok: true, cents: cents.toNumber() };
}

const titleSchema = z
  .string()
  .trim()
  .min(PURCHASE_TITLE_MIN, { error: "Enter a short purchase title." })
  .max(PURCHASE_TITLE_MAX, {
    error: "Keep the title to 80 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Titles must be plain text.",
  })
  .transform(normalizePurchaseText);

const descriptionSchema = z
  .string()
  .trim()
  .min(PURCHASE_DESCRIPTION_MIN, {
    error: "Describe what needs to be purchased.",
  })
  .max(PURCHASE_DESCRIPTION_MAX, {
    error: "Keep the description to 1,000 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Descriptions must be plain text.",
  })
  .transform(normalizePurchaseText);

const categorySchema = z
  .string()
  .trim()
  .max(PURCHASE_CATEGORY_MAX, { error: "Keep the category short." })
  .refine((value) => !containsMarkup(value), {
    error: "Categories must be plain text.",
  })
  .transform((value) => {
    const normalized = normalizePurchaseText(value);
    return normalized === "" ? undefined : normalized;
  })
  .optional();

const locationSchema = z
  .string()
  .trim()
  .max(PURCHASE_LOCATION_MAX, { error: "Keep the location short." })
  .refine((value) => !containsMarkup(value), {
    error: "Locations must be plain text.",
  })
  .transform((value) => {
    const normalized = normalizePurchaseText(value);
    return normalized === "" ? undefined : normalized;
  })
  .optional();

const decisionNoteSchema = z
  .string()
  .trim()
  .min(PURCHASE_DECISION_NOTE_MIN, {
    error: "Enter a short decision note.",
  })
  .max(PURCHASE_DECISION_NOTE_MAX, {
    error: "Keep the decision note to 500 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Decision notes must be plain text.",
  })
  .transform(normalizePurchaseText);

const cancelNoteSchema = z
  .string()
  .trim()
  .max(PURCHASE_CANCEL_NOTE_MAX, {
    error: "Keep the cancellation note to 500 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Notes must be plain text.",
  })
  .transform((value) => {
    const normalized = normalizePurchaseText(value);
    return normalized === "" ? undefined : normalized;
  })
  .optional();

export const purchaseCreateSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  category: categorySchema,
  requestedForLocation: locationSchema,
  equipmentItemId: z.string().uuid().optional(),
  estimatedAmountCents: z
    .number()
    .int()
    .min(1)
    .max(PURCHASE_MAX_AMOUNT_CENTS)
    .nullable(),
});

export const purchaseFilterSchema = z.object({
  status: z.enum(PURCHASE_REQUEST_STATUSES).optional(),
  category: z.string().trim().max(PURCHASE_CATEGORY_MAX).optional(),
});

export const purchaseDecisionSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["APPROVED", "DECLINED"]),
  decisionNote: decisionNoteSchema,
});

export const purchaseCancelSchema = z.object({
  requestId: z.string().uuid(),
  decisionNote: cancelNoteSchema,
});

export function parsePurchaseCreate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const amount = parseEstimatedAmountToCents(
    record.estimatedAmount ?? record.estimatedAmountCents,
  );
  if (!amount.ok) {
    return purchaseCreateSchema.safeParse({
      title: firstString(record.title),
      description: firstString(record.description),
      estimatedAmountCents: -1,
    });
  }
  return purchaseCreateSchema.safeParse({
    title: firstString(record.title),
    description: firstString(record.description),
    category: optionalText(record.category),
    requestedForLocation: optionalText(record.requestedForLocation),
    equipmentItemId: optionalText(record.equipmentItemId),
    estimatedAmountCents: amount.cents,
  });
}

export function parsePurchaseFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return purchaseFilterSchema.safeParse({
    status: optionalText(record.status),
    category: optionalText(record.category),
  });
}

export function parsePurchaseDecision(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return purchaseDecisionSchema.safeParse({
    requestId: firstString(record.requestId),
    decision: firstString(record.decision),
    decisionNote: firstString(record.decisionNote),
  });
}

export function parsePurchaseCancel(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return purchaseCancelSchema.safeParse({
    requestId: firstString(record.requestId),
    decisionNote: optionalText(record.decisionNote),
  });
}
