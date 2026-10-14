import { RoleCode } from "@/app/generated/prisma/client";
import { getOrganizationAccess } from "@/lib/auth/permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  STAFF_ACCESS_DIRECTORY_INVITATION_GAP,
  STAFF_ACCESS_DIRECTORY_PAGE_SIZE,
  STAFF_ACCESS_DIRECTORY_STATUS_LABELS,
  formatStaffAccessDirectoryDate,
  isStaffAccessDirectoryRoleCode,
  parseStaffAccessDirectoryQuery,
  type StaffAccessDirectoryFilter,
  type StaffAccessDirectoryRow,
} from "@/lib/validation/staff-access-directory";
import {
  STAFF_MEMBERSHIP_SELF_COPY,
  STAFF_MEMBERSHIP_UNSUPPORTED_COPY,
} from "@/lib/validation/staff-membership-admin";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type StaffAccessDirectoryView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | {
      status: "READY";
      filterStatus: StaffAccessDirectoryFilter | null;
      query: string;
      page: number;
      pageSize: number;
      total: number;
      canMutate: boolean;
      invitationGapNotice: string;
      rows: StaffAccessDirectoryRow[];
    };

const membershipSelect = {
  id: true,
  userAccountId: true,
  active: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  userAccount: {
    select: {
      displayName: true,
      primaryEmail: true,
      active: true,
    },
  },
  roleType: {
    select: {
      name: true,
      code: true,
    },
  },
} as const;

function toStaffAccessRow(
  row: {
    id: string;
    userAccountId: string;
    active: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    userAccount: {
      displayName: string | null;
      primaryEmail: string;
      active: boolean;
    };
    roleType: { name: string; code: string };
  },
  actor: { userAccountId: string; canMutate: boolean },
): StaffAccessDirectoryRow {
  const primaryEmail = row.userAccount.primaryEmail.trim();
  const displayName = row.userAccount.displayName?.trim() || primaryEmail;
  const membershipStatusLabel = row.active
    ? STAFF_ACCESS_DIRECTORY_STATUS_LABELS.ACTIVE
    : STAFF_ACCESS_DIRECTORY_STATUS_LABELS.INACTIVE;
  const managementSupported = isStaffAccessDirectoryRoleCode(row.roleType.code);
  const isSelf = row.userAccountId === actor.userAccountId;
  let managementNote: string | null = null;
  if (!managementSupported) {
    managementNote = STAFF_MEMBERSHIP_UNSUPPORTED_COPY;
  } else if (isSelf) {
    managementNote = STAFF_MEMBERSHIP_SELF_COPY;
  }
  return {
    membershipId: row.id,
    displayName,
    primaryEmail,
    roleName: row.roleType.name,
    roleCode: row.roleType.code,
    membershipActive: row.active,
    membershipStatusLabel,
    userAccountActive: row.userAccount.active,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    createdOnLabel: formatStaffAccessDirectoryDate(row.createdAt),
    updatedOnLabel: formatStaffAccessDirectoryDate(row.updatedAt),
    canManage: actor.canMutate && managementSupported && !isSelf,
    isSelf,
    managementSupported,
    managementNote,
  };
}

/**
 * Current-organization staff/leadership memberships.
 * Client organization fields are ignored. Directory visibility still uses
 * getOrganizationAccess().canEdit; mutation eligibility is a separate
 * active ORG_ADMIN membership check and is never authorized by canEdit.
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

  const parsed = parseStaffAccessDirectoryQuery(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };

  const actorAdminMembership = userAccount.active
    ? await prisma.organizationMembership.findFirst({
        where: {
          organizationId: organization.id,
          userAccountId: userAccount.id,
          active: true,
          roleType: { code: RoleCode.ORG_ADMIN },
        },
        select: { id: true },
      })
    : null;
  const canMutate = Boolean(actorAdminMembership);

  const searchTerms = parsed.data.query.split(/\s+/).filter(Boolean);
  const where = {
    organizationId: organization.id,
    roleType: {
      code: { not: RoleCode.DONOR },
    },
    ...(parsed.data.status === "ACTIVE" ? { active: true } : {}),
    ...(parsed.data.status === "INACTIVE" ? { active: false } : {}),
    ...(searchTerms.length
      ? {
          AND: searchTerms.map((term) => ({
            OR: [
              {
                userAccount: {
                  displayName: { contains: term, mode: "insensitive" as const },
                },
              },
              {
                userAccount: {
                  primaryEmail: { contains: term, mode: "insensitive" as const },
                },
              },
            ],
          })),
        }
      : {}),
  };

  const [total, records] = await Promise.all([
    prisma.organizationMembership.count({ where }),
    prisma.organizationMembership.findMany({
      where,
      orderBy: [
        { userAccount: { primaryEmail: "asc" } },
        { createdAt: "asc" },
        { id: "asc" },
      ],
      skip: (parsed.data.page - 1) * STAFF_ACCESS_DIRECTORY_PAGE_SIZE,
      take: STAFF_ACCESS_DIRECTORY_PAGE_SIZE,
      select: membershipSelect,
    }),
  ]);

  return {
    status: "READY",
    filterStatus: parsed.data.status,
    query: parsed.data.query,
    page: parsed.data.page,
    pageSize: STAFF_ACCESS_DIRECTORY_PAGE_SIZE,
    total,
    canMutate,
    invitationGapNotice: STAFF_ACCESS_DIRECTORY_INVITATION_GAP,
    rows: records.map((row) =>
      toStaffAccessRow(row, { userAccountId: userAccount.id, canMutate }),
    ),
  };
}
