import { z } from "zod";

import { canAccessChildSafetyPickupWorkflow } from "@/lib/auth/child-safety-permissions";

export const CHILD_PICKUP_CHECKOUT_HREF_SUFFIX = "child-check-out";

export const CHILD_PICKUP_CHECKOUT_TITLE = "Verified child check-out";

export const CHILD_PICKUP_CHECKOUT_SAFETY_NOTE =
  "Private staff use only. An emergency contact or household member is not automatically an approved pickup person.";

export const CHILD_PICKUP_CHECKOUT_CONFIRM_LABEL =
  "Confirm verified pickup & check out";

export const CHILD_PICKUP_CHECKOUT_MIN_QUERY = 2;

export const CHILD_PICKUP_VERIFIED_AUDIT_ACTION = "CHILD_PICKUP_VERIFIED_CHECKOUT";

export const CHILD_PICKUP_SEARCH_DTO_FIELDS = [
  "attendanceId",
  "attendeeId",
  "displayLabel",
] as const;

export const CHILD_PICKUP_APPROVAL_DTO_FIELDS = [
  "id",
  "firstName",
  "lastName",
  "relationship",
] as const;

export const CHILD_PICKUP_FORBIDDEN_DTO_FIELDS = [
  "email",
  "phone",
  "dateOfBirth",
  "guardianName",
  "guardianPhone",
  "emergencyContactName",
  "emergencyContactPhone",
  "accommodationRequest",
  "dietaryNotes",
  "internalNotes",
  "notes",
  "memberId",
  "memberName",
  "childName",
  "checkInToken",
  "confirmationCode",
  "photo",
  "allergy",
  "medical",
  "household",
  "organizationId",
] as const;

export type ChildPickupSearchRow = {
  attendanceId: string;
  attendeeId: string;
  displayLabel: string;
};

export type ChildPickupApprovalRow = {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
};

export function canAccessVerifiedChildCheckOut(access: {
  canViewMembers: boolean;
  canEditMembers: boolean;
  canManageCheckIn: boolean;
}) {
  return canAccessChildSafetyPickupWorkflow(access);
}

export function childPickupDisplayLabel(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
) {
  const first = firstName?.trim() ?? "";
  const lastInitial = (lastName?.trim() ?? "").charAt(0);
  if (!first && !lastInitial) return "Checked-in member";
  if (!lastInitial) return first;
  return `${first} ${lastInitial.toUpperCase()}.`;
}

export const childPickupEventIdSchema = z.string().uuid({
  error: "That record was not found.",
});

export const childPickupAttendanceIdSchema = z.string().uuid({
  error: "That record was not found.",
});

export const childPickupApprovalIdSchema = z.string().uuid({
  error: "That record was not found.",
});

export const childPickupSearchQuerySchema = z
  .string()
  .trim()
  .min(CHILD_PICKUP_CHECKOUT_MIN_QUERY, {
    error: "Enter at least two letters to search.",
  })
  .max(80, { error: "Search is too long." });

export const childPickupConfirmSchema = z.object({
  eventId: childPickupEventIdSchema,
  attendanceId: childPickupAttendanceIdSchema,
  approvedPickupId: childPickupApprovalIdSchema,
});

export function childPickupCheckoutOperationKey(
  eventId: string,
  attendanceId: string,
) {
  return `child-pickup-checkout:${eventId}:${attendanceId}`.slice(0, 120);
}

export function buildChildPickupVerifiedAuditChanges(input: {
  eventId: string;
  attendanceId: string;
  verificationId: string;
  alreadyCompleted: boolean;
}) {
  return [
    { field: "record", oldValue: null, newValue: "VERIFIED_CHECKOUT" },
    { field: "eventId", oldValue: null, newValue: input.eventId },
    { field: "attendanceId", oldValue: null, newValue: input.attendanceId },
    { field: "verificationId", oldValue: null, newValue: input.verificationId },
    {
      field: "alreadyCompleted",
      oldValue: null,
      newValue: input.alreadyCompleted ? "true" : "false",
    },
  ];
}

export function childPickupAuditContainsPersonalData(
  payload: unknown,
  personalValues: string[],
) {
  const text = JSON.stringify(payload).toLowerCase();
  return personalValues.some((value) =>
    text.includes(value.trim().toLowerCase()),
  );
}

export function childPickupEventHref(eventId: string) {
  return `/events/${eventId}/${CHILD_PICKUP_CHECKOUT_HREF_SUFFIX}`;
}
