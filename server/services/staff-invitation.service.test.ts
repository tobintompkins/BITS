import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode, StaffInvitationStatus } from "@/app/generated/prisma/client";
import {
  STAFF_INVITATION_ADMIN_CONFIRM_COPY,
  STAFF_INVITATION_DONOR_COPY,
  STAFF_INVITATION_DUPLICATE_COPY,
  STAFF_INVITATION_EXISTING_MEMBER_COPY,
  STAFF_INVITATION_NOT_FOUND_COPY,
} from "@/lib/validation/staff-invitation";

type Account = {
  id: string;
  clerkUserId: string;
  primaryEmail: string;
  active: boolean;
};
type Org = {
  id: string;
  name: string;
  displayName?: string;
  active: boolean;
  clerkOrganizationId: string | null;
};
type Membership = {
  id: string;
  organizationId: string;
  userAccountId: string;
  roleCode: RoleCode;
  active: boolean;
};
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
  lastProviderErrorRedacted: string | null;
  createdAt: Date;
};
type AuditRow = {
  action: string;
  entityId: string;
  organizationId: string;
};

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
const BLAKE = "00000000-0000-4000-8000-00000000c002";
const INVITE = "00000000-0000-4000-8000-00000000e001";

const store = vi.hoisted(() => ({
  accounts: [] as Account[],
  orgs: [] as Org[],
  memberships: [] as Membership[],
  invitations: [] as Invitation[],
  audits: [] as AuditRow[],
  auditShouldFail: false,
  nextInvitationId: "00000000-0000-4000-8000-00000000e001",
}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  providerCreate: vi.fn(),
  providerGet: vi.fn(),
  providerRevoke: vi.fn(),
}));

