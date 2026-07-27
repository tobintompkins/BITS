import { z } from "zod";

import {
  archiveReasonOptions,
  consentChangeSourceOptions,
  memberRecordStatusOptions,
  preferredContactMethodOptions,
} from "@/lib/constants/member-lifecycle";

const recordStatuses = memberRecordStatusOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const contactMethods = preferredContactMethodOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const consentSources = consentChangeSourceOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const archiveReasons = archiveReasonOptions.map((o) => o.value) as [
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

export const archiveMemberSchema = z.object({
  memberId: z.string().uuid(),
  archiveReason: z.enum(archiveReasons, { error: "Archive reason is required." }),
  archiveDate: optionalTrimmed(),
  notes: optionalTrimmed(),
});

export const restoreMemberSchema = z.object({
  memberId: z.string().uuid(),
  restoreToStatus: z.enum(["ACTIVE", "INACTIVE"] as const),
});

export const markDeceasedSchema = z.object({
  memberId: z.string().uuid(),
  deceasedDate: z.string().min(1, "Deceased date is required."),
  deceasedNotes: optionalTrimmed(),
  confirmCommunicationRemoval: z.boolean(),
  confirmDirectoryRemoval: z.boolean(),
});

export const markInactiveSchema = z.object({
  memberId: z.string().uuid(),
  reason: optionalTrimmed(),
});

export const communicationPreferencesSchema = z.object({
  memberId: z.string().uuid(),
  preferredContactMethod: z.enum(contactMethods).optional().nullable(),
  allowEmail: z.boolean(),
  allowSms: z.boolean(),
  allowPhoneCalls: z.boolean(),
  allowPostalMail: z.boolean(),
  allowDirectoryListing: z.boolean(),
  allowPhotoUse: z.boolean(),
  source: z.enum(consentSources).default("STAFF_UPDATE"),
  notes: optionalTrimmed(),
});

export const executeMergeSchema = z.object({
  primaryMemberId: z.string().uuid(),
  duplicateMemberId: z.string().uuid(),
  fieldSelections: z.record(z.string(), z.string()),
  confirmationPhrase: z.literal("MERGE", {
    error: 'Type MERGE to confirm.',
  }),
  mergeReason: optionalTrimmed(),
  confirmArchivedPrimary: z.boolean().optional(),
});

export const recordStatusFilterSchema = z.enum(recordStatuses).optional();

export type ArchiveMemberInput = z.infer<typeof archiveMemberSchema>;
export type RestoreMemberInput = z.infer<typeof restoreMemberSchema>;
export type MarkDeceasedInput = z.infer<typeof markDeceasedSchema>;
export type CommunicationPreferencesInput = z.infer<
  typeof communicationPreferencesSchema
>;
export type ExecuteMergeInput = z.infer<typeof executeMergeSchema>;

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
