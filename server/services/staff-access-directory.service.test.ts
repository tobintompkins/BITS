import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import {
  STAFF_ACCESS_DIRECTORY_ROW_FIELDS,
  staffAccessDirectoryNavItems,
} from "@/lib/validation/staff-access-directory";

type MembershipRow = {
  id: string;
  organizationId: string;
  userAccountId: string;
  active: boolean;
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
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          active?: boolean;
          roleType?: { code: { in: string[] } };
        };
        select?: unknown;
      }) => {
        store.lastWhere = where;
        store.lastSelect = select;
        return store.memberships
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.active === true && !row.active) return false;
            if (where.active === false && row.active) return false;
            const allowed = where.roleType?.code.in;
            if (allowed && !allowed.includes(row.roleCode)) return false;
            return true;
          })
          .map((row) => ({
            active: row.active,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            userAccount: {
              displayName: row.displayName,
              primaryEmail: row.primaryEmail,
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
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getOrganizationAccess.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: "ann@church.test",
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
    expect(result.rows.map((row) => row.primaryEmail)).toEqual([
      "ann@church.test",
      "blake@church.test",
      "casey@church.test",
    ]);
  });

  it("lets super administrators list current-organization staff", async () => {
    mocks.getOrganizationAccess.mockResolvedValue(
      adminAccess({ canEdit: true, isSuperAdmin: true }),
    );
    const result = await getStaffAccessDirectory();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.rows.some((row) => row.primaryEmail === "ann@church.test")).toBe(
      true,
    );
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

  it("returns only the safe-field allow-list", async () => {
    const result = await getStaffAccessDirectory();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(Object.keys(result.rows[0] ?? {}).sort()).toEqual(
      [...STAFF_ACCESS_DIRECTORY_ROW_FIELDS].sort(),
    );
    expect(result.rows[0]).toEqual({
      displayName: "Ann Admin",
      primaryEmail: "ann@church.test",
      roleName: "Organization Admin",
      roleCode: RoleCode.ORG_ADMIN,
      membershipActive: true,
      membershipStatusLabel: "Active",
      createdOnLabel: "Jan 15, 2026",
      updatedOnLabel: "Sep 1, 2026",
    });
    expect(result.rows.find((row) => row.primaryEmail === "casey@church.test")).toEqual(
      expect.objectContaining({
        displayName: "casey@church.test",
        roleName: "Data Entry",
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
    expect(JSON.stringify(store.lastSelect)).not.toMatch(/clerk/i);
    expect(JSON.stringify(store.lastSelect)).not.toContain("userAccountId");
  });

  it("returns an empty ready list when no staff memberships exist", async () => {
    store.memberships = [];
    const result = await getStaffAccessDirectory();
    expect(result).toEqual({
      status: "READY",
      filterStatus: null,
      rows: [],
    });
  });
});
