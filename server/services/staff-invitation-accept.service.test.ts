import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode, StaffInvitationStatus } from "@/app/generated/prisma/client";
import { STAFF_INVITATION_ACCEPT_DENIED_COPY } from "@/lib/validation/staff-invitation";

function applyVersionIncrement(
  row: { version: number },
  version: unknown,
) {
  if (version && typeof version === "object" && "increment" in version) {
    row.version += Number((version as { increment: number }).increment);
  }
}

const ORG_A = "00000000-0000-4000-8000-00000000a001";
const ORG_B = "00000000-0000-4000-8000-00000000a002";
const ANN = "00000000-0000-4000-8000-00000000c001";
const PAT = "00000000-0000-4000-8000-00000000c010";
const INVITE = "00000000-0000-4000-8000-00000000e001";
const ROLE_TREASURER = "00000000-0000-4000-8000-00000000d002";

type Invitation = {
  id: string;
  organizationId: string;
  emailNormalized: string;
  emailDisplay: string;
  roleCode: RoleCode;
  invitedByUserAccountId: string;
  status: StaffInvitationStatus;
  version: number;
  clerkInvitationId: string | null;
  clerkOrganizationId: string;
  expiresAt: Date;
  acceptedUserAccountId: string | null;
  reapprovedByUserAccountId: string | null;
  activeEmailKey: string | null;
};

const store = vi.hoisted(() => ({
  invitations: [] as Invitation[],
  memberships: [] as Array<{
    id: string;
    organizationId: string;
    userAccountId: string;
    roleCode: RoleCode;
    active: boolean;
  }>,
  audits: [] as Array<{ action: string; entityId: string }>,
  orgs: [
    {
      id: "00000000-0000-4000-8000-00000000a001",
      active: true,
      clerkOrganizationId: "org_a",
    },
  ],
}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  providerMembership: vi.fn(),
  consumeConflict: false,
}));

const prismaMock = vi.hoisted(() => {
  function db() {
    return {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        if (sql.includes("FROM organizations")) {
          const id = String(values[0]);
          return store.orgs.filter((row) => row.id === id);
        }
        const invitation = store.invitations.find((row) => row.id === String(values[0]));
        return invitation ? [{ ...invitation }] : [];
      },
      organizationMembership: {
        findUnique: async ({
          where,
        }: {
          where: {
            organizationId_userAccountId: {
              organizationId: string;
              userAccountId: string;
            };
          };
        }) => {
          const row = store.memberships.find(
            (item) =>
              item.organizationId ===
                where.organizationId_userAccountId.organizationId &&
              item.userAccountId ===
                where.organizationId_userAccountId.userAccountId,
          );
          return row
            ? { ...row, roleType: { code: row.roleCode } }
            : null;
        },
        count: async ({
          where,
        }: {
          where: { organizationId: string; userAccountId: string };
        }) =>
          store.memberships.filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.userAccountId === where.userAccountId &&
              row.active &&
              row.roleCode === RoleCode.ORG_ADMIN,
          ).length,
        create: async ({
          data,
        }: {
          data: {
            organizationId: string;
            userAccountId: string;
            roleTypeId: string;
            active: boolean;
          };
        }) => {
          const created = {
            id: "mem-pat",
            organizationId: data.organizationId,
            userAccountId: data.userAccountId,
            roleCode: RoleCode.TREASURER,
            active: true,
          };
          store.memberships.push(created);
          return created;
        },
      },
      roleType: {
        findUnique: async () => ({ id: ROLE_TREASURER, code: RoleCode.TREASURER }),
      },
      staffInvitation: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const row = store.invitations.find((item) => item.id === where.id);
          if (!row) return null;
          return {
            ...row,
            organization: {
              id: row.organizationId,
              name: "Northside",
              displayName: "Northside",
              active: true,
              clerkOrganizationId: row.clerkOrganizationId,
            },
          };
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<Invitation> & {
            version?: unknown;
          };
        }) => {
          const row = store.invitations.find((item) => item.id === where.id);
          if (!row) return null;
          Object.assign(row, data);
          applyVersionIncrement(row, data.version);
          return row;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; version: number };
          data: Partial<Invitation> & {
            version?: unknown;
          };
        }) => {
          const row = store.invitations.find(
            (item) => item.id === where.id && item.version === where.version,
          );
          if (!row || mocks.consumeConflict) return { count: 0 };
          Object.assign(row, data);
          applyVersionIncrement(row, data.version);
          return { count: 1 };
        },
      },
    };
  }
  return {
    ...db(),
    $transaction: async (fn: (tx: ReturnType<typeof db>) => Promise<unknown>) => {
      const snapshot = structuredClone({ invitations: store.invitations, memberships: store.memberships, audits: store.audits });
      try { return await fn(db()); } catch (error) {
        Object.assign(store, snapshot);
        throw error;
      }
    },
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: async (input: { action: string; entityId: string }) => {
    store.audits.push(input);
    return { id: "audit-1" };
  },
}));

