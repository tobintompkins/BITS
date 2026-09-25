import { z } from "zod";

export const VOLUNTEER_WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export type VolunteerWeekday = (typeof VOLUNTEER_WEEKDAYS)[number];

export const VOLUNTEER_WEEKDAY_LABELS: Record<VolunteerWeekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

export const MEMBER_VOLUNTEER_AVAILABILITY_NOTE_MAX = 140;

export const MEMBER_VOLUNTEER_AVAILABILITY_NOTICE =
  "This is your general weekly availability for volunteer planning. Saving it does not guarantee a schedule or assignment. Contact the church office for urgent schedule changes.";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MARKUP_PATTERN = /[<>]|<\/?[a-z]/i;

export type MemberVolunteerAvailabilityDay = {
  weekday: VolunteerWeekday;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
};

export type MemberVolunteerAvailabilityInput = {
  days: MemberVolunteerAvailabilityDay[];
};

export type MemberVolunteerAvailabilityActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  values: MemberVolunteerAvailabilityInput;
  fieldErrors: Partial<Record<VolunteerWeekday, string[]>>;
};

export function emptyVolunteerAvailabilityDays(): MemberVolunteerAvailabilityDay[] {
  return VOLUNTEER_WEEKDAYS.map((weekday) => ({
    weekday,
    isAvailable: false,
    startTime: null,
    endTime: null,
    note: null,
  }));
}

export function createMemberVolunteerAvailabilityActionState(
  values: MemberVolunteerAvailabilityInput,
): MemberVolunteerAvailabilityActionState {
  return {
    status: "idle",
    values,
    fieldErrors: {},
  };
}

export function parseVolunteerAvailabilityFlag(
  value: FormDataEntryValue | null,
) {
  return value === "on" || value === "true";
}

function optionalTime() {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      const text = (value ?? "").trim();
      const withSeconds = text.match(/^([01]\d|2[0-3]):([0-5]\d):[0-5]\d$/);
      return withSeconds ? `${withSeconds[1]}:${withSeconds[2]}` : text || null;
    })
    .refine((value) => value == null || TIME_PATTERN.test(value), {
      error: "Enter a valid start or end time.",
    });
}

function optionalNote() {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (value ?? "").trim())
    .refine(
      (value) => value.length <= MEMBER_VOLUNTEER_AVAILABILITY_NOTE_MAX,
      { error: "Keep the note to 140 characters or fewer." },
    )
    .refine((value) => !MARKUP_PATTERN.test(value), {
      error: "Notes must be plain text.",
    })
    .transform((value) => (value === "" ? null : value));
}

export const memberVolunteerAvailabilityDaySchema = z
  .object({
    weekday: z.enum(VOLUNTEER_WEEKDAYS),
    isAvailable: z.boolean(),
    startTime: optionalTime(),
    endTime: optionalTime(),
    note: optionalNote(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.isAvailable) return;
    if ((data.startTime && !data.endTime) || (!data.startTime && data.endTime)) {
      ctx.addIssue({
        code: "custom",
        message: "Provide both a start and end time, or neither.",
        path: ["endTime"],
      });
      return;
    }
    if (data.startTime && data.endTime && data.startTime >= data.endTime) {
      ctx.addIssue({
        code: "custom",
        message: "End time must be after start time.",
        path: ["endTime"],
      });
    }
  });

export const memberVolunteerAvailabilitySchema = z
  .object({
    days: z.array(memberVolunteerAvailabilityDaySchema).length(7),
  })
  .strict()
  .superRefine((data, ctx) => {
    const weekdays = data.days.map((day) => day.weekday);
    if (new Set(weekdays).size !== 7) {
      ctx.addIssue({
        code: "custom",
        message: "Include each day of the week once.",
        path: ["days"],
      });
      return;
    }
    if (VOLUNTEER_WEEKDAYS.some((weekday, index) => weekdays[index] !== weekday)) {
      ctx.addIssue({
        code: "custom",
        message: "Days must be Monday through Sunday.",
        path: ["days"],
      });
    }
  });

export function normalizeVolunteerAvailabilityDays(
  days: MemberVolunteerAvailabilityDay[],
): MemberVolunteerAvailabilityDay[] {
  return days.map((day) => ({
    weekday: day.weekday,
    isAvailable: day.isAvailable,
    startTime: day.isAvailable ? day.startTime : null,
    endTime: day.isAvailable ? day.endTime : null,
    note: day.note,
  }));
}

export function mergeVolunteerAvailabilityDays(
  rows: MemberVolunteerAvailabilityDay[],
): MemberVolunteerAvailabilityDay[] {
  const byWeekday = new Map(rows.map((row) => [row.weekday, row]));
  return emptyVolunteerAvailabilityDays().map((day) => {
    const row = byWeekday.get(day.weekday);
    if (!row) return day;
    return {
      weekday: day.weekday,
      isAvailable: row.isAvailable,
      startTime: row.isAvailable ? row.startTime : null,
      endTime: row.isAvailable ? row.endTime : null,
      note: row.note,
    };
  });
}

export function collectVolunteerAvailabilityFieldErrors(
  error: z.ZodError,
): Partial<Record<VolunteerWeekday, string[]>> {
  const fieldErrors: Partial<Record<VolunteerWeekday, string[]>> = {};
  for (const issue of error.issues) {
    const dayIndex = issue.path[0] === "days" ? issue.path[1] : undefined;
    if (typeof dayIndex !== "number") continue;
    const weekday = VOLUNTEER_WEEKDAYS[dayIndex];
    if (!weekday) continue;
    const messages = fieldErrors[weekday] ?? [];
    messages.push(issue.message);
    fieldErrors[weekday] = messages;
  }
  return fieldErrors;
}
