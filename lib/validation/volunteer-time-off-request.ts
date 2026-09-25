import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";

export const VOLUNTEER_TIME_OFF_STATUSES = [
  "OPEN",
  "IN_REVIEW",
  "APPROVED",
  "DECLINED",
  "CANCELLED",
] as const;

export type VolunteerTimeOffStatus = (typeof VOLUNTEER_TIME_OFF_STATUSES)[number];

export const VOLUNTEER_TIME_OFF_OPEN_STATUSES = ["OPEN", "IN_REVIEW"] as const;
export const STAFF_VOLUNTEER_TIME_OFF_REVIEW_STATUSES = [
  "IN_REVIEW",
  "APPROVED",
  "DECLINED",
] as const;

export const VOLUNTEER_TIME_OFF_REASON_MAX = 140;
export const VOLUNTEER_TIME_OFF_MAX_SPAN_DAYS = 90;
export const VOLUNTEER_TIME_OFF_MAX_LEAD_DAYS = 365;

export const MEMBER_VOLUNTEER_TIME_OFF_NOTICE =
  "Request dates when you cannot volunteer. Submitting a request does not cancel current assignments. Church staff will review it before changing any schedule.";

export const MEMBER_VOLUNTEER_TIME_OFF_EMPTY_COPY =
  "You have not submitted any volunteer time-off requests yet.";

export const STAFF_VOLUNTEER_TIME_OFF_NOTICE =
  "Review volunteer time-off requests before building or adjusting schedules. Approving a request does not automatically change existing volunteer assignments. Check Volunteer Schedules separately.";

export const STAFF_VOLUNTEER_TIME_OFF_EMPTY_COPY =
  "No volunteer time-off requests match this view.";

export const VOLUNTEER_TIME_OFF_STATUS_LABELS: Record<
  VolunteerTimeOffStatus,
  string
> = {
  OPEN: "Open",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function optionalText(value: unknown) {
  const text = firstString(value)?.trim() ?? "";
  return text === "" ? undefined : text;
}

export function parseDateOnly(value: string | undefined) {
  if (!value || !DATE_ONLY.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function utcToday() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function formatVolunteerTimeOffDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

export function daysBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function volunteerTimeOffResultMessage(status: VolunteerTimeOffStatus) {
  if (status === "APPROVED") {
    return "Church staff approved this request. Existing volunteer assignments are not changed automatically.";
  }
  if (status === "DECLINED") {
    return "Church staff declined this request. Contact the church office if you need more information.";
  }
  if (status === "IN_REVIEW") {
    return "Church staff is reviewing this request.";
  }
  if (status === "CANCELLED") {
    return "You cancelled this request.";
  }
  return null;
}

const optionalReasonSchema = z
  .string()
  .max(VOLUNTEER_TIME_OFF_REASON_MAX, {
    error: "Keep the reason to 140 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Use plain text only. HTML and markup are not allowed.",
  });

export const volunteerTimeOffCreateSchema = z
  .object({
    startDate: z.string(),
    endDate: z.string(),
    memberReason: optionalReasonSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const start = parseDateOnly(value.startDate);
    const end = parseDateOnly(value.endDate);
    if (!start) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Enter a valid start date.",
      });
      return;
    }
    if (!end) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Enter a valid end date.",
      });
      return;
    }
    if (end < start) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date must be on or after the start date.",
      });
    }
    const today = utcToday();
    if (start < today) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Start date cannot be in the past.",
      });
    }
    if (daysBetween(today, start) > VOLUNTEER_TIME_OFF_MAX_LEAD_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Start date must be within the next year.",
      });
    }
    if (daysBetween(start, end) + 1 > VOLUNTEER_TIME_OFF_MAX_SPAN_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Keep the request to 90 days or fewer.",
      });
    }
  });

export const volunteerTimeOffCancelSchema = z.object({
  requestId: z.string().uuid(),
});

export const staffVolunteerTimeOffReviewSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(STAFF_VOLUNTEER_TIME_OFF_REVIEW_STATUSES),
  staffResolutionNote: optionalReasonSchema.optional(),
});

export const staffVolunteerTimeOffFilterSchema = z.object({
  status: z
    .enum([...VOLUNTEER_TIME_OFF_STATUSES, ""] as const)
    .optional()
    .transform((value) => (value ? value : null)),
});

export function parseVolunteerTimeOffCreate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const memberReason = optionalText(record.memberReason);
  return volunteerTimeOffCreateSchema.safeParse({
    startDate: firstString(record.startDate),
    endDate: firstString(record.endDate),
    ...(memberReason ? { memberReason } : {}),
  });
}

export function parseVolunteerTimeOffCancel(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return volunteerTimeOffCancelSchema.safeParse({
    requestId: firstString(record.requestId),
  });
}

export function parseStaffVolunteerTimeOffReview(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const staffResolutionNote = optionalText(record.staffResolutionNote);
  return staffVolunteerTimeOffReviewSchema.safeParse({
    requestId: firstString(record.requestId),
    status: firstString(record.status),
    ...(staffResolutionNote ? { staffResolutionNote } : {}),
  });
}

export function parseStaffVolunteerTimeOffFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return staffVolunteerTimeOffFilterSchema.safeParse({
    status: firstString(record.status) ?? "",
  });
}

export function datesOverlap(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}