vi.mock("@/server/services/staff-invitation-provider", () => ({
  getStaffInvitationProvider: () => ({
    getOrganizationMembership: mocks.providerMembership,
  }),
}));

import { acceptStaffInvitation, previewStaffInvitationAcceptance } from "./staff-invitation-accept.service";

function seedInvitation(overrides: Partial<Invitation> = {}) {
  store.invitations = [
    {
      id: INVITE,
      organizationId: ORG_A,
      emailNormalized: "pat@church.test",
      emailDisplay: "pat@church.test",
      roleCode: RoleCode.TREASURER,
      invitedByUserAccountId: ANN,
      status: StaffInvitationStatus.SENT,
      version: 1,
      clerkInvitationId: "orginv_1",
      clerkOrganizationId: "org_a",
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      acceptedUserAccountId: null,
      reapprovedByUserAccountId: null,
      activeEmailKey: "pat@church.test",
      ...overrides,
    },
  ];
  store.memberships = [
    {
      id: "mem-ann",
      organizationId: ORG_A,
      userAccountId: ANN,
      roleCode: RoleCode.ORG_ADMIN,
      active: true,
    },
  ];
  store.audits = [];
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.consumeConflict = false;
  seedInvitation();
  mocks.auth.mockResolvedValue({ userId: "user_pat" });
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: PAT,
    clerkUserId: "user_pat",
    primaryEmail: "pat@church.test",
    active: true,
  });
  mocks.currentUser.mockResolvedValue({
    primaryEmailAddress: {
      emailAddress: "pat@church.test",
      verification: { status: "verified" },
    },
    emailAddresses: [],
  });
  mocks.providerMembership.mockResolvedValue({
    ok: true,
    member: true,
    clerkUserId: "user_pat",
    clerkOrganizationId: "org_a",
  });
});

describe("acceptStaffInvitation", () => {
  it("denies forged ids, unverified email, and wrong-org provider evidence", async () => {
    await expect(
      acceptStaffInvitation({
        invitationId: "00000000-0000-4000-8000-00000000e099",
        confirm: "on",
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: STAFF_INVITATION_ACCEPT_DENIED_COPY,
    });

    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: "pat@church.test",
        verification: { status: "unverified" },
      },
      emailAddresses: [],
    });
    await expect(
      acceptStaffInvitation({ invitationId: INVITE, confirm: "on" }),
    ).resolves.toMatchObject({ ok: false, code: "DENIED" });

    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: "other@church.test",
        verification: { status: "verified" },
      },
      emailAddresses: [],
    });
    await expect(
      acceptStaffInvitation({ invitationId: INVITE, confirm: "on" }),
    ).resolves.toMatchObject({ ok: false, code: "DENIED" });

    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: "pat@church.test",
        verification: { status: "verified" },
      },
      emailAddresses: [],
    });
    mocks.providerMembership.mockResolvedValue({
      ok: true,
      member: false,
      clerkUserId: "user_pat",
      clerkOrganizationId: "org_a",
    });
    await expect(
      acceptStaffInvitation({ invitationId: INVITE, confirm: "on" }),
    ).resolves.toMatchObject({ ok: false, code: "DENIED" });
    expect(store.memberships).toHaveLength(1);
  });

  it("creates the approved BITS role once and replays safely", async () => {
    const first = await acceptStaffInvitation({
      invitationId: INVITE,
      confirm: "on",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.alreadyAccepted).toBe(false);
    expect(first.roleCode).toBe(RoleCode.TREASURER);
    expect(store.invitations[0]?.status).toBe(StaffInvitationStatus.ACCEPTED);
    expect(store.audits).toHaveLength(1);

    const replay = await acceptStaffInvitation({
      invitationId: INVITE,
      confirm: "on",
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.alreadyAccepted).toBe(true);
    expect(store.memberships.filter((row) => row.userAccountId === PAT)).toHaveLength(
      1,
    );
    expect(store.audits).toHaveLength(1);
  });

  it("does not grant after revoke, expiration, or inviter loss, and preserves another church", async () => {
    seedInvitation({ status: StaffInvitationStatus.REVOKED, activeEmailKey: null });
    await expect(
      acceptStaffInvitation({ invitationId: INVITE, confirm: "on" }),
    ).resolves.toMatchObject({ ok: false, code: "DENIED" });

    seedInvitation({ expiresAt: new Date("2020-01-01T00:00:00.000Z") });
    await expect(
      acceptStaffInvitation({ invitationId: INVITE, confirm: "on" }),
    ).resolves.toMatchObject({ ok: false, code: "DENIED" });
    expect(store.invitations[0]?.status).toBe(StaffInvitationStatus.EXPIRED);

    seedInvitation();
    store.memberships = [];
    await expect(
      acceptStaffInvitation({ invitationId: INVITE, confirm: "on" }),
    ).resolves.toMatchObject({ ok: false, code: "DENIED" });

    seedInvitation();
    store.memberships.push({
      id: "mem-pat-b",
      organizationId: ORG_B,
      userAccountId: PAT,
      roleCode: RoleCode.TREASURER,
      active: true,
    });
    const accepted = await acceptStaffInvitation({
      invitationId: INVITE,
      confirm: "on",
    });
    expect(accepted.ok).toBe(true);
    expect(
      store.memberships.filter((row) => row.organizationId === ORG_B),
    ).toHaveLength(1);
  });

  it("rejects a disabled account and an existing inactive membership", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: PAT,
      clerkUserId: "user_pat",
      primaryEmail: "pat@church.test",
      active: false,
    });
    await expect(
      acceptStaffInvitation({ invitationId: INVITE, confirm: "on" }),
    ).resolves.toMatchObject({ ok: false, code: "INACTIVE_ACCOUNT" });

    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: PAT,
      clerkUserId: "user_pat",
      primaryEmail: "pat@church.test",
      active: true,
    });
    store.memberships.push({
      id: "mem-pat-inactive",
      organizationId: ORG_A,
      userAccountId: PAT,
      roleCode: RoleCode.DATA_ENTRY,
      active: false,
    });
    await expect(
      acceptStaffInvitation({ invitationId: INVITE, confirm: "on" }),
    ).resolves.toMatchObject({ ok: false, code: "EXISTING_MEMBER" });
  });
});


