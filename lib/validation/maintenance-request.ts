import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";
import { formatVolunteerTimeOffDate } from "@/lib/validation/volunteer-time-off-request";

export const MAINTENANCE_TITLE_MIN = 3;
export const MAINTENANCE_TITLE_MAX = 80;
export const MAINTENANCE_DESCRIPTION_MIN = 10;
export const MAINTENANCE_DESCRIPTION_MAX = 1000;
export const MAINTENANCE_LOCATION_MAX = 80;
export const MAINTENANCE_RESOLUTION_MIN = 5;
export const MAINTENANCE_RESOLUTION_MAX = 500;

export const MAINTENANCE_REQUEST_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type MaintenanceRequestStatus =
  (typeof MAINTENANCE_REQUEST_STATUSES)[number];

export const MAINTENANCE_REQUEST_STATUS_LABELS: Record<
  MaintenanceRequestStatus,
  string
> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const MAINTENANCE_PRIORITIES = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
] as const;

export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

export const MAINTENANCE_PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const MAINTENANCE_REQUESTS_NOTICE =
  "Track church facility and equipment issues from report through completion.";

export const MAINTENANCE_REQUESTS_EMPTY_COPY =
  "No maintenance requests match this view.";

export const MAINTENANCE_REQUESTS_HREF = "/maintenance-requests";
export const EQUIPMENT_INVENTORY_REVALIDATE_HREF = "/equipment";

export const MAINTENANCE_REQUEST_ROW_FIELDS = [
  "id",
  "title",
  "description",
  "locationDescription",
  "equipmentItemId",
  "equipmentName",
  "priority",
  "priorityLabel",
  "status",
  "statusLabel",
  "assignedToName",
  "reportedOnLabel",
  "resolutionNote",
  "resolvedOnLabel",
] as const;

export type MaintenanceRequestRow = {
  id: string;
  title: string;
  description: string;
  locationDescription: string | null;
  equipmentItemId: string | null;
  equipmentName: string | null;
  priority: MaintenancePriority;
  priorityLabel: string;
  status: MaintenanceRequestStatus;
  statusLabel: string;
  assignedToName: string | null;
  reportedOnLabel: string;
  resolutionNote: string | null;
  resolvedOnLabel: string | null;
};

export type MaintenanceRequestCounts = {
  open: number;
  inProgress: number;
  completed: number;
  urgent: number;
};

export type MaintenanceEquipmentOption = {
  id: string;
  label: string;
};

export function formatMaintenanceDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

export function normalizeMaintenanceText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isElevatedPriority(priority: MaintenancePriority) {
  return priority === "HIGH" || priority === "URGENT";
}

export function maintenanceAuditValue(value: string | null | undefined) {
  return value ? "set" : null;
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

const titleSchema = z
  .string()
  .trim()
  .min(MAINTENANCE_TITLE_MIN, { error: "Enter a short issue title." })
  .max(MAINTENANCE_TITLE_MAX, {
    error: "Keep the title to 80 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Titles must be plain text.",
  })
  .transform(normalizeMaintenanceText);

const descriptionSchema = z
  .string()
  .trim()
  .min(MAINTENANCE_DESCRIPTION_MIN, {
    error: "Describe the issue in a little more detail.",
  })
  .max(MAINTENANCE_DESCRIPTION_MAX, {
    error: "Keep the description to 1,000 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Descriptions must be plain text.",
  })
  .transform(normalizeMaintenanceText);

const locationSchema = z
  .string()
  .trim()
  .max(MAINTENANCE_LOCATION_MAX, {
    error: "Keep the location description short.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Locations must be plain text.",
  })
  .transform((value) => {
    const normalized = normalizeMaintenanceText(value);
    return normalized === "" ? undefined : normalized;
  })
  .optional();

const resolutionSchema = z
  .string()
  .trim()
  .min(MAINTENANCE_RESOLUTION_MIN, {
    error: "Enter a short resolution note.",
  })
  .max(MAINTENANCE_RESOLUTION_MAX, {
    error: "Keep the resolution note to 500 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Resolution notes must be plain text.",
  })
  .transform(normalizeMaintenanceText);

const optionalUuid = z.string().uuid().optional();

export const maintenanceCreateSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  locationDescription: locationSchema,
  priority: z.enum(MAINTENANCE_PRIORITIES).default("NORMAL"),
  equipmentItemId: optionalUuid,
});

export const maintenanceUpdateSchema = maintenanceCreateSchema.extend({
  requestId: z.string().uuid(),
});

export const maintenanceStatusChangeSchema = z
  .object({
    requestId: z.string().uuid(),
    status: z.enum(MAINTENANCE_REQUEST_STATUSES),
    resolutionNote: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status !== "COMPLETED" && value.status !== "CANCELLED") return;
    const parsed = resolutionSchema.safeParse(value.resolutionNote ?? "");
    if (parsed.success) return;
    ctx.addIssue({
      code: "custom",
      path: ["resolutionNote"],
      message: "Enter a short resolution note.",
    });
  })
  .transform((value) => {
    const note =
      value.status === "COMPLETED" || value.status === "CANCELLED"
        ? resolutionSchema.parse(value.resolutionNote ?? "")
        : undefined;
    return {
      requestId: value.requestId,
      status: value.status,
      resolutionNote: note,
    };
  });

export const maintenanceFilterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(MAINTENANCE_REQUEST_STATUSES).optional(),
  priority: z.enum(MAINTENANCE_PRIORITIES).optional(),
  equipmentItemId: z.string().uuid().optional(),
});

export function parseMaintenanceCreate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return maintenanceCreateSchema.safeParse({
    title: firstString(record.title),
    description: firstString(record.description),
    locationDescription: optionalText(record.locationDescription),
    priority: optionalText(record.priority) ?? "NORMAL",
    equipmentItemId: optionalText(record.equipmentItemId),
  });
}

export function parseMaintenanceUpdate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return maintenanceUpdateSchema.safeParse({
    requestId: firstString(record.requestId),
    title: firstString(record.title),
    description: firstString(record.description),
    locationDescription: optionalText(record.locationDescription),
    priority: optionalText(record.priority) ?? "NORMAL",
    equipmentItemId: optionalText(record.equipmentItemId),
  });
}

export function parseMaintenanceStatusChange(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return maintenanceStatusChangeSchema.safeParse({
    requestId: firstString(record.requestId),
    status: firstString(record.status),
    resolutionNote: optionalText(record.resolutionNote),
  });
}

export function parseMaintenanceFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return maintenanceFilterSchema.safeParse({
    q: optionalText(record.q),
    status: optionalText(record.status),
    priority: optionalText(record.priority),
    equipmentItemId: optionalText(record.equipmentItemId),
  });
}
