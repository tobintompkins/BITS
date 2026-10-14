import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import {
  STAFF_MEMBERSHIP_CONFLICT_COPY,
  STAFF_MEMBERSHIP_INACTIVE_ACCOUNT_COPY,
  STAFF_MEMBERSHIP_LAST_ADMIN_COPY,
  STAFF_MEMBERSHIP_NOT_FOUND_COPY,
  STAFF_MEMBERSHIP_SELF_COPY,
  STAFF_MEMBERSHIP_UNSUPPORTED_COPY,
} from "@/lib/validation/staff-membership-admin";

type Account = {
  id: string;
  clerkUserId: string;
  active: boolean;
};
type Org = { id: string; active: boolean };
type Membership = {
  id: string;
  organizationId: string;
  userAccountId: string;
  roleTypeId: string;
  roleCode: RoleCode;
  active: boolean;
  version: number;
  updatedAt: Date;
};
type AuditRow = {
  action: string;
  entityId: string;
  organizationId: string;
  actorUserAccountId: string | null;
  changes: unknown;
};

const ORG_A = "00000000-0000-4000-8000-00000000a001";
const ORG_B = "00000000-0000-4000-8000-00000000a002";
const ANN = "00000000-0000-4000-8000-00000000c001";
const BLAKE = "00000000-0000-4000-8000-00000000c002";
const CASEY = "00000000-0000-4000-8000-00000000c003";
const DANA = "00000000-0000-4000-8000-00000000c004";
const ANN_MEM_A = "00000000-0000-4000-8000-00000000b001";
const BLAKE_MEM_A = "00000000-0000-4000-8000-00000000b002";
const CASEY_MEM_A = "00000000-0000-4000-8000-00000000b003";
const ANN_MEM_B = "00000000-0000-4000-8000-00000000b011";
const BLAKE_MEM_B = "00000000-0000-4000-8000-00000000b012";
const UPDATED = new Date("2026-09-01T00:00:00.000Z");

const ROLE_IDS: Record<RoleCode, string> = {
  [RoleCode.ORG_ADMIN]: "00000000-0000-4000-8000-00000000d001",
  [RoleCode.TREASURER]: "00000000-0000-4000-8000-00000000d002",
  [RoleCode.DATA_ENTRY]: "00000000-0000-4000-8000-00000000d003",
  [RoleCode.REPORT_VIEWER]: "00000000-0000-4000-8000-00000000d004",
  [RoleCode.DONOR]: "00000000-0000-4000-8000-00000000d005",
};

const store = vi.hoisted(() => ({
  accounts: [] as Account[],
  orgs: [] as Org[],
  memberships: [] as Membership[],
  audits: [] as AuditRow[],
  auditShouldFail: false,
  countOverride: null as number | null,
  roleIds: {
    ORG_ADMIN: "00000000-0000-4000-8000-00000000d001",
    TREASURER: "00000000-0000-4000-8000-00000000d002",
    DATA_ENTRY: "00000000-0000-4000-8000-00000000d003",
    REPORT_VIEWER: "00000000-0000-4000-8000-00000000d004",
    DONOR: "00000000-0000-4000-8000-00000000d005",
  } as Record<string, string>,
}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findPrimaryOrganization: vi.fn(),
}));

