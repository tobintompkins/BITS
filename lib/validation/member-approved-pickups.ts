import { z } from "zod";

import { canAccessChildSafetyPickupWorkflow } from "@/lib/auth/child-safety-permissions";
import { containsMarkup } from "@/lib/validation/church-announcement";

export { canAccessChildSafetyPickupWorkflow };

export const MEMBER_APPROVED_PICKUP_NAME_MAX = 50;
export const MEMBER_APPROVED_PICKUP_RELATIONSHIP_MAX = 40;

export const MEMBER_APPROVED_PICKUP_SAFETY_NOTE =
  "This private list is for child check-out authorization. An emergency contact is not automatically an approved pickup person.";

export const MEMBER_APPROVED_PICKUP_DTO_FIELDS = [
  "id",
  "firstName",
  "lastName",
  "relationship",
  "isActive",
] as const;

export type MemberApprovedPickupDtoField =
  (typeof MEMBER_APPROVED_PICKUP_DTO_FIELDS)[number];

export const MEMBER_APPROVED_PICKUP_FORBIDDEN_DTO_FIELDS = [
  "email",
  "phone",
  "alternatePhone",
  "address",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "notes",
  "note",
  "medical",
  "allergy",
  "allergies",
  "dateOfBirth",
  "gender",
  "license",
  "licenseNumber",
  "photo",
  "signature",
  "pin",
  "password",
  "custody",
  "legal",
  "memberId",
  "organizationId",
  "childName",
  "memberName",
  "userAccountId",
  "deactivatedByUserId",
] as const;

export const MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS = {
  CREATED: "MEMBER_APPROVED_PICKUP_CREATED",
  UPDATED: "MEMBER_APPROVED_PICKUP_UPDATED",
  DEACTIVATED: "MEMBER_APPROVED_PICKUP_DEACTIVATED",
  REACTIVATED: "MEMBER_APPROVED_PICKUP_REACTIVATED",
  DELETED: "MEMBER_APPROVED_PICKUP_DELETED",
} as const;

export type MemberApprovedPickupAuditAction =
  (typeof MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS)[keyof typeof MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS];

export type MemberApprovedPickupRow = {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  isActive: boolean;
};

export type MemberApprovedPickupFormValues = {
  firstName: string;
  lastName: string;
  relationship: string;
};

export const emptyApprovedPickupFormValues: MemberApprovedPickupFormValues = {
  firstName: "",
  lastName: "",
  relationship: "",
};

export type MemberApprovedPickupActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  pickupId?: string;
  fieldErrors: Partial<Record<keyof MemberApprovedPickupFormValues, string[]>>;
};

export function createApprovedPickupActionState(): MemberApprovedPickupActionState {
  return {
    status: "idle",
    fieldErrors: {},
  };
}

const pickupPlainText = (min: number, max: number, lengthMessage: string) =>
  z
    .string()
    .trim()
    .min(min, { error: lengthMessage })
    .max(max, { error: lengthMessage })
    .refine((value) => !containsMarkup(value), {
      error: "Use plain text only. HTML and markup are not allowed.",
    });

export const approvedPickupWriteSchema = z.object({
  firstName: pickupPlainText(
    1,
    MEMBER_APPROVED_PICKUP_NAME_MAX,
    "First name is required and must be 50 characters or fewer.",
  ),
  lastName: pickupPlainText(
    1,
    MEMBER_APPROVED_PICKUP_NAME_MAX,
    "Last name is required and must be 50 characters or fewer.",
  ),
  relationship: pickupPlainText(
    2,
    MEMBER_APPROVED_PICKUP_RELATIONSHIP_MAX,
    "Relationship is required and must be 2–40 characters.",
  ),
});

export const approvedPickupIdSchema = z.string().uuid({
  error: "That record was not found.",
});

export const approvedPickupMemberIdSchema = z.string().uuid({
  error: "Member was not found.",
});

export type ApprovedPickupWriteInput = z.infer<typeof approvedPickupWriteSchema>;

export function canAccessMemberApprovedPickups(access: {
  canViewMembers: boolean;
  canEditMembers: boolean;
  canManageCheckIn: boolean;
}) {
  return canAccessChildSafetyPickupWorkflow(access);
}

export function approvedPickupIdentityKey(
  firstName: string,
  lastName: string,
  relationship: string,
) {
  return [firstName, lastName, relationship]
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export function toMemberApprovedPickupRow(record: {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  isActive: boolean;
}): MemberApprovedPickupRow {
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    relationship: record.relationship,
    isActive: record.isActive,
  };
}

export function buildApprovedPickupAuditChanges(input: {
  action: keyof typeof MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS;
  isActive?: boolean;
}) {
  const changes: Array<{
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }> = [
    {
      field: "record",
      oldValue: null,
      newValue: input.action,
    },
  ];

  if (typeof input.isActive === "boolean") {
    changes.push({
      field: "isActive",
      oldValue: null,
      newValue: input.isActive ? "true" : "false",
    });
  }

  return changes;
}

export function approvedPickupAuditContainsPersonalData(
  payload: unknown,
  personalValues: string[],
) {
  const text = JSON.stringify(payload).toLowerCase();
  return personalValues.some((value) => text.includes(value.trim().toLowerCase()));
}
