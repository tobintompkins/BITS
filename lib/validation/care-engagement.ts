import { z } from "zod";

import {
  attendanceTypeOptions,
  communicationDirectionOptions,
  communicationTypeOptions,
  followUpPriorityOptions,
  followUpStatusOptions,
  followUpTypeOptions,
  pastoralCareCategoryOptions,
  prayerPrivacyLevelOptions,
  prayerRequestStatusOptions,
} from "@/lib/constants/care-engagement";

const attendanceTypes = attendanceTypeOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const followUpTypes = followUpTypeOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const followUpStatuses = followUpStatusOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const followUpPriorities = followUpPriorityOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const pastoralCategories = pastoralCareCategoryOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const prayerStatuses = prayerRequestStatusOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const prayerPrivacy = prayerPrivacyLevelOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const communicationTypes = communicationTypeOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const communicationDirections = communicationDirectionOptions.map(
  (o) => o.value,
) as [string, ...string[]];

function optionalTrimmed() {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (!value || value === "" ? undefined : value));
}

export const attendanceSchema = z
  .object({
    memberId: z.string().uuid("Member is required."),
    attendanceDate: z.string().min(1, "Attendance date is required."),
    serviceName: z.string().trim().min(1, "Service or event name is required."),
    attendanceType: z.enum(attendanceTypes, {
      error: "Attendance type is required.",
    }),
    checkInTime: optionalTrimmed(),
    checkOutTime: optionalTrimmed(),
    notes: optionalTrimmed(),
  })
  .superRefine((data, ctx) => {
    if (data.checkInTime && data.checkOutTime && data.checkOutTime < data.checkInTime) {
      ctx.addIssue({
        code: "custom",
        path: ["checkOutTime"],
        message: "Check-out time cannot be earlier than check-in time.",
      });
    }
  });

export type AttendanceInput = z.infer<typeof attendanceSchema>;

export const followUpSchema = z.object({
  memberId: z.string().uuid("Member is required."),
  followUpType: z.enum(followUpTypes, { error: "Follow-up type is required." }),
  status: z.enum(followUpStatuses).default("OPEN"),
  priority: z.enum(followUpPriorities).default("NORMAL"),
  assignedToUserId: optionalTrimmed(),
  dueDate: optionalTrimmed(),
  subject: z.string().trim().min(1, "Subject is required."),
  notes: optionalTrimmed(),
  outcome: optionalTrimmed(),
});

export type FollowUpInput = z.infer<typeof followUpSchema>;

export const pastoralCareSchema = z.object({
  memberId: z.string().uuid("Member is required."),
  category: z.enum(pastoralCategories, { error: "Category is required." }),
  title: z.string().trim().min(1, "Title is required."),
  note: z.string().trim().min(1, "Note is required."),
  isConfidential: z.boolean().default(false),
  assignedPastorUserId: optionalTrimmed(),
  followUpDate: optionalTrimmed(),
});

export type PastoralCareInput = z.infer<typeof pastoralCareSchema>;

export const prayerRequestSchema = z.object({
  memberId: optionalTrimmed(),
  requesterName: optionalTrimmed(),
  request: z.string().trim().min(1, "Prayer request is required."),
  status: z.enum(prayerStatuses).default("ACTIVE"),
  privacyLevel: z.enum(prayerPrivacy).default("PRAYER_TEAM"),
  assignedToUserId: optionalTrimmed(),
  answerNotes: optionalTrimmed(),
});

export type PrayerRequestInput = z.infer<typeof prayerRequestSchema>;

export const communicationSchema = z
  .object({
    memberId: z.string().uuid("Member is required."),
    communicationType: z.enum(communicationTypes, {
      error: "Communication type is required.",
    }),
    direction: z.enum(communicationDirections, {
      error: "Direction is required.",
    }),
    subject: optionalTrimmed(),
    messageSummary: z.string().trim().min(1, "Message summary is required."),
    communicationDate: z.string().min(1, "Communication date is required."),
    outcome: optionalTrimmed(),
    followUpRequired: z.boolean().default(false),
    followUpDate: optionalTrimmed(),
  })
  .superRefine((data, ctx) => {
    if (data.followUpRequired && !data.followUpDate) {
      ctx.addIssue({
        code: "custom",
        path: ["followUpDate"],
        message: "Follow-up date is required when follow-up is enabled.",
      });
    }
  });

export type CommunicationInput = z.infer<typeof communicationSchema>;

export function buildSafeAuditChanges(
  fields: Record<string, string | null | undefined>,
) {
  return Object.entries(fields).map(([field, newValue]) => ({
    field,
    oldValue: null as string | null,
    newValue: newValue == null ? null : String(newValue),
  }));
}
