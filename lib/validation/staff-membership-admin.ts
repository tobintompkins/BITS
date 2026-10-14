import { z } from "zod";

import {
  STAFF_ACCESS_DIRECTORY_ROLE_CODES,
  type StaffAccessDirectoryRoleCode,
} from "@/lib/validation/staff-access-directory";

export const STAFF_MEMBERSHIP_ADMIN_ROLE_CODES =
  STAFF_ACCESS_DIRECTORY_ROLE_CODES;

export const STAFF_MEMBERSHIP_CONFIRM_FIELD = "confirm";

export const STAFF_MEMBERSHIP_ROLE_CONFIRM_COPY =
  "I confirm this role change for this existing staff membership.";

export const STAFF_MEMBERSHIP_DEACTIVATE_CONFIRM_COPY =
  "I confirm deactivating this staff membership. They lose Leadership Portal access on their next protected request.";

export const STAFF_MEMBERSHIP_REACTIVATE_CONFIRM_COPY =
  "I confirm reactivating this staff membership.";

export const STAFF_MEMBERSHIP_ADMIN_GRANT_COPY =
  "This grants organization administrator privileges for this church.";

export const STAFF_MEMBERSHIP_SELF_COPY =
  "Another authorized administrator must change your own membership.";

export const STAFF_MEMBERSHIP_UNSUPPORTED_COPY =
  "This role cannot be changed from Staff Access.";

export const STAFF_MEMBERSHIP_LAST_ADMIN_COPY =
  "This church must keep at least one usable organization administrator.";

export const STAFF_MEMBERSHIP_INACTIVE_ACCOUNT_COPY =
  "This membership cannot be reactivated because the underlying account is disabled.";

export const STAFF_MEMBERSHIP_CONFLICT_COPY =
  "This membership was updated by someone else. Refresh and try again.";

export const STAFF_MEMBERSHIP_NOT_FOUND_COPY =
  "That staff membership is not available in this church.";

export type StaffMembershipAdminRoleCode = StaffAccessDirectoryRoleCode;

export type StaffMembershipActionState = {
  message: string;
  ok?: boolean;
};

export const staffMembershipUpdateSchema = z.object({
  membershipId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  expectedUpdatedAt: z.string().datetime(),
  roleCode: z.enum(STAFF_MEMBERSHIP_ADMIN_ROLE_CODES),
  active: z.boolean(),
  confirm: z.literal(true, {
    error: "Confirm this change before continuing.",
  }),
});

export type StaffMembershipUpdateInput = z.infer<
  typeof staffMembershipUpdateSchema
>;

export function staffMembershipFormFromUnknown(
  raw: unknown,
): Record<string, unknown> {
  const data =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const activeValue = data.active;
  return {
    membershipId: String(data.membershipId ?? ""),
    expectedVersion: data.expectedVersion,
    expectedUpdatedAt: String(data.expectedUpdatedAt ?? ""),
    roleCode: String(data.roleCode ?? ""),
    active:
      activeValue === true ||
      activeValue === "true" ||
      activeValue === "ACTIVE" ||
      activeValue === "on",
    confirm: data.confirm === true || data.confirm === "on",
  };
}

export function staffMembershipRoleIsManaged(code: string) {
  return (STAFF_MEMBERSHIP_ADMIN_ROLE_CODES as readonly string[]).includes(
    code,
  );
}

export function intendedStaffMembershipSummary(input: {
  currentRole: string;
  currentActive: boolean;
  nextRole: string;
  nextActive: boolean;
}) {
  const roleChanged = input.currentRole !== input.nextRole;
  const statusChanged = input.currentActive !== input.nextActive;
  const parts: string[] = [];
  if (roleChanged) {
    parts.push(`role ${input.currentRole} to ${input.nextRole}`);
  }
  if (statusChanged) {
    parts.push(
      input.nextActive
        ? "status Inactive to Active"
        : "status Active to Inactive",
    );
  }
  return parts.length ? `Change ${parts.join(" and ")}.` : "No change.";
}
