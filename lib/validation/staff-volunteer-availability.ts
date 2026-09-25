import { z } from "zod";

import {
  VOLUNTEER_WEEKDAY_LABELS,
  VOLUNTEER_WEEKDAYS,
  type VolunteerWeekday,
} from "@/lib/validation/member-volunteer-availability";

export const STAFF_VOLUNTEER_AVAILABILITY_NOTICE =
  "This is a read-only planning view of volunteer-stated weekly availability. It is not a schedule and does not include personal contact details.";

export const STAFF_VOLUNTEER_AVAILABILITY_EMPTY_COPY =
  "No volunteer availability has been shared yet.";

export const STAFF_VOLUNTEER_AVAILABILITY_FILTER_EMPTY_COPY =
  "No volunteers match these filters.";

export const STAFF_VOLUNTEER_AVAILABILITY_ROW_FIELDS = [
  "memberName",
  "ministryNames",
  "weekday",
  "weekdayLabel",
  "isAvailable",
  "startTime",
  "endTime",
  "note",
] as const;

export type StaffVolunteerAvailabilityRowField =
  (typeof STAFF_VOLUNTEER_AVAILABILITY_ROW_FIELDS)[number];

export type StaffVolunteerAvailabilityRow = {
  memberName: string;
  ministryNames: string[];
  weekday: VolunteerWeekday;
  weekdayLabel: string;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
};

export type StaffVolunteerAvailabilityMinistryOption = {
  id: string;
  name: string;
};

export type StaffVolunteerAvailabilityFilters = {
  weekday: VolunteerWeekday | null;
  ministryId: string | null;
};

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

const optionalWeekday = z
  .union([z.enum(VOLUNTEER_WEEKDAYS), z.literal(""), z.null(), z.undefined()])
  .transform((value) => (value ? value : null));

const optionalMinistryId = z
  .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => (value ? value : null));

export const staffVolunteerAvailabilityFilterSchema = z
  .object({
    weekday: optionalWeekday,
    ministryId: optionalMinistryId,
  })
  .strict();

export function parseStaffVolunteerAvailabilityFilters(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  return staffVolunteerAvailabilityFilterSchema.safeParse({
    weekday: firstString(record.weekday),
    ministryId: firstString(record.ministryId),
  });
}

export function weekdayLabel(weekday: VolunteerWeekday) {
  return VOLUNTEER_WEEKDAY_LABELS[weekday];
}

export function formatStaffAvailabilityTime(
  isAvailable: boolean,
  startTime: string | null,
  endTime: string | null,
) {
  if (!isAvailable) return "—";
  if (!startTime && !endTime) return "All day";
  if (startTime && endTime) return `${startTime}–${endTime}`;
  return startTime ?? endTime ?? "—";
}

export function isStaffVolunteerAvailabilityRow(
  value: unknown,
): value is StaffVolunteerAvailabilityRow {
  if (!value || typeof value !== "object") return false;
  const keys = Object.keys(value).sort();
  const allowed = [...STAFF_VOLUNTEER_AVAILABILITY_ROW_FIELDS].sort();
  return keys.length === allowed.length && keys.every((key, index) => key === allowed[index]);
}