const prismaMock = vi.hoisted(() => {
  function cloneStore() {
    return {
      accounts: store.accounts.map((row) => ({ ...row })),
      orgs: store.orgs.map((row) => ({ ...row })),
      memberships: store.memberships.map((row) => ({ ...row })),
      audits: store.audits.map((row) => ({ ...row })),
    };
  }

  function restoreStore(snapshot: ReturnType<typeof cloneStore>) {
    store.accounts = snapshot.accounts;
    store.orgs = snapshot.orgs;
    store.memberships = snapshot.memberships;
    store.audits = snapshot.audits;
  }

  function lockRow(row: Membership) {
    const account = store.accounts.find((item) => item.id === row.userAccountId);
    return {
      id: row.id,
      organizationId: row.organizationId,
      userAccountId: row.userAccountId,
      roleTypeId: row.roleTypeId,
      active: row.active,
      version: row.version,
      updatedAt: row.updatedAt,
      roleCode: row.roleCode,
      userAccountActive: Boolean(account?.active),
    };
  }

  function db() {
    return {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        if (sql.includes("FROM organizations")) {
          const id = String(values[0]);
          const org = store.orgs.find((row) => row.id === id && row.active);
          return org ? [{ id: org.id }] : [];
        }
        if (sql.includes("staff-membership-lock:actor")) {
          const organizationId = String(values[0]);
          const userAccountId = String(values[1]);
          const row = store.memberships.find(
            (item) =>
              item.organizationId === organizationId &&
              item.userAccountId === userAccountId,
          );
          return row ? [lockRow(row)] : [];
        }
        const membershipId = String(values[0]);
        const organizationId = String(values[1]);
        const row = store.memberships.find(
          (item) =>
            item.id === membershipId && item.organizationId === organizationId,
        );
        return row ? [lockRow(row)] : [];
      },
      organizationMembership: {
        count: async ({
          where,
        }: {
          where: {
            organizationId: string;
            active: boolean;
            roleType: { code: RoleCode };
            userAccount: { active: boolean };
          };
        }) => {
          if (store.countOverride !== null) return store.countOverride;
          return store.memberships.filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (row.active !== where.active) return false;
            if (row.roleCode !== where.roleType.code) return false;
            const account = store.accounts.find(
              (item) => item.id === row.userAccountId,
            );
            return Boolean(account?.active);
          }).length;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: {
            id: string;
            organizationId: string;
            version: number;
            updatedAt: Date;
          };
          data: {
            roleTypeId: string;
            active: boolean;
            version: { increment: number };
          };
        }) => {
          const row = store.memberships.find(
            (item) =>
              item.id === where.id &&
              item.organizationId === where.organizationId &&
              item.version === where.version &&
              item.updatedAt.getTime() === where.updatedAt.getTime(),
          );
          if (!row) return { count: 0 };
          const roleCode = (Object.entries(store.roleIds).find(
            ([, id]) => id === data.roleTypeId,
          )?.[0] ?? row.roleCode) as RoleCode;
          row.roleTypeId = data.roleTypeId;
          row.roleCode = roleCode;
          row.active = data.active;
          row.version += data.version.increment;
          row.updatedAt = new Date(row.updatedAt.getTime() + 1);
          return { count: 1 };
        },
      },
      roleType: {
        findUnique: async ({ where }: { where: { code: RoleCode } }) => {
          const id = store.roleIds[where.code];
          return id ? { id, code: where.code } : null;
        },
      },
      auditEvent: {
        create: async ({
          data,
        }: {
          data: {
            action: string;
            entityId: string;
            organizationId: string;
            actorUserAccountId: string | null;
            changeMetadata: { changes: unknown };
          };
        }) => {
          if (store.auditShouldFail) {
            throw new Error("audit write failed");
          }
          store.audits.push({
            action: data.action,
            entityId: data.entityId,
            organizationId: data.organizationId,
            actorUserAccountId: data.actorUserAccountId,
            changes: data.changeMetadata.changes,
          });
          return { id: "audit-1" };
        },
      },
      userAccount: {
        findUnique: async ({ where }: { where: { clerkUserId: string } }) =>
          store.accounts.find((row) => row.clerkUserId === where.clerkUserId) ??
          null,
      },
    };
  }

  return {
    prisma: {
      ...db(),
      $transaction: async (
        fn: (tx: ReturnType<typeof db>) => Promise<unknown>,
      ) => {
        const snapshot = cloneStore();
        try {
          return await fn(db());
        } catch (error) {
          restoreStore(snapshot);
          throw error;
        }
      },
    },
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/db/prisma", () => prismaMock);

import {
  applyStaffMembershipChange,
  updateStaffMembership,
} from "./staff-membership-admin.service";

function account(
  id: string,
  clerkUserId: string,
  active = true,
): Account {
  return { id, clerkUserId, active };
}

function membership(input: Omit<Membership, "roleTypeId" | "version" | "updatedAt"> & Partial<Membership>): Membership {
  return {
    roleTypeId: ROLE_IDS[input.roleCode],
    version: 1,
    updatedAt: UPDATED,
    ...input,
  };
}

function seed() {
  store.accounts = [
    account(ANN, "user_ann"),
    account(BLAKE, "user_blake"),
    account(CASEY, "user_casey"),
    account(DANA, "user_dana"),
  ];
  store.orgs = [
    { id: ORG_A, active: true },
    { id: ORG_B, active: true },
  ];
  store.memberships = [
    membership({
      id: ANN_MEM_A,
      organizationId: ORG_A,
      userAccountId: ANN,
      roleCode: RoleCode.ORG_ADMIN,
      active: true,
    }),
    membership({
      id: BLAKE_MEM_A,
      organizationId: ORG_A,
      userAccountId: BLAKE,
      roleCode: RoleCode.TREASURER,
      active: true,
    }),
    membership({
      id: CASEY_MEM_A,
      organizationId: ORG_A,
      userAccountId: CASEY,
      roleCode: RoleCode.DATA_ENTRY,
      active: false,
    }),
    membership({
      id: ANN_MEM_B,
      organizationId: ORG_B,
      userAccountId: ANN,
      roleCode: RoleCode.ORG_ADMIN,
      active: true,
    }),
    membership({
      id: BLAKE_MEM_B,
      organizationId: ORG_B,
      userAccountId: BLAKE,
      roleCode: RoleCode.TREASURER,
      active: true,
    }),
  ];
  store.audits = [];
  store.auditShouldFail = false;
  store.countOverride = null;
}

function asAnn(orgId = ORG_A) {
  mocks.auth.mockResolvedValue({ userId: "user_ann", orgId: `org_${orgId}` });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: orgId });
}

