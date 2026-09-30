import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";
import { formatVolunteerTimeOffDate } from "@/lib/validation/volunteer-time-off-request";

export const EQUIPMENT_NAME_MIN = 2;
export const EQUIPMENT_NAME_MAX = 80;
export const EQUIPMENT_CATEGORY_MAX = 40;
export const EQUIPMENT_ASSET_TAG_MAX = 40;
export const EQUIPMENT_STORAGE_LOCATION_MAX = 80;
export const EQUIPMENT_NOTES_MAX = 500;
export const EQUIPMENT_QUANTITY_MIN = 1;
export const EQUIPMENT_QUANTITY_MAX = 9999;

export const EQUIPMENT_STATUSES = [
  "AVAILABLE",
  "IN_USE",
  "MAINTENANCE",
  "RETIRED",
] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  AVAILABLE: "Available",
  IN_USE: "In use",
  MAINTENANCE: "Needs maintenance",
  RETIRED: "Retired",
};

export const EQUIPMENT_CONDITIONS = [
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "NEEDS_SERVICE",
  "OUT_OF_SERVICE",
] as const;

export type EquipmentCondition = (typeof EQUIPMENT_CONDITIONS)[number];

export const EQUIPMENT_CONDITION_LABELS: Record<EquipmentCondition, string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  FAIR: "Fair",
  NEEDS_SERVICE: "Needs service",
  OUT_OF_SERVICE: "Out of service",
};

export const EQUIPMENT_INVENTORY_NOTICE =
  "Keep a simple record of church equipment, where it is stored, and its current condition.";

export const EQUIPMENT_INVENTORY_EMPTY_COPY =
  "No equipment records match this view.";

export const EQUIPMENT_INVENTORY_HREF = "/equipment";

export const EQUIPMENT_INVENTORY_ROW_FIELDS = [
  "id",
  "name",
  "category",
  "assetTag",
  "quantity",
  "storageLocation",
  "status",
  "statusLabel",
  "condition",
  "conditionLabel",
  "notes",
  "archived",
  "updatedOnLabel",
] as const;

export type EquipmentInventoryRow = {
  id: string;
  name: string;
  category: string | null;
  assetTag: string | null;
  quantity: number;
  storageLocation: string | null;
  status: EquipmentStatus;
  statusLabel: string;
  condition: EquipmentCondition;
  conditionLabel: string;
  notes: string | null;
  archived: boolean;
  updatedOnLabel: string;
};

export type EquipmentInventoryCounts = {
  available: number;
  inUse: number;
  maintenance: number;
  retired: number;
};

export function formatEquipmentDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

export function normalizeEquipmentText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isAttentionCondition(condition: EquipmentCondition) {
  return condition === "NEEDS_SERVICE" || condition === "OUT_OF_SERVICE";
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
  .min(EQUIPMENT_NAME_MIN, { error: "Enter an equipment name." })
  .max(EQUIPMENT_NAME_MAX, {
    error: "Keep the name to 80 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Equipment names must be plain text.",
  })
  .transform(normalizeEquipmentText);

const optionalLimited = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { error: message })
    .refine((value) => !containsMarkup(value), {
      error: "Use plain text only.",
    })
    .transform((value) => {
      const normalized = normalizeEquipmentText(value);
      return normalized === "" ? undefined : normalized;
    })
    .optional();

const quantitySchema = z.coerce
  .number()
  .int({ error: "Quantity must be a whole number." })
  .min(EQUIPMENT_QUANTITY_MIN, { error: "Quantity must be at least 1." })
  .max(EQUIPMENT_QUANTITY_MAX, {
    error: "Quantity must be 9,999 or fewer.",
  });

export const equipmentCreateSchema = z.object({
  name: nameSchema,
  category: optionalLimited(EQUIPMENT_CATEGORY_MAX, "Keep the category short."),
  assetTag: optionalLimited(EQUIPMENT_ASSET_TAG_MAX, "Keep the asset tag short."),
  quantity: quantitySchema.default(1),
  storageLocation: optionalLimited(
    EQUIPMENT_STORAGE_LOCATION_MAX,
    "Keep the storage location short.",
  ),
  status: z.enum(EQUIPMENT_STATUSES).default("AVAILABLE"),
  condition: z.enum(EQUIPMENT_CONDITIONS).default("GOOD"),
  notes: optionalLimited(EQUIPMENT_NOTES_MAX, "Keep notes to 500 characters."),
});

export const equipmentUpdateSchema = equipmentCreateSchema.extend({
  equipmentId: z.string().uuid(),
});

export const equipmentIdSchema = z.object({
  equipmentId: z.string().uuid(),
});

export const equipmentFilterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(EQUIPMENT_CATEGORY_MAX).optional(),
  status: z.enum(EQUIPMENT_STATUSES).optional(),
  storageLocation: z
    .string()
    .trim()
    .max(EQUIPMENT_STORAGE_LOCATION_MAX)
    .optional(),
  archived: z.boolean().optional(),
});

export function parseEquipmentCreate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return equipmentCreateSchema.safeParse({
    name: firstString(record.name),
    category: optionalText(record.category),
    assetTag: optionalText(record.assetTag),
    quantity: firstString(record.quantity) ?? record.quantity,
    storageLocation: optionalText(record.storageLocation),
    status: optionalText(record.status) ?? "AVAILABLE",
    condition: optionalText(record.condition) ?? "GOOD",
    notes: optionalText(record.notes),
  });
}

export function parseEquipmentUpdate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return equipmentUpdateSchema.safeParse({
    equipmentId: firstString(record.equipmentId),
    name: firstString(record.name),
    category: optionalText(record.category),
    assetTag: optionalText(record.assetTag),
    quantity: firstString(record.quantity) ?? record.quantity,
    storageLocation: optionalText(record.storageLocation),
    status: optionalText(record.status) ?? "AVAILABLE",
    condition: optionalText(record.condition) ?? "GOOD",
    notes: optionalText(record.notes),
  });
}

export function parseEquipmentId(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return equipmentIdSchema.safeParse({
    equipmentId: firstString(record.equipmentId) ?? firstString(input),
  });
}

export function parseEquipmentFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const archivedRaw = firstString(record.archived);
  return equipmentFilterSchema.safeParse({
    q: optionalText(record.q),
    category: optionalText(record.category),
    status: optionalText(record.status),
    storageLocation: optionalText(record.storageLocation),
    archived: archivedRaw === "1" || archivedRaw === "true" || record.archived === true,
  });
}

export function equipmentAuditValue(value: string | null | undefined) {
  return value ? "set" : null;
}
