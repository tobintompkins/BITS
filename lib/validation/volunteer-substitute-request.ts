import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";

export const VOLUNTEER_SUBSTITUTE_STATUSES = [
  "OPEN",
  "IN_REVIEW",
  "RESOLVED",
  "DECLINED",
  "CANCELLED",
] as const;

export type VolunteerSubstituteStatus =
  (typeof VOLUNTEER_SUBSTITUTE_STATUSES)[number];

export const VOLUNTEER_SUBSTITUTE_OPEN_STATUSES = ["OPEN", "IN_REVIEW"] as const;
export const STAFF_VOLUNTEER_SUBSTITUTE_REVIEW_STATUSES = [
  "IN_REVIEW",
  "RESOLVED",
  "DECLINED",
] as const;

export const VOLUNTEER_SUBSTITUTE_REASON_MAX = 140;

export const MEMBER_VOLUNTEER_SUBSTITUTE_NOTICE =
  "Your assignment remains scheduled until church leadership confirms a change.";

export const STAFF_VOLUNTEER_SUBSTITUTE_NOTICE =
  "Review substitute requests before changing volunteer assignments. Resolving a request does not assign a substitute or change the scheduled assignment. Update Volunteer Schedules separately when needed.";

export const STAFF_VOLUNTEER_SUBSTITUTE_EMPTY_COPY =
  "No substitute requests match this view.";

export const VOLUNTEER_SUBSTITUTE_STATUS_LABELS: Record<
  VolunteerSubstituteStatus,
  string
> = {
  OPEN: "Open",
  IN_REVIEW: "In review",
  RESOLVED: "Resolved",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
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

const optionalReasonSchema = z
  .string()
  .max(VOLUNTEER_SUBSTITUTE_REASON_MAX, {
    error: "Keep the reason to 140 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Use plain text only. HTML and markup are not allowed.",
  });

export const volunteerSubstituteCreateSchema = z.object({
  assignmentId: z.string().uuid(),
  memberReason: optionalReasonSchema.optional(),
});

export const volunteerSubstituteCancelSchema = z.object({
  requestId: z.string().uuid(),
});

export const staffVolunteerSubstituteReviewSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(STAFF_VOLUNTEER_SUBSTITUTE_REVIEW_STATUSES),
  staffResolutionNote: optionalReasonSchema.optional(),
});

export const staffVolunteerSubstituteFilterSchema = z.object({
  status: z
    .enum([...VOLUNTEER_SUBSTITUTE_STATUSES, ""] as const)
    .optional()
    .transform((value) => (value ? value : null)),
});

export function parseVolunteerSubstituteCreate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const memberReason = optionalText(record.memberReason);
  return volunteerSubstituteCreateSchema.safeParse({
    assignmentId: firstString(record.assignmentId),
    ...(memberReason ? { memberReason } : {}),
  });
}

export function parseVolunteerSubstituteCancel(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return volunteerSubstituteCancelSchema.safeParse({
    requestId: firstString(record.requestId),
  });
}

export function parseStaffVolunteerSubstituteReview(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const staffResolutionNote = optionalText(record.staffResolutionNote);
  return staffVolunteerSubstituteReviewSchema.safeParse({
    requestId: firstString(record.requestId),
    status: firstString(record.status),
    ...(staffResolutionNote ? { staffResolutionNote } : {}),
  });
}

export function parseStaffVolunteerSubstituteFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return staffVolunteerSubstituteFilterSchema.safeParse({
    status: firstString(record.status) ?? "",
  });
}

export function volunteerSubstituteResultMessage(
  status: VolunteerSubstituteStatus,
) {
  if (status === "RESOLVED") {
    return "Church staff recorded a decision. Your assignment remains scheduled until leadership updates it.";
  }
  if (status === "DECLINED") {
    return "Church staff declined this request. Your assignment remains scheduled.";
  }
  if (status === "IN_REVIEW") {
    return "Church staff is reviewing this request.";
  }
  if (status === "CANCELLED") {
    return "You cancelled this request.";
  }
  return null;
}