function change(overrides?: Record<string, unknown>) {
  return {
    membershipId: BLAKE_MEM_A,
    expectedVersion: 1,
    expectedUpdatedAt: UPDATED.toISOString(),
    roleCode: RoleCode.DATA_ENTRY,
    active: true,
    confirm: "on",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  seed();
  asAnn();
});

describe("updateStaffMembership authorization", () => {
  it("denies signed-out users", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    await expect(updateStaffMembership(change())).resolves.toMatchObject({
      ok: false,
      code: "SIGNED_OUT",
    });
    expect(store.audits).toEqual([]);
  });

  it.each([
    ["user_blake", RoleCode.TREASURER],
    ["user_casey", RoleCode.DATA_ENTRY],
    ["user_casey_report", RoleCode.REPORT_VIEWER],
    ["user_dana", RoleCode.DONOR],
  ] as const)("denies %s", async (clerkUserId, roleCode) => {
    if (clerkUserId === "user_casey" || clerkUserId === "user_casey_report") {
      mocks.auth.mockResolvedValue({ userId: "user_casey", orgId: "org_a" });
      store.memberships.find((row) => row.id === CASEY_MEM_A)!.active = true;
      store.memberships.find((row) => row.id === CASEY_MEM_A)!.roleCode = roleCode;
      store.memberships.find((row) => row.id === CASEY_MEM_A)!.roleTypeId =
        ROLE_IDS[roleCode];
      await expect(updateStaffMembership(change())).resolves.toMatchObject({
        ok: false,
        code: "UNAUTHORIZED",
      });
      return;
    }
    if (clerkUserId === "user_dana") {
      store.memberships.push(
        membership({
          id: "00000000-0000-4000-8000-00000000b004",
          organizationId: ORG_A,
          userAccountId: DANA,
          roleCode,
          active: true,
        }),
      );
    }
    mocks.auth.mockResolvedValue({ userId: clerkUserId, orgId: "org_a" });
    await expect(updateStaffMembership(change())).resolves.toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
  });

  it("denies an inactive actor account", async () => {
    store.accounts.find((row) => row.id === ANN)!.active = false;
    await expect(updateStaffMembership(change())).resolves.toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
  });

  it("denies an ambiguous tenant", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(updateStaffMembership(change())).resolves.toMatchObject({
      ok: false,
      code: "NO_ORGANIZATION",
    });
  });

  it("refuses to mutate a donor membership in the same church", async () => {
    store.memberships.push(
      membership({
        id: "00000000-0000-4000-8000-00000000b004",
        organizationId: ORG_A,
        userAccountId: DANA,
        roleCode: RoleCode.DONOR,
        active: true,
      }),
    );
    await expect(
      updateStaffMembership(
        change({
          membershipId: "00000000-0000-4000-8000-00000000b004",
          roleCode: RoleCode.TREASURER,
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "UNSUPPORTED_ROLE",
      message: STAFF_MEMBERSHIP_UNSUPPORTED_COPY,
    });
    expect(
      store.memberships.find(
        (row) => row.id === "00000000-0000-4000-8000-00000000b004",
      )?.roleCode,
    ).toBe(RoleCode.DONOR);
  });

  it("does not reveal a target from another selected church", async () => {
    asAnn(ORG_A);
    const result = await updateStaffMembership(
      change({ membershipId: BLAKE_MEM_B }),
    );
    expect(result).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: STAFF_MEMBERSHIP_NOT_FOUND_COPY,
    });
    expect(store.memberships.find((row) => row.id === BLAKE_MEM_B)?.roleCode).toBe(
      RoleCode.TREASURER,
    );
  });
});

