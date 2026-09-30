import { getOrganizationAccess } from "@/lib/auth/permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  STAFF_ACCESS_DIRECTORY_ROLE_CODES,
  STAFF_ACCESS_DIRECTORY_STATUS_LABELS,
  formatStaffAccessDirectoryDate,
  parseStaffAccessDirectoryFilter,
  type StaffAccessDirectoryFilter,
  type StaffAccessDirectoryRoleCode,
  type StaffAccessDirectoryRow,
} from "@/lib/validation/staff-access-directory";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type StaffAccessDirectoryView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      filterStatus: StaffAccessDirectoryFilter | null;
      rows: StaffAccessDirectoryRow[];
    };

const membershipSelect = {
  active: true,
  createdAt: true,
  updatedAt: true,
  userAccount: {
    select: {
      displayName: true,
      primaryEmail: true,
    },
  },
  roleType: {
    select: {
      name: true,
      code: true,
    },
  },
} as const;

function isStaffAccessRoleCode(
  code: string,
): code is StaffAccessDirectoryRoleCode {
  return (STAFF_ACCESS_DIRECTORY_ROLE_CODES as readonly string[]).includes(
    code,
  );
}

function toStaffAccessRow(row: {
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  userAccount: { displayName: string | null; primaryEmail: string };
  roleType: { name: string; code: string };
}): StaffAccessDirectoryRow | null {
  if (!isStaffAccessRoleCode(row.roleType.code)) return null;
  const primaryEmail = row.userAccount.primaryEmail.trim();
  const displayName = row.userAccount.displayName?.trim() || primaryEmail;
  const membershipStatusLabel = row.active
    ? STAFF_ACCESS_DIRECTORY_STATUS_LABELS.ACTIVE
    : STAFF_ACCESS_DIRECTORY_STATUS_LABELS.INACTIVE;

  return {
    displayName,
    primaryEmail,
    roleName: row.roleType.name,
    roleCode: row.roleType.code,
    membershipActive: row.active,
    membershipStatusLabel,
    createdOnLabel: formatStaffAccessDirectoryDate(row.createdAt),
    updatedOnLabel: formatStaffAccessDirectoryDate(row.updatedAt),
  };
}

/**
 * Read-only list of current-organization staff/leadership memberships.
 * Client organization fields are ignored.
 */
export async function getStaffAccessDirectory(
  input: unknown = {},
): Promise<StaffAccessDirectoryView> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const access = await getOrganizationAccess(organization.id);
  if (!access.canEdit) return { status: "UNAUTHORIZED" };

  const parsed = parseStaffAccessDirectoryFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };

  const records = await prisma.organizationMembership.findMany({
    where: {
      organizationId: organization.id,
      roleType: {
        code: { in: [...STAFF_ACCESS_DIRECTORY_ROLE_CODES] },
      },
      ...(parsed.data.status === "ACTIVE" ? { active: true } : {}),
      ...(parsed.data.status === "INACTIVE" ? { active: false } : {}),
    },
    orderBy: [
      { userAccount: { primaryEmail: "asc" } },
      { createdAt: "asc" },
    ],
    select: membershipSelect,
  });

  return {
    status: "READY",
    filterStatus: parsed.data.status,
    rows: records.flatMap((row) => {
      const mapped = toStaffAccessRow(row);
      return mapped ? [mapped] : [];
    }),
  };
}
