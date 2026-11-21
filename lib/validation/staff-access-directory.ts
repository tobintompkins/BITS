import { z } from "zod";

import { formatVolunteerTimeOffDate } from "@/lib/validation/volunteer-time-off-request";

export const STAFF_ACCESS_DIRECTORY_ROLE_CODES = [
  "ORG_ADMIN",
  "TREASURER",
  "DATA_ENTRY",
  "REPORT_VIEWER",
] as const;

export type StaffAccessDirectoryRoleCode =
  (typeof STAFF_ACCESS_DIRECTORY_ROLE_CODES)[number];

export const STAFF_ACCESS_DIRECTORY_ROLE_LABELS: Record<
  StaffAccessDirectoryRoleCode,
  string
> = {
  ORG_ADMIN: "Organization Admin",
  TREASURER: "Treasurer",
  DATA_ENTRY: "Data Entry",
  REPORT_VIEWER: "Report Viewer",
};

export const STAFF_ACCESS_DIRECTORY_FILTERS = ["ACTIVE", "INACTIVE"] as const;

export type StaffAccessDirectoryFilter =
  (typeof STAFF_ACCESS_DIRECTORY_FILTERS)[number];

export const STAFF_ACCESS_DIRECTORY_FILTER_LABELS: Record<
  StaffAccessDirectoryFilter,
  string
> = {
  ACTIVE: "Active",
  INACTIVE: "Closed",
};

export const STAFF_ACCESS_DIRECTORY_STATUS_LABELS: Record<
  StaffAccessDirectoryFilter,
  string
> = STAFF_ACCESS_DIRECTORY_FILTER_LABELS;

export const STAFF_ACCESS_DIRECTORY_PAGE_SIZE = 25;
export const STAFF_ACCESS_DIRECTORY_QUERY_MAX = 100;

export const STAFF_ACCESS_DIRECTORY_NOTICE =
  "Invite people and choose their access from this page. Basic user means they can sign in and use personal features, with no staff access. Suspended means this church is closed to them until you restore it. Removing a person ends their access to this church only and keeps their sign-in, giving records, statements, and audit history.";

export const STAFF_ACCESS_DIRECTORY_INVITATION_GAP =
  "First-administrator bootstrap remains a restricted operator tool. A church without an authorized administrator cannot be repaired from this page.";

export const STAFF_ACCESS_DIRECTORY_EMPTY_COPY =
  "No staff or leadership accounts match this view.";

export const STAFF_ACCESS_DIRECTORY_ROW_FIELDS = [
  "membershipId",
  "displayName",
  "primaryEmail",
  "roleName",
  "roleCode",
  "membershipActive",
  "membershipStatusLabel",
  "userAccountActive",
  "version",
  "updatedAt",
  "createdOnLabel",
  "updatedOnLabel",
  "canManage",
  "isSelf",
  "managementSupported",
  "managementNote",
] as const;

export type StaffAccessDirectoryRow = {
  membershipId: string;
  displayName: string;
  primaryEmail: string;
  roleName: string;
  roleCode: string;
  membershipActive: boolean;
  membershipStatusLabel: string;
  userAccountActive: boolean;
  version: number;
  updatedAt: string;
  createdOnLabel: string;
  updatedOnLabel: string;
  canManage: boolean;
  isSelf: boolean;
  managementSupported: boolean;
  managementNote: string | null;
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

export function isStaffAccessDirectoryRoleCode(
  code: string,
): code is StaffAccessDirectoryRoleCode {
  return (STAFF_ACCESS_DIRECTORY_ROLE_CODES as readonly string[]).includes(code);
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

export function parseStaffAccessDirectoryQuery(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const filter = parseStaffAccessDirectoryFilter(record);
  if (!filter.success) return { success: false as const };

  const query = firstString(record.q).trim().slice(0, STAFF_ACCESS_DIRECTORY_QUERY_MAX);
  const rawPage = firstString(record.page) || record.page;
  const parsedPage = Number(rawPage ?? 1);
  const page = Number.isSafeInteger(parsedPage)
    ? Math.max(1, Math.min(100000, parsedPage))
    : 1;

  return {
    success: true as const,
    data: {
      status: filter.data.status,
      query,
      page,
    },
  };
}