const prismaMock = vi.hoisted(() => {
  function clone() {
    return {
      accounts: store.accounts.map((row) => ({ ...row })),
      orgs: store.orgs.map((row) => ({ ...row })),
      memberships: store.memberships.map((row) => ({ ...row })),
      invitations: store.invitations.map((row) => ({ ...row })),
      audits: store.audits.map((row) => ({ ...row })),
    };
  }
  function restore(snapshot: ReturnType<typeof clone>) {
    store.accounts = snapshot.accounts;
    store.orgs = snapshot.orgs;
    store.memberships = snapshot.memberships;
    store.invitations = snapshot.invitations;
    store.audits = snapshot.audits;
  }

  function db() {
    return {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        if (sql.includes("FROM organizations")) {
          const id = String(values[0]);
          const org = store.orgs.find((row) => row.id === id && row.active);
          return org
            ? [
                {
                  id: org.id,
                  clerkOrganizationId: org.clerkOrganizationId,
                  name: org.name,
                },
              ]
            : [];
        }
        if (sql.includes("staff-membership-lock:actor")) {
          const organizationId = String(values[0]);
          const userAccountId = String(values[1]);
          const membership = store.memberships.find(
            (row) =>
              row.organizationId === organizationId &&
              row.userAccountId === userAccountId,
          );
          const account = store.accounts.find((row) => row.id === userAccountId);
          if (!membership || !account) return [];
          return [
            {
              id: membership.id,
              organizationId,
              userAccountId,
              roleCode: membership.roleCode,
              active: membership.active,
              userAccountActive: account.active,
              clerkUserId: account.clerkUserId,
            },
          ];
        }
        const invitationId = String(values[0]);
        const organizationId = String(values[1]);
        const invitation = store.invitations.find(
          (row) => row.id === invitationId && row.organizationId === organizationId,
        );
        return invitation ? [{ ...invitation }] : [];
      },
      userAccount: {
        findUnique: async ({ where }: { where: { clerkUserId: string } }) =>
          store.accounts.find((row) => row.clerkUserId === where.clerkUserId) ??
          null,
      },
      organizationMembership: {
        findMany: async ({
          where,
        }: {
          where: { organizationId: string };
        }) =>
          store.memberships
            .filter((row) => row.organizationId === where.organizationId)
            .map((row) => {
              const account = store.accounts.find(
                (item) => item.id === row.userAccountId,
              )!;
              return {
                id: row.id,
                active: row.active,
                userAccount: {
                  id: account.id,
                  primaryEmail: account.primaryEmail,
                  active: account.active,
                },
              };
            }),
        findFirst: async ({
          where,
        }: {
          where: {
            organizationId: string;
            userAccountId: string;
            active?: boolean;
            roleType?: { code: RoleCode };
            userAccount?: { active: boolean };
          };
        }) => {
          const row = store.memberships.find((item) => {
            if (item.organizationId !== where.organizationId) return false;
            if (item.userAccountId !== where.userAccountId) return false;
            if (where.active === true && !item.active) return false;
            if (where.roleType?.code && item.roleCode !== where.roleType.code) {
              return false;
            }
            const account = store.accounts.find(
              (entry) => entry.id === item.userAccountId,
            );
            if (where.userAccount?.active && !account?.active) return false;
            return true;
          });
          return row ? { id: row.id } : null;
        },
      },
      staffInvitation: {
        create: async ({ data }: { data: Omit<Invitation, "id" | "version" | "acceptedUserAccountId" | "reapprovedByUserAccountId" | "clerkInvitationId" | "lastProviderErrorRedacted" | "createdAt"> & { clerkInvitationId?: string } }) => {
          if (
            store.invitations.some(
              (row) =>
                row.organizationId === data.organizationId &&
                row.activeEmailKey &&
                row.activeEmailKey === data.activeEmailKey,
            )
          ) {
            throw { code: "P2002" };
          }
          const created: Invitation = {
            id: store.nextInvitationId,
            version: 1,
            acceptedUserAccountId: null,
            reapprovedByUserAccountId: null,
            clerkInvitationId: data.clerkInvitationId ?? null,
            lastProviderErrorRedacted: null,
            createdAt: new Date("2026-10-14T00:00:00.000Z"),
            ...data,
          };
          store.invitations.push(created);
          return created;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<Invitation> & {
            version?: unknown;
            reapprovedAt?: Date;
          };
        }) => {
          const row = store.invitations.find((item) => item.id === where.id);
          if (!row) throw new Error("missing");
          if (data.reapprovedByUserAccountId !== undefined) {
            row.reapprovedByUserAccountId = data.reapprovedByUserAccountId;
          }
          if (data.lastProviderErrorRedacted !== undefined) {
            row.lastProviderErrorRedacted = data.lastProviderErrorRedacted;
          }
          applyVersionIncrement(row, data.version);
          return row;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; organizationId: string; version: number };
          data: Partial<Invitation> & {
            version?: unknown;
          };
        }) => {
          const row = store.invitations.find(
            (item) =>
              item.id === where.id &&
              item.organizationId === where.organizationId &&
              item.version === where.version,
          );
          if (!row) return { count: 0 };
          Object.assign(row, {
            status: data.status ?? row.status,
            clerkInvitationId:
              data.clerkInvitationId === undefined
                ? row.clerkInvitationId
                : data.clerkInvitationId,
            lastProviderErrorRedacted:
              data.lastProviderErrorRedacted === undefined
                ? row.lastProviderErrorRedacted
                : data.lastProviderErrorRedacted,
            activeEmailKey:
              data.activeEmailKey === undefined
                ? row.activeEmailKey
                : data.activeEmailKey,
          });
          applyVersionIncrement(row, data.version);
          return { count: 1 };
        },
        count: async () => store.invitations.length,
        findMany: async () =>
          store.invitations.map((row) => ({
            ...row,
            invitedBy: store.accounts.find(
              (account) => account.id === row.invitedByUserAccountId,
            ),
          })),
      },
    };
  }

  return {
    userAccount: {
      findUnique: async ({ where }: { where: { clerkUserId: string } }) =>
        store.accounts.find((row) => row.clerkUserId === where.clerkUserId) ??
        null,
    },
    organizationMembership: db().organizationMembership,
    staffInvitation: db().staffInvitation,
    $transaction: async (fn: (tx: ReturnType<typeof db>) => Promise<unknown>) => {
      const snapshot = clone();
      try {
        return await fn(db());
      } catch (error) {
        restore(snapshot);
        throw error;
      }
    },
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: async (input: AuditRow) => {
    if (store.auditShouldFail) throw new Error("audit failed");
    store.audits.push(input);
    return { id: `audit-${store.audits.length}` };
  },
}));