describe("invitation preview privacy", () => {
  it("does not expose a recipient or church to an unrelated verified user", async () => {
    mocks.currentUser.mockResolvedValue({ emailAddresses: [{ emailAddress: "other@example.test", verification: { status: "verified" } }] });
    const result = await previewStaffInvitationAcceptance({ invitationId: INVITE });
    expect(result).toEqual({ status: "DENIED", message: STAFF_INVITATION_ACCEPT_DENIED_COPY });
    expect(result).not.toHaveProperty("email");
  });
  it("shows a pending invitation to its verified recipient", async () => {
    expect(await previewStaffInvitationAcceptance({ invitationId: INVITE })).toMatchObject({ status: "READY", email: "pat@church.test" });
  });
  it("rejects provider evidence for a different identity even when member=true", async () => {
    mocks.providerMembership.mockResolvedValue({ ok: true, member: true, clerkUserId: "user_other", clerkOrganizationId: "org_a" });
    expect(await acceptStaffInvitation({ invitationId: INVITE, confirm: "on" })).toMatchObject({ ok: false, code: "DENIED" });
    expect(store.memberships.some((row) => row.userAccountId === PAT)).toBe(false);
  });
});


it("rolls back a created membership if invitation consumption conflicts", async () => {
  mocks.consumeConflict = true;
  await expect(acceptStaffInvitation({ invitationId: INVITE, confirm: "on" })).rejects.toThrow(/rolled back/);
  expect(store.memberships.some((row) => row.userAccountId === PAT)).toBe(false);
  expect(store.audits).toHaveLength(0);
});

it("rejects malformed preview IDs without exposing invitation details", async () => {
  expect(await previewStaffInvitationAcceptance({ invitationId: "not-a-uuid" })).toEqual({ status: "DENIED", message: STAFF_INVITATION_ACCEPT_DENIED_COPY });
});

it("does not reveal church or role for revoked or expired invitations", async () => {
  seedInvitation({ status: StaffInvitationStatus.REVOKED, activeEmailKey: null });
  const revoked = await previewStaffInvitationAcceptance({ invitationId: INVITE });
  expect(revoked).toEqual({
    status: "DENIED",
    message: STAFF_INVITATION_ACCEPT_DENIED_COPY,
  });
  expect(revoked).not.toHaveProperty("email");
  expect(revoked).not.toHaveProperty("churchName");

  seedInvitation({ expiresAt: new Date("2020-01-01T00:00:00.000Z") });
  const expired = await previewStaffInvitationAcceptance({ invitationId: INVITE });
  expect(expired).toEqual({
    status: "DENIED",
    message: STAFF_INVITATION_ACCEPT_DENIED_COPY,
  });
  expect(expired).not.toHaveProperty("roleCode");
});
