import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import {
  STAFF_ACCESS_DIRECTORY_INVITATION_GAP,
  STAFF_ACCESS_DIRECTORY_PAGE_SIZE,
  STAFF_ACCESS_DIRECTORY_ROW_FIELDS,
  staffAccessDirectoryNavItems,
} from "@/lib/validation/staff-access-directory";

type MembershipRow = {
  id: string;
  organizationId: string;
  userAccountId: string;
  active: boolean;
  userAccountActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  clerkUserId: string;
  displayName: string | null;
  primaryEmail: string;
  roleName: string;
  roleCode: RoleCode;
  publicMetadata: Record<string, unknown>;
  sessionToken: string;
};

const store = vi.hoisted(() => ({
  memberships: [] as MembershipRow[],
  lastWhere: null as unknown,
  lastSelect: null as unknown,
  lastFindFirst: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getOrganizationAccess: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/permissions", () => ({
  getOrganizationAccess: mocks.getOrganizationAccess,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organizationMembership: {
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId: string;
          userAccountId: string;
          active?: boolean;
          roleType?: { code: RoleCode };
        };
      }) => {
        store.lastFindFirst = where;
        return (
          store.memberships.find((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (row.userAccountId !== where.userAccountId) return false;
            if (where.active === true && !row.active) return false;
            if (where.roleType?.code && row.roleCode !== where.roleType.code) {
              return false;
            }
            return true;
          }) ?? null
        );
      },
      count: async ({
        where,
      }: {
        where: {
          organizationId: string;
          active?: boolean;
          roleType?: { code: { in?: string[]; not?: string } };
          AND?: Array<{
            OR: Array<{
              userAccount: {
                displayName?: { contains: string };
                primaryEmail?: { contains: string };
              };
            }>;
          }>;
        };
      }) =>
        store.memberships.filter((row) => matchesWhere(row, where)).length,
      findMany: async ({
        where,
        select,
        skip = 0,
        take = 25,
      }: {
        where: {
          organizationId: string;
          active?: boolean;
          roleType?: { code: { in?: string[]; not?: string } };
          AND?: Array<{
            OR: Array<{
              userAccount: {
                displayName?: { contains: string };
                primaryEmail?: { contains: string };
              };
            }>;
          }>;
        };
        select?: unknown;
        skip?: number;
        take?: number;
      }) => {
        store.lastWhere = where;
        store.lastSelect = select;
        return store.memberships
          .filter((row) => matchesWhere(row, where))
          .sort((a, b) => a.primaryEmail.localeCompare(b.primaryEmail))
          .slice(skip, skip + take)
          .map((row) => ({
            id: row.id,
            userAccountId: row.userAccountId,
            active: row.active,
            version: row.version,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            userAccount: {
              displayName: row.displayName,
              primaryEmail: row.primaryEmail,
              active: row.userAccountActive,
            },
            roleType: {
              name: row.roleName,
              code: row.roleCode,
            },
          }));
      },
    },
  },
}));

function matchesWhere(
  row: MembershipRow,
  where: {
    organizationId: string;
    active?: boolean;
    roleType?: { code: { in?: string[]; not?: string } };
    AND?: Array<{
      OR: Array<{
        userAccount: {
          displayName?: { contains: string };
          primaryEmail?: { contains: string };
        };
      }>;
    }>;
  },
) {
  if (row.organizationId !== where.organizationId) return false;
  if (where.active === true && !row.active) return false;
  if (where.active === false && row.active) return false;
  const allowed = where.roleType?.code.in;
  if (allowed && !allowed.includes(row.roleCode)) return false;
  if (where.roleType?.code.not && row.roleCode === where.roleType.code.not) {
    return false;
  }
  if (where.AND) {
    for (const term of where.AND) {
      const haystack = `${row.displayName ?? ""} ${row.primaryEmail}`.toLowerCase();
      const matched = term.OR.some((clause) => {
        const value =
          clause.userAccount.displayName?.contains ??
          clause.userAccount.primaryEmail?.contains ??
          "";
        return haystack.includes(value.toLowerCase());
      });
      if (!matched) return false;
    }
  }
  return true;
}

import { getStaffAccessDirectory } from "./staff-access-directory.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";

function adminAccess(overrides?: {
  canEdit?: boolean;
  isSuperAdmin?: boolean;
  roleCode?: RoleCode | null;
}) {
  return {
    canEdit: overrides?.canEdit ?? true,
    isReadOnly: !(overrides?.canEdit ?? true),
    roleCode: overrides?.roleCode ?? RoleCode.ORG_ADMIN,
    isSuperAdmin: overrides?.isSuperAdmin ?? false,
  };
}

