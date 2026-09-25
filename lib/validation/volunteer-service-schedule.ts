import { z } from "zod";

export const VOLUNTEER_SERVICE_ROLE_LABEL_MAX = 60;
export const VOLUNTEER_SERVICE_NOTE_MAX = 140;

export const MEMBER_VOLUNTEER_SCHEDULE_NOTICE =
  "These are your upcoming volunteer assignments for church events. Contact the church office if a time no longer works.";

export const MEMBER_VOLUNTEER_SCHEDULE_EMPTY_COPY =
  "You do not have any upcoming volunteer assignments yet.";

export const STAFF_VOLUNTEER_SCHEDULE_NOTICE =
  "Create simple volunteer assignments for upcoming church events. This is not a public roster and does not send reminders.";

export const STAFF_VOLUNTEER_SCHEDULE_CONFLICT_NOTICE =
  "BITS checks approved time off and overlapping scheduled assignments before saving.";

export const STAFF_VOLUNTEER_SCHEDULE_EMPTY_COPY =
  "No volunteer assignments have been scheduled for upcoming events.";

export const VOLUNTEER_SCHEDULE_TIME_OFF_CONFLICT_MESSAGE =
  "This volunteer has approved time off for this date";

export const VOLUNTEER_SCHEDULE_OVERLAP_CONFLICT_MESSAGE =
  "This volunteer already has an overlapping service assignment.";

const MARKUP_PATTERN = /[<>]|<\/?[a-z]/i;

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function optionalText(value: unknown) {
  const text = firstString(value)?.trim() ?? "";
  return text === "" ? undefined : text;
}

const roleLabelSchema = z
  .string()
  .min(2, { error: "Enter a short assignment label." })
  .max(VOLUNTEER_SERVICE_ROLE_LABEL_MAX, {
    error: "Keep the assignment label to 60 characters or fewer.",
  })
  .refine((value) => !MARKUP_PATTERN.test(value), {
    error: "Assignment labels must be plain text.",
  });

const optionalNoteSchema = z
  .string()
  .max(VOLUNTEER_SERVICE_NOTE_MAX, {
    error: "Keep the note to 140 characters or fewer.",
  })
  .refine((value) => !MARKUP_PATTERN.test(value), {
    error: "Notes must be plain text.",
  });

export const volunteerServiceAssignmentCreateSchema = z.object({
  eventId: z.string().uuid(),
  memberId: z.string().uuid(),
  ministryId: z.string().uuid().optional(),
  roleLabel: roleLabelSchema,
  staffNote: optionalNoteSchema.optional(),
});

export const volunteerServiceAssignmentCancelSchema = z.object({
  assignmentId: z.string().uuid(),
  cancellationNote: optionalNoteSchema.optional(),
});

export function parseVolunteerServiceAssignmentCreate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const ministryId = optionalText(record.ministryId);
  const staffNote = optionalText(record.staffNote);
  return volunteerServiceAssignmentCreateSchema.safeParse({
    eventId: firstString(record.eventId),
    memberId: firstString(record.memberId),
    roleLabel: firstString(record.roleLabel)?.trim(),
    ...(ministryId ? { ministryId } : {}),
    ...(staffNote ? { staffNote } : {}),
  });
}

export function parseVolunteerServiceAssignmentCancel(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const cancellationNote = optionalText(record.cancellationNote);
  return volunteerServiceAssignmentCancelSchema.safeParse({
    assignmentId: firstString(record.assignmentId),
    ...(cancellationNote ? { cancellationNote } : {}),
  });
}

export function normalizeVolunteerRoleLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function volunteerRoleKey(value: string) {
  return normalizeVolunteerRoleLabel(value).toLowerCase();
}

export const MEMBER_VOLUNTEER_SCHEDULE_ROW_FIELDS = [
  "assignmentId",
  "eventTitle",
  "startsAtLabel",
  "location",
  "ministryName",
  "roleLabel",
] as const;

export type MemberVolunteerScheduleRow = {
  assignmentId: string;
  eventTitle: string;
  startsAtLabel: string;
  location: string | null;
  ministryName: string | null;
  roleLabel: string;
};

export function formatVolunteerEventWhen(input: {
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
}) {
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: input.timezone,
  });
  if (input.isAllDay) {
    const start = dateFmt.format(input.startDateTime);
    const end = dateFmt.format(input.endDateTime);
    return start === end ? start : `${start} – ${end}`;
  }
  const start = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: input.timezone,
  }).format(input.startDateTime);
  const endTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: input.timezone,
  }).format(input.endDateTime);
  return `${start} – ${endTime}`;
}

export type VolunteerEventTiming = {
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
};

function eventTimeZone(timezone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "UTC";
  }
}

export function eventLocalDateKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: eventTimeZone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function nextUtcDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${String(next.getUTCFullYear()).padStart(4, "0")}-${String(
    next.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function eventLocalServiceDates(event: VolunteerEventTiming) {
  const start = eventLocalDateKey(event.startDateTime, event.timezone);
  const end = eventLocalDateKey(event.endDateTime, event.timezone);
  const last = end < start ? start : end;
  const dates = [start];
  if (!event.isAllDay) return dates;
  let current = start;
  while (current < last) {
    current = nextUtcDateKey(current);
    dates.push(current);
  }
  return dates;
}

export function approvedTimeOffCoversEvent(
  startDate: Date,
  endDate: Date,
  event: VolunteerEventTiming,
) {
  return eventLocalServiceDates(event).some((dateKey) => {
    const day = new Date(`${dateKey}T00:00:00.000Z`);
    return startDate <= day && day <= endDate;
  });
}

export function volunteerEventsConflict(
  left: VolunteerEventTiming,
  right: VolunteerEventTiming,
) {
  if (left.isAllDay || right.isAllDay) {
    const rightDates = new Set(eventLocalServiceDates({ ...right, isAllDay: true }));
    return eventLocalServiceDates({ ...left, isAllDay: true }).some((date) =>
      rightDates.has(date),
    );
  }
  return (
    left.startDateTime < right.endDateTime &&
    right.startDateTime < left.endDateTime
  );
}

export function publicVolunteerLocationText(
  location: {
    name: string;
    roomName: string | null;
    isOnline: boolean;
    city: string | null;
    state: string | null;
  } | null,
) {
  if (!location) return null;
  const cityLine = [location.city, location.state]
    .filter((part) => part?.trim())
    .join(", ");
  const parts = [
    location.name,
    location.roomName,
    cityLine,
    location.isOnline ? "Online" : null,
  ].filter((part) => part?.trim());
  return parts.join(" · ") || null;
}
