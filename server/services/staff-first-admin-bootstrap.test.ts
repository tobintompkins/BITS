import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";

const ORG = "00000000-0000-4000-8000-00000000a001";
const USER = "user_operator1";

const store = vi.hoisted(() => ({
  org: {
    id: "00000000-0000-4000-8000-00000000a001",
    name: "Northside",
    active: true,
    clerkOrganizationId: "org_a",
  },
  usableAdmins: 0,
  account: null as { id: string; clerkUserId: string; active: boolean } | null,
  membership: null as { id: string; active: boolean } | null,
  created: [] as string[],
}));

const mocks = vi.hoisted(() => ({
  getUserIdentity: vi.fn(),
  getOrganizationMembership: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: {
      findUnique: async () => store.org,
    },
    organizationMembership: {
      count: async () => store.usableAdmins,
      findUnique: async () => store.membership,
      create: async () => {
        store.created.push("membership");
        return { id: "mem-admin" };
      },
    },
    userAccount: {
      findUnique: async () => store.account,
      create: async () => {
        store.created.push("account");
        return { id: "acct-1", clerkUserId: USER, active: true };
      },
    },
    roleType: {
      findUnique: async () => ({ id: "role-admin", code: RoleCode.ORG_ADMIN }),
    },
    $queryRaw: async () => [store.org],
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      organizationMembership: {
        count: async () => store.usableAdmins,
        findUnique: async () => store.membership,
        create: async () => {
          store.created.push("membership");
          return { id: "mem-admin" };
        },
      },
      userAccount: {
        findUnique: async () => store.account,
        create: async () => {
          store.created.push("account");
          return { id: "acct-1", clerkUserId: USER, active: true };
        },
      },
      roleType: {
        findUnique: async () => ({ id: "role-admin", code: RoleCode.ORG_ADMIN }),
      },
      $queryRaw: async () => [store.org],
    }),
  },
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: async () => ({ id: "audit" }),
}));

import { previewOrApplyFirstAdminBootstrap } from "./staff-first-admin-bootstrap";

beforeEach(() => {
  store.usableAdmins = 0;
  store.account = null;
  store.membership = null;
  store.created = [];
  store.org = {
    id: ORG,
    name: "Northside",
    active: true,
    clerkOrganizationId: "org_a",
  };
  mocks.getUserIdentity.mockResolvedValue({
    ok: true,
    clerkUserId: USER,
    verifiedEmails: ["admin@example.test"],
    active: true,
  });
  mocks.getOrganizationMembership.mockResolvedValue({
    ok: true,
    member: true,
    clerkUserId: USER,
    clerkOrganizationId: "org_a",
  });
});

const provider = {
  getUserIdentity: mocks.getUserIdentity,
  getOrganizationMembership: mocks.getOrganizationMembership,
} as never;

describe("first-admin bootstrap", () => {
  it("defaults to dry-run and does not grant", async () => {
    const result = await previewOrApplyFirstAdminBootstrap({
      organizationId: ORG,
      clerkUserId: USER,
      approvalNote: "Independent operator ticket 10",
      provider,
    });
    expect(result).toMatchObject({
      ok: true,
      applied: false,
      wouldGrantRole: "ORG_ADMIN",
    });
    expect(store.created).toEqual([]);
  });

  it("refuses apply without explicit operator authorization", async () => {
    const result = await previewOrApplyFirstAdminBootstrap({
      organizationId: ORG,
      clerkUserId: USER,
      approvalNote: "ticket 10",
      apply: true,
      applyAuthorized: false,
      provider,
    });
    expect(result).toMatchObject({ ok: false, code: "APPLY_NOT_AUTHORIZED" });
    expect(store.created).toEqual([]);
  });

  it("denies existing admin, inactive membership revival, and missing Clerk membership", async () => {
    store.usableAdmins = 1;
    await expect(
      previewOrApplyFirstAdminBootstrap({
        organizationId: ORG,
        clerkUserId: USER,
        approvalNote: "ticket 10",
        provider,
      }),
    ).resolves.toMatchObject({ ok: false, code: "EXISTING_ADMIN" });

    store.usableAdmins = 0;
    store.account = { id: "acct-1", clerkUserId: USER, active: false };
    await expect(
      previewOrApplyFirstAdminBootstrap({
        organizationId: ORG,
        clerkUserId: USER,
        approvalNote: "ticket 10",
        provider,
      }),
    ).resolves.toMatchObject({ ok: false, code: "INACTIVE_ACCOUNT" });

    store.account = { id: "acct-1", clerkUserId: USER, active: true };
    store.membership = { id: "mem-old", active: false };
    await expect(
      previewOrApplyFirstAdminBootstrap({
        organizationId: ORG,
        clerkUserId: USER,
        approvalNote: "ticket 10",
        provider,
      }),
    ).resolves.toMatchObject({ ok: false, code: "EXISTING_MEMBER" });

    store.membership = null;
    mocks.getOrganizationMembership.mockResolvedValue({
      ok: true,
      member: false,
      clerkUserId: USER,
      clerkOrganizationId: "org_a",
    });
    await expect(
      previewOrApplyFirstAdminBootstrap({
        organizationId: ORG,
        clerkUserId: USER,
        approvalNote: "ticket 10",
        provider,
      }),
    ).resolves.toMatchObject({ ok: false, code: "PROVIDER" });
  });
});


it("refuses bootstrap with no verified email, including apply mode", async () => {
  mocks.getUserIdentity.mockResolvedValue({ ok: true, clerkUserId: USER, verifiedEmails: [], active: true });
  expect(await previewOrApplyFirstAdminBootstrap({ organizationId: ORG, clerkUserId: USER, approvalNote: "test approval", apply: true, applyAuthorized: true, provider })).toMatchObject({ ok: false, code: "PROVIDER" });
  expect(store.created).toHaveLength(0);
});
