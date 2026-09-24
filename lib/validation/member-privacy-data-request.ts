import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";

export const memberPrivacyRequestTypeValues = [
  "DATA_COPY",
  "CONTACT_CORRECTION",
  "PRIVACY_QUESTION",
] as const;
export type MemberPrivacyRequestTypeValue =
  (typeof memberPrivacyRequestTypeValues)[number];

export const memberPrivacyRequestOpenStatuses = ["OPEN", "IN_REVIEW"] as const;
export const staffPrivacyRequestStatusValues = [
  "IN_REVIEW",
  "COMPLETED",
  "DECLINED",
] as const;

export const MEMBER_PRIVACY_NOTE_MAX = 500;
export const STAFF_PRIVACY_RESOLUTION_NOTE_MAX = 1000;

const optionalPlainNote = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Note must be ${max} characters or fewer.` })
    .optional()
    .transform((value) => (!value ? undefined : value))
    .refine((value) => value == null || !containsMarkup(value), {
      error: "Use plain text only. HTML and markup are not allowed.",
    });

export const submitMemberPrivacyDataRequestSchema = z.object({
  requestType: z.enum(memberPrivacyRequestTypeValues, {
    error: "Choose a valid request type.",
  }),
  memberNote: optionalPlainNote(MEMBER_PRIVACY_NOTE_MAX),
});

export const updateStaffPrivacyDataRequestSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(staffPrivacyRequestStatusValues, {
    error: "Choose a valid review status.",
  }),
  staffResolutionNote: optionalPlainNote(STAFF_PRIVACY_RESOLUTION_NOTE_MAX),
});

export const memberPrivacyRequestTypeLabels: Record<
  MemberPrivacyRequestTypeValue,
  string
> = {
  DATA_COPY: "Request a copy of my BITS information",
  CONTACT_CORRECTION: "Ask staff to correct my contact details",
  PRIVACY_QUESTION: "Ask a privacy question",
};

export const memberPrivacyRequestStatusLabels: Record<string, string> = {
  OPEN: "Open",
  IN_REVIEW: "In review",
  COMPLETED: "Completed",
  DECLINED: "Declined",
};