describe("updateStaffMembership edits", () => {
  it("changes another original staff role and writes audit", async () => {
    const result = await updateStaffMembership(change());
    expect(result).toMatchObject({
      ok: true,
      changed: true,
      membershipId: BLAKE_MEM_A,
      version: 2,
      action: "STAFF_MEMBERSHIP_ROLE_CHANGED",
    });
    expect(store.memberships.find((row) => row.id === BLAKE_MEM_A)).toMatchObject({
      roleCode: RoleCode.DATA_ENTRY,
      version: 2,
    });
    expect(store.audits).toEqual([
      expect.objectContaining({
        action: "STAFF_MEMBERSHIP_ROLE_CHANGED",
        entityId: BLAKE_MEM_A,
        organizationId: ORG_A,
        actorUserAccountId: ANN,
        changes: [
          {
            field: "roleCode",
            oldValue: RoleCode.TREASURER,
            newValue: RoleCode.DATA_ENTRY,
          },
        ],
      }),
    ]);
  });

  it("deactivates and reactivates an existing membership", async () => {
    const deactivated = await updateStaffMembership(
      change({ roleCode: RoleCode.TREASURER, active: "false" }),
    );
    expect(deactivated).toMatchObject({
      ok: true,
      action: "STAFF_MEMBERSHIP_DEACTIVATED",
    });
    const blake = store.memberships.find((row) => row.id === BLAKE_MEM_A)!;
    const reactivated = await updateStaffMembership(
      change({
        roleCode: RoleCode.TREASURER,
        active: "true",
        expectedVersion: blake.version,
        expectedUpdatedAt: blake.updatedAt.toISOString(),
      }),
    );
    expect(reactivated).toMatchObject({
      ok: true,
      action: "STAFF_MEMBERSHIP_REACTIVATED",
    });
  });

  it("rejects a missing target and a stale version", async () => {
    await expect(
      updateStaffMembership(
        change({ membershipId: "00000000-0000-4000-8000-00000000b099" }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: STAFF_MEMBERSHIP_NOT_FOUND_COPY,
    });
    await expect(
      updateStaffMembership(change({ expectedVersion: 9 })),
    ).resolves.toEqual({
      ok: false,
      code: "CONFLICT",
      message: STAFF_MEMBERSHIP_CONFLICT_COPY,
    });
  });

  it("does not reactivate when the underlying account is disabled", async () => {
    store.accounts.find((row) => row.id === CASEY)!.active = false;
    const casey = store.memberships.find((row) => row.id === CASEY_MEM_A)!;
    await expect(
      updateStaffMembership(
        change({
          membershipId: CASEY_MEM_A,
          roleCode: RoleCode.DATA_ENTRY,
          expectedVersion: casey.version,
          expectedUpdatedAt: casey.updatedAt.toISOString(),
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "INACTIVE_ACCOUNT",
      message: STAFF_MEMBERSHIP_INACTIVE_ACCOUNT_COPY,
    });
  });

  it("rejects self-demotion and self-deactivation", async () => {
    await expect(
      updateStaffMembership(
        change({
          membershipId: ANN_MEM_A,
          roleCode: RoleCode.TREASURER,
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "SELF",
      message: STAFF_MEMBERSHIP_SELF_COPY,
    });
    await expect(
      updateStaffMembership(
        change({
          membershipId: ANN_MEM_A,
          roleCode: RoleCode.ORG_ADMIN,
          active: "false",
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "SELF",
      message: STAFF_MEMBERSHIP_SELF_COPY,
    });
  });

  it("protects the last usable administrator", async () => {
    store.memberships.find((row) => row.id === BLAKE_MEM_A)!.roleCode =
      RoleCode.ORG_ADMIN;
    store.memberships.find((row) => row.id === BLAKE_MEM_A)!.roleTypeId =
      ROLE_IDS[RoleCode.ORG_ADMIN];
    store.countOverride = 1;
    await expect(
      updateStaffMembership(
        change({ roleCode: RoleCode.TREASURER, membershipId: BLAKE_MEM_A }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "LAST_ADMIN",
      message: STAFF_MEMBERSHIP_LAST_ADMIN_COPY,
    });
    expect(store.memberships.find((row) => row.id === BLAKE_MEM_A)?.roleCode).toBe(
      RoleCode.ORG_ADMIN,
    );
  });

  it("allows a valid two-admin role change", async () => {
    store.memberships.find((row) => row.id === BLAKE_MEM_A)!.roleCode =
      RoleCode.ORG_ADMIN;
    store.memberships.find((row) => row.id === BLAKE_MEM_A)!.roleTypeId =
      ROLE_IDS[RoleCode.ORG_ADMIN];
    const result = await updateStaffMembership(
      change({ roleCode: RoleCode.TREASURER }),
    );
    expect(result).toMatchObject({ ok: true, changed: true, version: 2 });
    expect(store.memberships.find((row) => row.id === ANN_MEM_A)?.roleCode).toBe(
      RoleCode.ORG_ADMIN,
    );
  });

  it("rolls back the write when audit fails", async () => {
    store.auditShouldFail = true;
    await expect(updateStaffMembership(change())).rejects.toThrow(
      "audit write failed",
    );
    expect(store.memberships.find((row) => row.id === BLAKE_MEM_A)).toMatchObject({
      roleCode: RoleCode.TREASURER,
      version: 1,
    });
    expect(store.audits).toEqual([]);
  });

  it("does not write audit for a no-op save", async () => {
    const result = await updateStaffMembership(
      change({ roleCode: RoleCode.TREASURER, active: "true" }),
    );
    expect(result).toMatchObject({
      ok: true,
      changed: false,
      version: 1,
    });
    expect(store.audits).toEqual([]);
  });

  it("advances version even when updatedAt would not change", async () => {
    const first = await updateStaffMembership(change());
    expect(first).toMatchObject({ version: 2 });
    const blake = store.memberships.find((row) => row.id === BLAKE_MEM_A)!;
    const second = await updateStaffMembership(
      change({
        roleCode: RoleCode.REPORT_VIEWER,
        expectedVersion: blake.version,
        expectedUpdatedAt: blake.updatedAt.toISOString(),
      }),
    );
    expect(second).toMatchObject({ version: 3 });
    expect(blake.version).toBe(3);
  });

  it("changes only the intended church membership for the same user", async () => {
    await updateStaffMembership(change());
    expect(store.memberships.find((row) => row.id === BLAKE_MEM_A)?.roleCode).toBe(
      RoleCode.DATA_ENTRY,
    );
    expect(store.memberships.find((row) => row.id === BLAKE_MEM_B)?.roleCode).toBe(
      RoleCode.TREASURER,
    );
    expect(store.memberships.find((row) => row.id === ANN_MEM_B)?.roleCode).toBe(
      RoleCode.ORG_ADMIN,
    );
  });

  it("denies a protected mutation after the actor is demoted", async () => {
    store.memberships.find((row) => row.id === BLAKE_MEM_A)!.roleCode =
      RoleCode.ORG_ADMIN;
    store.memberships.find((row) => row.id === BLAKE_MEM_A)!.roleTypeId =
      ROLE_IDS[RoleCode.ORG_ADMIN];
    const demoted = await updateStaffMembership(
      change({ roleCode: RoleCode.TREASURER, membershipId: BLAKE_MEM_A }),
    );
    expect(demoted).toMatchObject({ ok: true });

    mocks.auth.mockResolvedValue({ userId: "user_blake", orgId: "org_a" });
    mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_A });
    const casey = store.memberships.find((row) => row.id === CASEY_MEM_A)!;
    await expect(
      updateStaffMembership(
        change({
          membershipId: CASEY_MEM_A,
          roleCode: RoleCode.DATA_ENTRY,
          expectedVersion: casey.version,
          expectedUpdatedAt: casey.updatedAt.toISOString(),
        }),
      ),
    ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });
});

describe("applyStaffMembershipChange lock helper", () => {
  it("keeps a documented church-then-actor-then-target lock order", async () => {
    const { STAFF_MEMBERSHIP_ADMIN_LOCK_ORDER } = await import(
      "./staff-membership-admin.service"
    );
    expect(STAFF_MEMBERSHIP_ADMIN_LOCK_ORDER).toEqual([
      "organization",
      "actorMembership",
      "targetMembership",
    ]);
  });

  it("can be invoked inside an already-open transaction", async () => {
    const result = await applyStaffMembershipChange({
      organizationId: ORG_A,
      actorUserAccountId: ANN,
      update: {
        membershipId: BLAKE_MEM_A,
        expectedVersion: 1,
        expectedUpdatedAt: UPDATED.toISOString(),
        roleCode: RoleCode.REPORT_VIEWER,
        active: true,
        confirm: true,
      },
    });
    expect(result).toMatchObject({ ok: true, changed: true, version: 2 });
  });
});
