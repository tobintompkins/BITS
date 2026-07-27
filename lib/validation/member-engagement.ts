import { z } from "zod";

import {
  giftProficiencyLevelOptions,
  memberDocumentTypeOptions,
  memberMinistryRoleOptions,
  memberMinistryStatusOptions,
  membershipMilestoneTypeOptions,
  ministryTypeOptions,
  skillProficiencyLevelOptions,
} from "@/lib/constants/member-engagement";

const milestoneTypes = membershipMilestoneTypeOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const giftLevels = giftProficiencyLevelOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const ministryTypes = ministryTypeOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const ministryRoles = memberMinistryRoleOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const ministryStatuses = memberMinistryStatusOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const skillLevels = skillProficiencyLevelOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const documentTypes = memberDocumentTypeOptions.map((o) => o.value) as [
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

export const memberMilestoneSchema = z.object({
  memberId: z.string().uuid("Member is required."),
  milestoneType: z.enum(milestoneTypes, { error: "Milestone type is required." }),
  title: z.string().trim().min(1, "Title is required."),
  milestoneDate: z.string().min(1, "Milestone date is required."),
  location: optionalTrimmed(),
  officiant: optionalTrimmed(),
  certificateNumber: optionalTrimmed(),
  notes: optionalTrimmed(),
  syncMemberDates: z.boolean().optional().default(false),
});

export const spiritualGiftSchema = z.object({
  name: z.string().trim().min(1, "Gift name is required."),
  description: optionalTrimmed(),
  category: optionalTrimmed(),
  isActive: z.boolean().optional().default(true),
});

export const memberSpiritualGiftSchema = z.object({
  memberId: z.string().uuid("Member is required."),
  spiritualGiftId: z.string().uuid("Spiritual gift is required."),
  proficiencyLevel: z.enum(giftLevels, {
    error: "Proficiency level is required.",
  }),
  isPrimary: z.boolean().optional().default(false),
  notes: optionalTrimmed(),
  identifiedDate: optionalTrimmed(),
});

export const ministrySchema = z.object({
  name: z.string().trim().min(1, "Ministry name is required."),
  description: optionalTrimmed(),
  ministryType: z.enum(ministryTypes, { error: "Ministry type is required." }),
  leaderUserId: optionalUuid(),
  isActive: z.boolean().optional().default(true),
  meetingSchedule: optionalTrimmed(),
  location: optionalTrimmed(),
});

export const memberMinistrySchema = z.object({
  memberId: z.string().uuid("Member is required."),
  ministryId: z.string().uuid("Ministry is required."),
  role: z.enum(ministryRoles, { error: "Role is required." }),
  status: z.enum(ministryStatuses, { error: "Status is required." }),
  joinedDate: optionalTrimmed(),
  endedDate: optionalTrimmed(),
  notes: optionalTrimmed(),
  isLeader: z.boolean().optional().default(false),
});

export const memberSkillSchema = z.object({
  memberId: z.string().uuid("Member is required."),
  skillName: z.string().trim().min(1, "Skill name is required."),
  skillCategory: optionalTrimmed(),
  proficiencyLevel: z.enum(skillLevels, {
    error: "Proficiency level is required.",
  }),
  yearsExperience: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === "") return undefined;
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    })
    .pipe(z.number().int().min(0).max(80).optional()),
  isAvailableToServe: z.boolean().optional().default(false),
  notes: optionalTrimmed(),
});

export const memberInterestSchema = z.object({
  memberId: z.string().uuid("Member is required."),
  interestName: z.string().trim().min(1, "Interest name is required."),
  interestCategory: optionalTrimmed(),
  notes: optionalTrimmed(),
});

export const memberDocumentMetadataSchema = z.object({
  memberId: z.string().uuid("Member is required."),
  documentType: z.enum(documentTypes, { error: "Document type is required." }),
  title: z.string().trim().min(1, "Title is required."),
  description: optionalTrimmed(),
  isConfidential: z.boolean().optional().default(false),
  expirationDate: optionalTrimmed(),
});

export type MemberMilestoneInput = z.infer<typeof memberMilestoneSchema>;
export type SpiritualGiftInput = z.infer<typeof spiritualGiftSchema>;
export type MemberSpiritualGiftInput = z.infer<typeof memberSpiritualGiftSchema>;
export type MinistryInput = z.infer<typeof ministrySchema>;
export type MemberMinistryInput = z.infer<typeof memberMinistrySchema>;
export type MemberSkillInput = z.infer<typeof memberSkillSchema>;
export type MemberInterestInput = z.infer<typeof memberInterestSchema>;
export type MemberDocumentMetadataInput = z.infer<
  typeof memberDocumentMetadataSchema
>;

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