vi.mock("@/server/services/staff-invitation-provider", () => ({
  getStaffInvitationProvider: () => ({
    createOrganizationInvitation: mocks.providerCreate,
    getOrganizationInvitation: mocks.providerGet,
    revokeOrganizationInvitation: mocks.providerRevoke,
    getOrganizationMembership: async () => ({
      ok: true,
      member: false,
      clerkUserId: "user_x",
      clerkOrganizationId: "org_a",
    }),
    getUserIdentity: async () => ({
      ok: false,
      kind: "not_found",
      redactedError: "not_found",
    }),
  }),
}));

import {
  createStaffInvitation,
  retryStaffInvitation,
  revokeStaffInvitation,
} from "./staff-invitation.service";

function seed() {
  store.accounts = [
    {
      id: ANN,
      clerkUserId: "user_ann",
      primaryEmail: "ann@church.test",
      active: true,
    },
    {
      id: BLAKE,
      clerkUserId: "user_blake",
      primaryEmail: "Blake@Church.TEST",
      active: true,
    },
  ];
  store.orgs = [
    {
      id: ORG_A,
      name: "Northside",
      active: true,
      clerkOrganizationId: "org_a",
    },
    {
      id: ORG_B,
      name: "Southside",
      active: true,
      clerkOrganizationId: "org_b",
    },
  ];
  store.memberships = [
    {
      id: "mem-ann-a",
      organizationId: ORG_A,
      userAccountId: ANN,
      roleCode: RoleCode.ORG_ADMIN,
      active: true,
    },
    {
      id: "mem-blake-a",
      organizationId: ORG_A,
      userAccountId: BLAKE,
      roleCode: RoleCode.TREASURER,
      active: true,
    },
  ];
  store.invitations = [];
  store.audits = [];
  store.auditShouldFail = false;
  store.nextInvitationId = INVITE;
}

beforeEach(() => {
  vi.resetAllMocks();
  seed();
  process.env.APP_BASE_URL = "https://app.example.test";
  mocks.auth.mockResolvedValue({ userId: "user_ann" });
  mocks.findPrimaryOrganization.mockResolvedValue({
    id: ORG_A,
    name: "Northside",
    displayName: "Northside Chapel",
    clerkOrganizationId: "org_a",
    active: true,
  });
  mocks.providerCreate.mockResolvedValue({
    ok: true,
    providerInvitationId: "orginv_mock_1",
    status: "pending",
    emailAddress: "new@church.test",
  });
  mocks.providerGet.mockResolvedValue({
    ok: false,
    kind: "not_found",
    redactedError: "not_found",
  });
  mocks.providerRevoke.mockResolvedValue({
    ok: true,
    providerInvitationId: "orginv_mock_1",
    status: "revoked",
    emailAddress: "new@church.test",
  });
});

