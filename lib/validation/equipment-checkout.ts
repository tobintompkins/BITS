import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";
import {
  formatVolunteerTimeOffDate,
  parseDateOnly,
  utcToday,
} from "@/lib/validation/volunteer-time-off-request";

export const EQUIPMENT_CHECKOUT_NAME_MIN = 2;
export const EQUIPMENT_CHECKOUT_NAME_MAX = 80;
export const EQUIPMENT_CHECKOUT_PURPOSE_MIN = 5;
export const EQUIPMENT_CHECKOUT_PURPOSE_MAX = 280;
export const EQUIPMENT_CHECKOUT_RETURN_NOTE_MAX = 500;
export const EQUIPMENT_CHECKOUT_QUANTITY_MIN = 1;
export const EQUIPMENT_CHECKOUT_QUANTITY_MAX = 9999;
export const EQUIPMENT_CHECKOUT_DUE_SOON_DAYS = 7;

export const EQUIPMENT_CHECKOUT_VIEWS = ["current", "returned"] as const;
export type EquipmentCheckoutViewFilter =
  (typeof EQUIPMENT_CHECKOUT_VIEWS)[number];

export const EQUIPMENT_CHECKOUT_NOTICE =
  "Track church equipment that is temporarily in use away from its normal storage location.";

export const EQUIPMENT_CHECKOUT_EMPTY_COPY =
  "No equipment check-out records match this view.";

export const EQUIPMENT_CHECKOUT_HREF = "/equipment/check-out";
export const EQUIPMENT_INVENTORY_REVALIDATE_HREF = "/equipment";

export const CHECKOUT_ELIGIBLE_STATUSES = ["AVAILABLE", "IN_USE"] as const;

export const EQUIPMENT_CHECKOUT_ROW_FIELDS = [
  "id",
  "equipmentName",
  "quantity",
  "checkedOutToName",
  "purpose",
  "dueBackLabel",
  "checkedOutOnLabel",
  "returnedOnLabel",
  "returnNote",
  "overdue",
  "dueSoon",
] as const;

export type EquipmentCheckoutRow = {
  id: string;
  equipmentName: string;
  quantity: number;
  checkedOutToName: string;
  purpose: string;
  dueBackLabel: string | null;
  checkedOutOnLabel: string;
  returnedOnLabel: string | null;
  returnNote: string | null;
  overdue: boolean;
  dueSoon: boolean;
};

export type EquipmentCheckoutCounts = {
  currentlyCheckedOut: number;
  dueBackSoon: number;
  overdue: number;
  returnedThisMonth: number;
};

export type EquipmentCheckoutOption = {
  id: string;
  label: string;
  available: number;
};

export function formatEquipmentCheckoutDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

export function normalizeCheckoutText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function startOfUtcMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 86_400_000);
}

export function isCheckoutOverdue(dueBackAt: Date | null, returnedAt: Date | null) {
  if (!dueBackAt || returnedAt) return false;
  return dueBackAt < utcToday();
}

export function isCheckoutDueSoon(dueBackAt: Date | null, returnedAt: Date | null) {
  if (!dueBackAt || returnedAt) return false;
  if (isCheckoutOverdue(dueBackAt, returnedAt)) return false;
  return dueBackAt <= addUtcDays(utcToday(), EQUIPMENT_CHECKOUT_DUE_SOON_DAYS);
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

const nameSchema = z
  .string()
  .trim()
  .min(EQUIPMENT_CHECKOUT_NAME_MIN, {
    error: "Enter who is taking the equipment.",
  })
  .max(EQUIPMENT_CHECKOUT_NAME_MAX, {
    error: "Keep the name to 80 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Names must be plain text.",
  })
  .transform(normalizeCheckoutText);

const purposeSchema = z
  .string()
  .trim()
  .min(EQUIPMENT_CHECKOUT_PURPOSE_MIN, {
    error: "Describe how the equipment will be used.",
  })
  .max(EQUIPMENT_CHECKOUT_PURPOSE_MAX, {
    error: "Keep the purpose to 280 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Purposes must be plain text.",
  })
  .transform(normalizeCheckoutText);

const returnNoteSchema = z
  .string()
  .trim()
  .max(EQUIPMENT_CHECKOUT_RETURN_NOTE_MAX, {
    error: "Keep the return note to 500 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Return notes must be plain text.",
  })
  .transform((value) => {
    const normalized = normalizeCheckoutText(value);
    return normalized === "" ? undefined : normalized;
  })
  .optional();

const quantitySchema = z.coerce
  .number()
  .int()
  .min(EQUIPMENT_CHECKOUT_QUANTITY_MIN, {
    error: "Check out at least one item.",
  })
  .max(EQUIPMENT_CHECKOUT_QUANTITY_MAX, {
    error: "That quantity is too large.",
  });

export const equipmentCheckoutCreateSchema = z.object({
  equipmentItemId: z.string().uuid(),
  quantity: quantitySchema,
  checkedOutToName: nameSchema,
  purpose: purposeSchema,
  dueBackAt: z.date().optional(),
});

export const equipmentCheckoutReturnSchema = z.object({
  checkoutId: z.string().uuid(),
  returnNote: returnNoteSchema,
});

export const equipmentCheckoutFilterSchema = z.object({
  view: z.enum(EQUIPMENT_CHECKOUT_VIEWS).default("current"),
});

export function parseEquipmentCheckoutCreate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const dueBackText = optionalText(record.dueBackAt);
  const dueBackAt = dueBackText ? parseDateOnly(dueBackText) : undefined;
  if (dueBackText && !dueBackAt) {
    return equipmentCheckoutCreateSchema.safeParse({
      equipmentItemId: "invalid",
    });
  }
  return equipmentCheckoutCreateSchema.safeParse({
    equipmentItemId: firstString(record.equipmentItemId),
    quantity: firstString(record.quantity) ?? record.quantity,
    checkedOutToName: firstString(record.checkedOutToName),
    purpose: firstString(record.purpose),
    dueBackAt: dueBackAt ?? undefined,
  });
}

export function parseEquipmentCheckoutReturn(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return equipmentCheckoutReturnSchema.safeParse({
    checkoutId: firstString(record.checkoutId),
    returnNote: optionalText(record.returnNote),
  });
}

export function parseEquipmentCheckoutFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return equipmentCheckoutFilterSchema.safeParse({
    view: optionalText(record.view) ?? "current",
  });
}

export function formatEquipmentAvailabilityLabel(
  name: string,
  available: number,
) {
  const countLabel = available === 1 ? "1 available" : `${available} available`;
  return `${name} — ${countLabel}`;
}
