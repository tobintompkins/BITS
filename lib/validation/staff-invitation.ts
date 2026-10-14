import { z } from "zod";

import {
  STAFF_ACCESS_DIRECTORY_ROLE_CODES,
  STAFF_ACCESS_DIRECTORY_ROLE_LABELS,
  type StaffAccessDirectoryRoleCode,
} from "@/lib/validation/staff-access-directory";

export const STAFF_INVITATION_ROLE_CODES = STAFF_ACCESS_DIRECTORY_ROLE_CODES;

export type StaffInvitationRoleCode = StaffAccessDirectoryRoleCode;

export const STAFF_INVITATION_ROLE_LABELS = STAFF_ACCESS_DIRECTORY_ROLE_LABELS;

export const STAFF_INVITATION_PAGE_SIZE = 25;
export const STAFF_INVITATION_QUERY_MAX = 100;
export const STAFF_INVITATION_EXPIRES_DAYS = 14;

export const STAFF_INVITATION_PENDING_STATUSES = [
  "AUTHORIZED",
  "SENT",
  "FAILED",
  "UNKNOWN",
] as const;

export const STAFF_INVITATION_HISTORY_STATUSES = [
  "REVOKED",
  "ACCEPTED",
  "EXPIRED",
] as const;

export const STAFF_INVITATION_FILTERS = ["PENDING", "HISTORY"] as const;

export type StaffInvitationFilter = (typeof STAFF_INVITATION_FILTERS)[number];

export const STAFF_INVITATION_FILTER_LABELS: Record<StaffInvitationFilter, string> =
  {
    PENDING: "Pending",
    HISTORY: "History",
  };

export const STAFF_INVITATION_STATUS_LABELS: Record<string, string> = {
  AUTHORIZED: "Authorized, not yet sent",
  SENT: "Sent to provider",
  FAILED: "Provider failed",
  UNKNOWN: "Provider result unknown",
  REVOKED: "Revoked",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
};

export const STAFF_INVITATION_CONFIRM_COPY =
  "I confirm inviting this person to this church with the selected staff role.";

export const STAFF_INVITATION_ADMIN_CONFIRM_COPY =
  "I confirm granting organization administrator privileges to this invited person.";

export const STAFF_INVITATION_REAPPROVE_COPY =
  "The original inviter is no longer an authorized administrator. I reapprove this invitation.";

export const STAFF_INVITATION_EXISTING_MEMBER_COPY =
  "That person already has a staff membership in this church. Use the existing membership controls instead of inviting again.";

export const STAFF_INVITATION_DUPLICATE_COPY =
  "An active invitation already exists for that email in this church.";

export const STAFF_INVITATION_DONOR_COPY =
  "Donor accounts are not invited from Staff Access.";

export const STAFF_INVITATION_NOT_FOUND_COPY =
  "That staff invitation is not available in this church.";

export const STAFF_INVITATION_CONFLICT_COPY =
  "This invitation was updated by someone else. Refresh and try again.";

export const STAFF_INVITATION_SCHEMA_COPY =
  "Invitation storage is not enabled on this database yet. Apply the checked-in staff invitation migration on a verified target before using these controls.";

export const STAFF_INVITATION_ACCEPT_DENIED_COPY =
  "This invitation cannot be accepted. Sign in with the invited email and complete the authorized staff onboarding step.";

export const STAFF_INVITATION_ACCEPT_SUCCESS_COPY =
  "Staff access is now assigned for this church. Use the Leadership Portal with the approved role.";

export const STAFF_INVITATION_ACCEPT_PENDING_COPY =
  "You are signed in, but staff access is not assigned until you accept an authorized invitation for this church.";

export type StaffInvitationActionState = {
  message: string;
  ok?: boolean;
};

export function normalizeStaffInvitationEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function staffInvitationEmailDisplay(value: string) {
  return value.trim();
}

export const staffInvitationCreateSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter the recipient email.")
    .max(254)
    .email("Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
  emailDisplay: z.string().trim().min(1).max(254),
  roleCode: z.enum(STAFF_INVITATION_ROLE_CODES),
  confirm: z.literal(true, {
    error: "Confirm this invitation before continuing.",
  }),
  confirmAdmin: z.boolean(),
});

export const staffInvitationRetrySchema = z.object({
  invitationId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  confirm: z.literal(true, {
    error: "Confirm this retry before continuing.",
  }),
  reapprove: z.boolean(),
});

export const staffInvitationRevokeSchema = z.object({
  invitationId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  confirm: z.literal(true, {
    error: "Confirm revocation before continuing.",
  }),
});

export const staffInvitationAcceptSchema = z.object({
  invitationId: z.string().uuid(),
  confirm: z.literal(true, {
    error: "Confirm acceptance before continuing.",
  }),
});

function asRecord(raw: unknown) {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export function staffInvitationCreateFormFromUnknown(raw: unknown) {
  const data = asRecord(raw);
  const emailDisplay = staffInvitationEmailDisplay(String(data.email ?? ""));
  return {
    email: normalizeStaffInvitationEmail(emailDisplay),
    emailDisplay,
    roleCode: String(data.roleCode ?? ""),
    confirm: data.confirm === true || data.confirm === "on",
    confirmAdmin: data.confirmAdmin === true || data.confirmAdmin === "on",
  };
}

export function staffInvitationRetryFormFromUnknown(raw: unknown) {
  const data = asRecord(raw);
  return {
    invitationId: String(data.invitationId ?? ""),
    expectedVersion: data.expectedVersion,
    confirm: data.confirm === true || data.confirm === "on",
    reapprove: data.reapprove === true || data.reapprove === "on",
  };
}

export function staffInvitationRevokeFormFromUnknown(raw: unknown) {
  const data = asRecord(raw);
  return {
    invitationId: String(data.invitationId ?? ""),
    expectedVersion: data.expectedVersion,
    confirm: data.confirm === true || data.confirm === "on",
  };
}

export function staffInvitationAcceptFormFromUnknown(raw: unknown) {
  const data = asRecord(raw);
  return {
    invitationId: String(data.invitationId ?? ""),
    confirm: data.confirm === true || data.confirm === "on",
  };
}

export function parseStaffInvitationDirectoryQuery(input: unknown) {
  const record = asRecord(input);
  const filterRaw = firstString(record.invitations).trim().toUpperCase();
  const filter = filterRaw
    ? z.enum(STAFF_INVITATION_FILTERS).safeParse(filterRaw)
    : { success: true as const, data: "PENDING" as const };
  if (!filter.success) return { success: false as const };

  const query = firstString(record.iq).trim().slice(0, STAFF_INVITATION_QUERY_MAX);
  const rawPage = firstString(record.ipage) || record.ipage;
  const parsedPage = Number(rawPage ?? 1);
  const page = Number.isSafeInteger(parsedPage)
    ? Math.max(1, Math.min(100000, parsedPage))
    : 1;

  return {
    success: true as const,
    data: {
      filter: filter.data,
      query,
      page,
    },
  };
}

export function intendedStaffInvitationSummary(input: {
  email: string;
  churchName: string;
  roleCode: string;
}) {
  const role =
    STAFF_INVITATION_ROLE_LABELS[
      input.roleCode as StaffInvitationRoleCode
    ] ?? input.roleCode;
  return `Invite ${input.email} to ${input.churchName} as ${role}.`;
}