function membership(
  overrides: Partial<MembershipRow> & Pick<MembershipRow, "id" | "primaryEmail">,
): MembershipRow {
  return {
    organizationId: ORG_ID,
    userAccountId: USER_ID,
    active: true,
    userAccountActive: true,
    version: 1,
    createdAt: new Date("2026-01-15T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    clerkUserId: "user_secret_clerk",
    displayName: "Ann Admin",
    roleName: "Organization Admin",
    roleCode: RoleCode.ORG_ADMIN,
    publicMetadata: { bitsRole: "SUPER_ADMIN", password: "nope" },
    sessionToken: "sess_secret_token",
    ...overrides,
  };
}

function seed() {
  store.memberships = [
    membership({
      id: "00000000-0000-4000-8000-00000000b001",
      primaryEmail: "ann@church.test",
      displayName: "Ann Admin",
    }),
    membership({
      id: "00000000-0000-4000-8000-00000000b002",
      userAccountId: "00000000-0000-4000-8000-00000000c002",
      primaryEmail: "blake@church.test",
      displayName: "Blake Treasurer",
      roleName: "Treasurer",
      roleCode: RoleCode.TREASURER,
      clerkUserId: "user_blake_clerk",
    }),
    membership({
      id: "00000000-0000-4000-8000-00000000b003",
      userAccountId: "00000000-0000-4000-8000-00000000c003",
      primaryEmail: "casey@church.test",
      displayName: null,
      roleName: "Data Entry",
      roleCode: RoleCode.DATA_ENTRY,
      active: false,
      clerkUserId: "user_casey_clerk",
    }),
    membership({
      id: "00000000-0000-4000-8000-00000000b004",
      userAccountId: "00000000-0000-4000-8000-00000000c004",
      primaryEmail: "donor@church.test",
      displayName: "Dana Donor",
      roleName: "Donor",
      roleCode: RoleCode.DONOR,
      clerkUserId: "user_donor_clerk",
    }),
    membership({
      id: "00000000-0000-4000-8000-00000000b005",
      organizationId: OTHER_ORG,
      userAccountId: "00000000-0000-4000-8000-00000000c005",
      primaryEmail: "other@elsewhere.test",
      displayName: "Other Church Admin",
      clerkUserId: "user_other_clerk",
      sessionToken: "sess_other_token",
    }),
  ];
}

beforeEach(() => {
  store.memberships = [];
  store.lastWhere = null;
  store.lastSelect = null;
  store.lastFindFirst = null;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getOrganizationAccess.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: "ann@church.test",
    active: true,
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  mocks.getOrganizationAccess.mockResolvedValue(adminAccess());
  seed();
});

describe("staff access directory navigation", () => {
  it("shows Staff Access only for permitted administrators", () => {
    expect(staffAccessDirectoryNavItems(false)).toEqual([]);
    expect(staffAccessDirectoryNavItems(true)).toEqual([
      { href: "/administration/staff-access", label: "Staff Access" },
    ]);
  });
});

describe("staff access directory", () => {
  it("denies signed-out users without looking up memberships", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getStaffAccessDirectory()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastWhere).toBeNull();
    expect(mocks.getOrganizationAccess).not.toHaveBeenCalled();
  });

  it.each([
    RoleCode.TREASURER,
    RoleCode.DATA_ENTRY,
    RoleCode.REPORT_VIEWER,
    RoleCode.DONOR,
  ])("denies non-admin role %s without listing memberships", async (roleCode) => {
    mocks.getOrganizationAccess.mockResolvedValue(
      adminAccess({ canEdit: false, roleCode, isSuperAdmin: false }),
    );
    await expect(getStaffAccessDirectory()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    expect(store.lastWhere).toBeNull();
  });

  it("lets organization administrators list current-organization staff", async () => {
    const result = await getStaffAccessDirectory();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(mocks.getOrganizationAccess).toHaveBeenCalledWith(ORG_ID);
    expect(result.canMutate).toBe(true);
    expect(result.invitationGapNotice).toBe(STAFF_ACCESS_DIRECTORY_INVITATION_GAP);
    expect(result.rows.map((row) => row.primaryEmail)).toEqual([
      "ann@church.test",
      "blake@church.test",
      "casey@church.test",
    ]);
    expect(result.rows.find((row) => row.primaryEmail === "ann@church.test")?.canManage).toBe(
      false,
    );
    expect(result.rows.find((row) => row.primaryEmail === "blake@church.test")?.canManage).toBe(
      true,
    );
  });

  it("lets super administrators list current-organization staff without using canEdit to mutate", async () => {
    mocks.getOrganizationAccess.mockResolvedValue(
      adminAccess({ canEdit: true, isSuperAdmin: true }),
    );
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: "00000000-0000-4000-8000-00000000c099",
      primaryEmail: "super@church.test",
      active: true,
    });
    const result = await getStaffAccessDirectory();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.rows.some((row) => row.primaryEmail === "ann@church.test")).toBe(
      true,
    );
    expect(result.canMutate).toBe(false);
    expect(result.rows.every((row) => row.canManage === false)).toBe(true);
  });

  it("scopes the list to the current organization and ignores client org ids", async () => {
    const result = await getStaffAccessDirectory({
      organizationId: OTHER_ORG,
    });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastWhere).toMatchObject({
      organizationId: ORG_ID,
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain("other@elsewhere.test");
    expect(json).not.toContain("Other Church Admin");
    expect(json).not.toContain(OTHER_ORG);
  });

  it("validates the active/inactive filter server-side", async () => {
    await expect(
      getStaffAccessDirectory({ status: "ARCHIVED" }),
    ).resolves.toEqual({ status: "INVALID_FILTER" });
    expect(store.lastWhere).toBeNull();

    const active = await getStaffAccessDirectory({ status: "ACTIVE" });
    expect(active.status).toBe("READY");
    if (active.status !== "READY") return;
    expect(store.lastWhere).toMatchObject({
      organizationId: ORG_ID,
      active: true,
    });
    expect(active.filterStatus).toBe("ACTIVE");
    expect(active.rows.map((row) => row.primaryEmail)).toEqual([
      "ann@church.test",
      "blake@church.test",
    ]);

    const inactive = await getStaffAccessDirectory({ status: "INACTIVE" });
    expect(inactive.status).toBe("READY");
    if (inactive.status !== "READY") return;
    expect(store.lastWhere).toMatchObject({
      organizationId: ORG_ID,
      active: false,
    });
    expect(inactive.rows).toEqual([
      expect.objectContaining({
        primaryEmail: "casey@church.test",
        membershipActive: false,
        membershipStatusLabel: "Inactive",
      }),
    ]);
  });

  it("searches name and email with a bounded page size", async () => {
    const result = await getStaffAccessDirectory({ q: "blake", page: "1" });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.query).toBe("blake");
    expect(result.pageSize).toBe(STAFF_ACCESS_DIRECTORY_PAGE_SIZE);
    expect(result.total).toBe(1);
    expect(result.rows.map((row) => row.primaryEmail)).toEqual([
      "blake@church.test",
    ]);
  });

  it("returns only the safe-field allow-list", async () => {
    const result = await getStaffAccessDirectory();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(Object.keys(result.rows[0] ?? {}).sort()).toEqual(
      [...STAFF_ACCESS_DIRECTORY_ROW_FIELDS].sort(),
    );
    expect(result.rows[0]).toEqual({
      membershipId: "00000000-0000-4000-8000-00000000b001",
      displayName: "Ann Admin",
      primaryEmail: "ann@church.test",
      roleName: "Organization Admin",
      roleCode: RoleCode.ORG_ADMIN,
      membershipActive: true,
      membershipStatusLabel: "Active",
      userAccountActive: true,
      version: 1,
      updatedAt: "2026-09-01T00:00:00.000Z",
      createdOnLabel: "Jan 15, 2026",
      updatedOnLabel: "Sep 1, 2026",
      canManage: false,
      isSelf: true,
      managementSupported: true,
      managementNote:
        "Another authorized administrator must change your own membership.",
    });
    expect(result.rows.find((row) => row.primaryEmail === "casey@church.test")).toEqual(
      expect.objectContaining({
        displayName: "casey@church.test",
        roleName: "Data Entry",
        membershipId: "00000000-0000-4000-8000-00000000b003",
      }),
    );
  });

  it("omits Clerk, session, token, and other private fields", async () => {
    const result = await getStaffAccessDirectory();
    expect(result.status).toBe("READY");
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/clerk/i);
    expect(json).not.toMatch(/session/i);
    expect(json).not.toMatch(/token/i);
    expect(json).not.toMatch(/password/i);
    expect(json).not.toMatch(/metadata/i);
    expect(json).not.toContain("user_secret_clerk");
    expect(json).not.toContain("sess_secret_token");
    expect(json).not.toContain(USER_ID);
    expect(json).not.toContain("userAccountId");
    expect(JSON.stringify(store.lastSelect)).not.toMatch(/clerk/i);
  });

  it("returns an empty ready list when no staff memberships exist", async () => {
    store.memberships = [];
    const result = await getStaffAccessDirectory();
    expect(result).toEqual({
      status: "READY",
      filterStatus: null,
      query: "",
      page: 1,
      pageSize: STAFF_ACCESS_DIRECTORY_PAGE_SIZE,
      total: 0,
      canMutate: false,
      invitationGapNotice: STAFF_ACCESS_DIRECTORY_INVITATION_GAP,
      rows: [],
    });
  });
});
