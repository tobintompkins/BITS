import { z } from "zod";

import { RoleCode } from "@/app/generated/prisma/client";
import { formatVolunteerTimeOffDate } from "@/lib/validation/volunteer-time-off-request";

export const STAFF_ACCESS_DIRECTORY_ROLE_CODES = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
  RoleCode.DATA_ENTRY,
  RoleCode.REPORT_VIEWER,
] as const;

export type StaffAccessDirectoryRoleCode =
  (typeof STAFF_ACCESS_DIRECTORY_ROLE_CODES)[number];

export const STAFF_ACCESS_DIRECTORY_FILTERS = ["ACTIVE", "INACTIVE"] as const;

export type StaffAccessDirectoryFilter =
  (typeof STAFF_ACCESS_DIRECTORY_FILTERS)[number];

export const STAFF_ACCESS_DIRECTORY_FILTER_LABELS: Record<
  StaffAccessDirectoryFilter,
  string
> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

export const STAFF_ACCESS_DIRECTORY_STATUS_LABELS: Record<
  StaffAccessDirectoryFilter,
  string
> = STAFF_ACCESS_DIRECTORY_FILTER_LABELS;

export const STAFF_ACCESS_DIRECTORY_NOTICE =
  "This read-only directory lists accounts with access to the Leadership Portal. It does not invite staff, change roles, or reset passwords.";

export const STAFF_ACCESS_DIRECTORY_EMPTY_COPY =
  "No staff or leadership accounts match this view.";

export const STAFF_ACCESS_DIRECTORY_ROW_FIELDS = [
  "displayName",
  "primaryEmail",
  "roleName",
  "roleCode",
  "membershipActive",
  "membershipStatusLabel",
  "createdOnLabel",
  "updatedOnLabel",
] as const;

export type StaffAccessDirectoryRow = {
  displayName: string;
  primaryEmail: string;
  roleName: string;
  roleCode: StaffAccessDirectoryRoleCode;
  membershipActive: boolean;
  membershipStatusLabel: string;
  createdOnLabel: string;
  updatedOnLabel: string;
};

export type StaffAccessDirectoryNavItem = {
  href: string;
  label: string;
};

export function staffAccessDirectoryNavItems(
  canAdministerStaffAccess: boolean,
): StaffAccessDirectoryNavItem[] {
  return canAdministerStaffAccess
    ? [{ href: "/administration/staff-access", label: "Staff Access" }]
    : [];
}

export function formatStaffAccessDirectoryDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function optionalText(value: unknown) {
  const text = firstString(value).trim();
  return text || undefined;
}

export function parseStaffAccessDirectoryFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const status = optionalText(record.status);
  if (!status) {
    return { success: true as const, data: { status: null } };
  }
  const parsed = z.enum(STAFF_ACCESS_DIRECTORY_FILTERS).safeParse(status);
  if (!parsed.success) return { success: false as const };
  return { success: true as const, data: { status: parsed.data } };
}