describe("createStaffInvitation", () => {
  it("denies signed-out and non-admin actors", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    await expect(
      createStaffInvitation({
        email: "new@church.test",
        roleCode: "TREASURER",
        confirm: "on",
      }),
    ).resolves.toMatchObject({ ok: false, code: "SIGNED_OUT" });

    mocks.auth.mockResolvedValue({ userId: "user_blake" });
    await expect(
      createStaffInvitation({
        email: "new@church.test",
        roleCode: "TREASURER",
        confirm: "on",
      }),
    ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(mocks.providerCreate).not.toHaveBeenCalled();
  });

  it("rejects donor roles, missing admin confirm, and already-member emails", async () => {
    await expect(
      createStaffInvitation({
        email: "new@church.test",
        roleCode: "DONOR",
        confirm: "on",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "INVALID",
    });
    expect(STAFF_INVITATION_DONOR_COPY).toContain("Donor");

    await expect(
      createStaffInvitation({
        email: "new@church.test",
        roleCode: "ORG_ADMIN",
        confirm: "on",
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: STAFF_INVITATION_ADMIN_CONFIRM_COPY,
    });

    await expect(
      createStaffInvitation({
        email: "  BLAKE@church.test ",
        roleCode: "DATA_ENTRY",
        confirm: "on",
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: STAFF_INVITATION_EXISTING_MEMBER_COPY,
    });
    expect(mocks.providerCreate).not.toHaveBeenCalled();
  });

  it("normalizes email without inventing plus aliases and persists before provider delivery", async () => {
    const result = await createStaffInvitation({
      email: "  Pat+Finance@Church.TEST ",
      roleCode: "TREASURER",
      confirm: "on",
    });
    expect(result.ok).toBe(true);
    expect(store.invitations[0]?.emailNormalized).toBe("pat+finance@church.test");
    expect(store.audits[0]?.action).toBe("STAFF_INVITATION_AUTHORIZED");
    expect(mocks.providerCreate).toHaveBeenCalled();
    expect(store.invitations[0]?.status).toBe(StaffInvitationStatus.SENT);
    expect(store.audits.some((row) => row.action === "STAFF_INVITATION_SENT")).toBe(
      true,
    );
  });

  it("does not report sent after a provider failure or timeout", async () => {
    mocks.providerCreate.mockResolvedValue({
      ok: false,
      kind: "error",
      redactedError: "provider_failed",
    });
    const failed = await createStaffInvitation({
      email: "new@church.test",
      roleCode: "TREASURER",
      confirm: "on",
    });
    expect(failed.ok).toBe(true);
    if (failed.ok) expect(failed.status).toBe(StaffInvitationStatus.FAILED);

    store.invitations = [];
    store.audits = [];
    mocks.providerCreate.mockResolvedValue({
      ok: false,
      kind: "timeout",
      redactedError: "TIMEOUT",
    });
    const unknown = await createStaffInvitation({
      email: "new@church.test",
      roleCode: "TREASURER",
      confirm: "on",
    });
    expect(unknown.ok).toBe(true);
    if (unknown.ok) expect(unknown.status).toBe(StaffInvitationStatus.UNKNOWN);
  });

  it("rejects a second active invitation for the same church email", async () => {
    await createStaffInvitation({
      email: "new@church.test",
      roleCode: "TREASURER",
      confirm: "on",
    });
    const duplicate = await createStaffInvitation({
      email: "new@church.test",
      roleCode: "DATA_ENTRY",
      confirm: "on",
    });
    expect(duplicate).toMatchObject({
      ok: false,
      message: STAFF_INVITATION_DUPLICATE_COPY,
    });
  });

  it("rolls back authorization when audit write fails", async () => {
    store.auditShouldFail = true;
    await expect(
      createStaffInvitation({
        email: "new@church.test",
        roleCode: "TREASURER",
        confirm: "on",
      }),
    ).rejects.toThrow("audit failed");
    expect(store.invitations).toHaveLength(0);
    expect(mocks.providerCreate).not.toHaveBeenCalled();
  });
});

describe("retry and revoke", () => {
  function seedPending(status: StaffInvitationStatus) {
    store.invitations = [
      {
        id: INVITE,
        organizationId: ORG_A,
        emailNormalized: "new@church.test",
        emailDisplay: "new@church.test",
        roleCode: RoleCode.TREASURER,
        invitedByUserAccountId: ANN,
        status,
        version: 1,
        clerkInvitationId: "orginv_mock_1",
        clerkOrganizationId: "org_a",
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
        acceptedUserAccountId: null,
        reapprovedByUserAccountId: null,
        activeEmailKey: "new@church.test",
        lastProviderErrorRedacted: "provider_failed",
        createdAt: new Date("2026-10-14T00:00:00.000Z"),
      },
    ];
  }

  it("does not resend an ambiguous delivery without a provider reference", async () => {
    seedPending(StaffInvitationStatus.UNKNOWN);
    store.invitations[0]!.clerkInvitationId = null;
    expect(await retryStaffInvitation({ invitationId: INVITE, expectedVersion: 1, confirm: "on" })).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(mocks.providerCreate).not.toHaveBeenCalled();
  });

  it("does not resend when provider lookup fails", async () => {
    seedPending(StaffInvitationStatus.UNKNOWN);
    mocks.providerGet.mockResolvedValue({ ok: false, kind: "error", redactedError: "unavailable" });
    await retryStaffInvitation({ invitationId: INVITE, expectedVersion: 1, confirm: "on" });
    expect(mocks.providerCreate).not.toHaveBeenCalled();
  });

  it("does not send another email when the provider invitation is missing", async () => {
    seedPending(StaffInvitationStatus.UNKNOWN);
    mocks.providerGet.mockResolvedValue({
      ok: false,
      kind: "not_found",
      redactedError: "not_found",
    });
    const result = await retryStaffInvitation({
      invitationId: INVITE,
      expectedVersion: 1,
      confirm: "on",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.status).toBe(StaffInvitationStatus.UNKNOWN);
    expect(mocks.providerCreate).not.toHaveBeenCalled();
  });

  it("only one competing retry may claim the submitted version", async () => {
    seedPending(StaffInvitationStatus.FAILED);
    await retryStaffInvitation({ invitationId: INVITE, expectedVersion: 1, confirm: "on" });
    const second = await retryStaffInvitation({ invitationId: INVITE, expectedVersion: 1, confirm: "on" });
    expect(second).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(mocks.providerCreate).not.toHaveBeenCalled();
  });

  it("reconciles an existing pending provider invitation instead of sending another", async () => {
    seedPending(StaffInvitationStatus.UNKNOWN);
    mocks.providerGet.mockResolvedValue({
      ok: true,
      providerInvitationId: "orginv_mock_1",
      status: "pending",
      emailAddress: "new@church.test",
    });
    const result = await retryStaffInvitation({
      invitationId: INVITE,
      expectedVersion: 1,
      confirm: "on",
    });
    expect(result.ok).toBe(true);
    expect(mocks.providerCreate).not.toHaveBeenCalled();
    expect(store.invitations[0]?.status).toBe(StaffInvitationStatus.SENT);
  });

  it("requires current-admin reapproval after the inviter is demoted", async () => {
    seedPending(StaffInvitationStatus.FAILED);
    store.memberships[0]!.roleCode = RoleCode.TREASURER;
    store.memberships.push({
      id: "mem-casey",
      organizationId: ORG_A,
      userAccountId: "00000000-0000-4000-8000-00000000c009",
      roleCode: RoleCode.ORG_ADMIN,
      active: true,
    });
    store.accounts.push({
      id: "00000000-0000-4000-8000-00000000c009",
      clerkUserId: "user_casey",
      primaryEmail: "casey@church.test",
      active: true,
    });
    mocks.auth.mockResolvedValue({ userId: "user_casey" });
    const denied = await retryStaffInvitation({
      invitationId: INVITE,
      expectedVersion: 1,
      confirm: "on",
    });
    expect(denied.ok).toBe(false);

    const approved = await retryStaffInvitation({
      invitationId: INVITE,
      expectedVersion: 1,
      confirm: "on",
      reapprove: "on",
    });
    expect(approved.ok).toBe(true);
    expect(store.invitations[0]?.reapprovedByUserAccountId).toBe(
      "00000000-0000-4000-8000-00000000c009",
    );
  });

  it("revokes locally first so a late provider success cannot grant", async () => {
    seedPending(StaffInvitationStatus.SENT);
    mocks.providerRevoke.mockResolvedValue({
      ok: false,
      kind: "timeout",
      redactedError: "TIMEOUT",
    });
    const result = await revokeStaffInvitation({
      invitationId: INVITE,
      expectedVersion: 1,
      confirm: "on",
    });
    expect(result.ok).toBe(true);
    expect(store.invitations[0]?.status).toBe(StaffInvitationStatus.REVOKED);
    expect(store.invitations[0]?.activeEmailKey).toBeNull();
  });

  it("hides cross-tenant invitation ids", async () => {
    store.invitations = [
      {
        id: INVITE,
        organizationId: ORG_B,
        emailNormalized: "hidden@church.test",
        emailDisplay: "hidden@church.test",
        roleCode: RoleCode.TREASURER,
        invitedByUserAccountId: ANN,
        status: StaffInvitationStatus.SENT,
        version: 1,
        clerkInvitationId: "orginv_b",
        clerkOrganizationId: "org_b",
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
        acceptedUserAccountId: null,
        reapprovedByUserAccountId: null,
        activeEmailKey: "hidden@church.test",
        lastProviderErrorRedacted: null,
        createdAt: new Date("2026-10-14T00:00:00.000Z"),
      },
    ];
    await expect(
      revokeStaffInvitation({
        invitationId: INVITE,
        expectedVersion: 1,
        confirm: "on",
      }),
    ).resolves.toMatchObject({
      ok: false,
      message: STAFF_INVITATION_NOT_FOUND_COPY,
    });
  });
});
