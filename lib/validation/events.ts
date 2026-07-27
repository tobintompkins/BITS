import { z } from "zod";

import {
  eventOrganizerRoleOptions,
  eventStatusOptions,
  eventVisibilityOptions,
  recurrencePresetOptions,
} from "@/lib/constants/events";
import { buildRRule, validateRecurrenceRule } from "@/lib/events/recurrence";
import type { RecurrencePreset } from "@/lib/events/recurrence";

const statuses = eventStatusOptions.map((o) => o.value) as [string, ...string[]];
const visibilities = eventVisibilityOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const organizerRoles = eventOrganizerRoleOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const presets = recurrencePresetOptions.map((o) => o.value) as [
  string,
  ...string[],
];

function optionalTrimmed() {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (!value || value === "" ? undefined : value));
}

function optionalUuid() {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (!value || value === "" ? undefined : value))
    .pipe(z.string().uuid().optional());
}

export const eventCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(100),
  description: optionalTrimmed(),
  color: optionalTrimmed(),
  icon: optionalTrimmed(),
  isActive: z.boolean().optional().default(true),
});

export const eventLocationSchema = z.object({
  name: z.string().trim().min(1, "Location name is required.").max(120),
  description: optionalTrimmed(),
  address1: optionalTrimmed(),
  address2: optionalTrimmed(),
  city: optionalTrimmed(),
  state: optionalTrimmed(),
  zip: optionalTrimmed(),
  country: optionalTrimmed(),
  roomName: optionalTrimmed(),
  capacity: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === "") return undefined;
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    })
    .pipe(z.number().int().positive().optional()),
  isOnline: z.boolean().optional().default(false),
  onlineMeetingUrl: optionalTrimmed(),
  isActive: z.boolean().optional().default(true),
}).superRefine((data, ctx) => {
  if (data.isOnline && data.onlineMeetingUrl) {
    try {
      const parsed = new URL(data.onlineMeetingUrl);
      if (!parsed.protocol.startsWith("http")) {
        throw new Error("invalid");
      }
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["onlineMeetingUrl"],
        message: "Online meeting URL must be valid.",
      });
    }
  }
});

export const eventOrganizerSchema = z
  .object({
    userId: optionalUuid(),
    memberId: optionalUuid(),
    organizerName: optionalTrimmed(),
    organizerEmail: optionalTrimmed().pipe(z.string().email().optional()),
    organizerPhone: optionalTrimmed(),
    role: z.enum(organizerRoles).default("OTHER"),
    isPrimary: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (!data.userId && !data.memberId && !data.organizerName) {
      ctx.addIssue({
        code: "custom",
        path: ["organizerName"],
        message: "Provide a user, member, or organizer name.",
      });
    }
  });

export const eventSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(200),
    slug: optionalTrimmed(),
    shortDescription: optionalTrimmed().pipe(z.string().max(300).optional()),
    description: optionalTrimmed().pipe(z.string().max(10000).optional()),
    categoryId: optionalUuid(),
    locationId: optionalUuid(),
    eventStatus: z.enum(statuses).default("DRAFT"),
    visibility: z.enum(visibilities).default("STAFF_ONLY"),
    startDate: z.string().min(1, "Start date is required."),
    startTime: optionalTrimmed(),
    endDate: z.string().min(1, "End date is required."),
    endTime: optionalTrimmed(),
    timezone: z.string().trim().min(1, "Timezone is required."),
    isAllDay: z.boolean().optional().default(false),
    registrationRequired: z.boolean().optional().default(false),
    registrationOpenDate: optionalTrimmed(),
    registrationCloseDate: optionalTrimmed(),
    registrationCapacity: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === null || value === "") return undefined;
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      })
      .pipe(z.number().int().positive().optional()),
    waitlistEnabled: z.boolean().optional().default(false),
    registrationFee: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === null || value === "") return undefined;
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      })
      .pipe(z.number().min(0).optional()),
    registrationInstructions: optionalTrimmed(),
    contactName: optionalTrimmed(),
    contactEmail: optionalTrimmed().pipe(z.string().email().optional()),
    contactPhone: optionalTrimmed(),
    isRecurring: z.boolean().optional().default(false),
    recurrencePreset: z.enum(presets).optional().default("NONE"),
    recurrenceByDay: optionalTrimmed(),
    recurrenceInterval: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === null || value === "") return undefined;
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      })
      .pipe(z.number().int().positive().optional()),
    recurrenceEndDate: optionalTrimmed(),
    recurrenceCustomRule: optionalTrimmed(),
    ministryIds: z.array(z.string().uuid()).optional().default([]),
    primaryMinistryId: optionalUuid(),
    organizers: z.array(eventOrganizerSchema).optional().default([]),
    publishNow: z.boolean().optional().default(false),
    recurrenceEditScope: z
      .enum(["THIS_OCCURRENCE", "THIS_AND_FUTURE", "ENTIRE_SERIES"])
      .optional(),
  })
  .superRefine((data, ctx) => {
    const start = combineDateTime(data.startDate, data.isAllDay ? "00:00" : data.startTime);
    const end = combineDateTime(data.endDate, data.isAllDay ? "23:59" : data.endTime);
    if (!start) {
      ctx.addIssue({ code: "custom", path: ["startDate"], message: "Invalid start date/time." });
    }
    if (!end) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Invalid end date/time." });
    }
    if (start && end && end <= start) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End must be after start.",
      });
    }

    if (data.registrationOpenDate && data.registrationCloseDate) {
      const open = new Date(data.registrationOpenDate);
      const close = new Date(data.registrationCloseDate);
      if (close < open) {
        ctx.addIssue({
          code: "custom",
          path: ["registrationCloseDate"],
          message: "Registration close cannot be before open.",
        });
      }
    }

    if (data.isRecurring && data.recurrencePreset !== "NONE") {
      try {
        const rule = buildRRule({
          preset: (data.recurrencePreset ?? "NONE") as RecurrencePreset,
          byDay: data.recurrenceByDay,
          interval: data.recurrenceInterval,
          until: data.recurrenceEndDate ? new Date(data.recurrenceEndDate) : null,
          customRule: data.recurrenceCustomRule,
        });
        const validation = validateRecurrenceRule(rule);
        if (!validation.ok) {
          ctx.addIssue({
            code: "custom",
            path: ["recurrencePreset"],
            message: validation.message,
          });
        }
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: ["recurrencePreset"],
          message: error instanceof Error ? error.message : "Invalid recurrence.",
        });
      }
    }
  });

export type EventInput = z.infer<typeof eventSchema>;
export type EventCategoryInput = z.infer<typeof eventCategorySchema>;
export type EventLocationInput = z.infer<typeof eventLocationSchema>;
export type EventOrganizerInput = z.infer<typeof eventOrganizerSchema>;

export function combineDateTime(date: string, time?: string) {
  if (!date) return null;
  const t = time && time.trim() ? time.trim() : "00:00";
  const value = new Date(`${date}T${t}:00.000Z`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function buildSafeAuditChanges(
  values: Record<string, string | number | boolean | null | undefined>,
) {
  return Object.entries(values).map(([field, newValue]) => ({
    field,
    oldValue: null as string | null,
    newValue:
      newValue === null || newValue === undefined ? null : String(newValue),
  }));
}
