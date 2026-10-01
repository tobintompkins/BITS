import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS,
  MEMBER_APPROVED_PICKUP_DTO_FIELDS,
  MEMBER_APPROVED_PICKUP_FORBIDDEN_DTO_FIELDS,
  approvedPickupAuditContainsPersonalData,
  canAccessMemberApprovedPickups,
} from "@/lib/validation/member-approved-pickups";

type PickupRow = {
  id: string;
  organizationId: string;
  memberId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  isActive: boolean;
  deactivatedAt: Date | null;
  deactivatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MemberRow = {
  id: string;
  organizationId: string;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  pickups: [] as PickupRow[],
  memberFindFirstCalls: 0,
  pickupFindManyCalls: 0,
  pickupCreateCalls: 0,
  pickupUpdateManyCalls: 0,
  pickupDeleteManyCalls: 0,
  lastMemberWhere: null as unknown,
  lastPickupWhere: null as unknown,
  lastAudit: null as Record<string, unknown> | null,
  audits: [] as Record<string, unknown>[],
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getMemberAccess: vi.fn(),
  getEventAccess: vi.fn(),
  createAuditEvent: vi.fn(async (input: Record<string, unknown>) => {
    store.lastAudit = input;
    store.audits.push(input);
    return input;
  }),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/member-permissions", () => ({
  getMemberAccess: mocks.getMemberAccess,
}));

vi.mock("@/lib/auth/event-permissions", () => ({
  getEventAccess: mocks.getEventAccess,
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

function identityKey(row: {
  firstName: string;
  lastName: string;
  relationship: string;
}) {
  return `${row.firstName.trim().toLowerCase()}|${row.lastName.trim().toLowerCase()}|${row.relationship.trim().toLowerCase()}`;
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    member: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => {
        store.memberFindFirstCalls += 1;
        store.lastMemberWhere = where;
        const row = store.members.find(
          (member) =>
            member.id === where.id && member.organizationId === where.organizationId,
        );
        return row ? { id: row.id } : null;
      },
    },
    memberApprovedPickup: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; memberId: string };
      }) => {
        store.pickupFindManyCalls += 1;
        store.lastPickupWhere = where;
        return store.pickups.filter(
          (row) =>
            row.organizationId === where.organizationId &&
            row.memberId === where.memberId,
        );
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string; memberId: string };
      }) => {
        return (
          store.pickups.find(
            (row) =>
              row.id === where.id &&
              row.organizationId === where.organizationId &&
              row.memberId === where.memberId,
          ) ?? null
        );
      },
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          memberId: string;
          firstName: string;
          lastName: string;
          relationship: string;
          isActive?: boolean;
        };
      }) => {
        store.pickupCreateCalls += 1;
        if (
          (data.isActive ?? true) &&
          store.pickups.some(
            (row) =>
              row.isActive &&
              row.organizationId === data.organizationId &&
              row.memberId === data.memberId &&
              identityKey(row) === identityKey(data),
          )
        ) {
          throw { code: "P2002" };
        }
        const now = new Date("2026-09-30T16:00:00.000Z");
        const created: PickupRow = {
          id: `00000000-0000-4000-8000-00000000${String(store.pickups.length + 1).padStart(4, "0")}`,
          organizationId: data.organizationId,
          memberId: data.memberId,
          firstName: data.firstName,
          lastName: data.lastName,
          relationship: data.relationship,
          isActive: data.isActive ?? true,
          deactivatedAt: null,
          deactivatedByUserId: null,
          createdAt: now,
          updatedAt: now,
        };
        store.pickups.push(created);
        return created;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; organizationId: string; memberId: string };
        data: Partial<PickupRow>;
      }) => {
        store.pickupUpdateManyCalls += 1;
        const index = store.pickups.findIndex(
          (row) =>
            row.id === where.id &&
            row.organizationId === where.organizationId &&
            row.memberId === where.memberId,
        );
        if (index < 0) return { count: 0 };
        store.pickups[index] = {
          ...store.pickups[index],
          ...data,
          updatedAt: new Date("2026-09-30T17:00:00.000Z"),
        };
        return { count: 1 };
      },
      deleteMany: async ({
        where,
      }: {
        where: { id: string; organizationId: string; memberId: string };
      }) => {
        store.pickupDeleteManyCalls += 1;
        const before = store.pickups.length;
        store.pickups = store.pickups.filter(
          (row) =>
            !(
              row.id === where.id &&
              row.organizationId === where.organizationId &&
              row.memberId === where.memberId
            ),
        );
        return { count: before - store.pickups.length };
      },
    },
  },
}));

import {
  createMemberApprovedPickup,
  deactivateMemberApprovedPickup,
  deleteMemberApprovedPickup,
  getMemberApprovedPickups,
  reactivateMemberApprovedPickup,
  updateMemberApprovedPickup,
} from "./member-approved-pickups.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const MEMBER_ID = "00000000-0000-4000-8000-00000000b001";
const OTHER_MEMBER_ID = "00000000-0000-4000-8000-00000000b002";
const PICKUP_ID = "00000000-0000-4000-8000-00000000d001";

function fullAccess() {
  mocks.getMemberAccess.mockResolvedValue({
    canView: true,
    canEdit: true,
    canCreate: true,
    canDelete: true,
    canImportExport: true,
    roleCode: "ORG_ADMIN",
    isSuperAdmin: false,
  });
  mocks.getEventAccess.mockResolvedValue({
    canManageCheckIn: true,
  });
}

function pickup(overrides: Partial<PickupRow> = {}): PickupRow {
  return {
    id: PICKUP_ID,
    organizationId: ORG_ID,
    memberId: MEMBER_ID,
    firstName: "Jordan",
    lastName: "Hayes",
    relationship: "Grandparent",
    isActive: true,
    deactivatedAt: null,
    deactivatedByUserId: null,
    createdAt: new Date("2026-09-30T12:00:00.000Z"),
    updatedAt: new Date("2026-09-30T12:00:00.000Z"),
    ...overrides,
  };
}

describe("canAccessMemberApprovedPickups", () => {
  it("requires member view, member edit, and check-in management together", () => {
    expect(
      canAccessMemberApprovedPickups({
        canViewMembers: true,
        canEditMembers: true,
        canManageCheckIn: true,
      }),
    ).toBe(true);
    expect(
      canAccessMemberApprovedPickups({
        canViewMembers: true,
        canEditMembers: false,
        canManageCheckIn: true,
      }),
    ).toBe(false);
    expect(
      canAccessMemberApprovedPickups({
        canViewMembers: true,
        canEditMembers: true,
        canManageCheckIn: false,
      }),
    ).toBe(false);
    expect(
      canAccessMemberApprovedPickups({
        canViewMembers: false,
        canEditMembers: true,
        canManageCheckIn: true,
      }),
    ).toBe(false);
  });
});

describe("member approved pickups service", () => {
  beforeEach(() => {
    store.members = [{ id: MEMBER_ID, organizationId: ORG_ID }];
    store.pickups = [];
    store.memberFindFirstCalls = 0;
    store.pickupFindManyCalls = 0;
    store.pickupCreateCalls = 0;
    store.pickupUpdateManyCalls = 0;
    store.pickupDeleteManyCalls = 0;
    store.lastMemberWhere = null;
    store.lastPickupWhere = null;
    store.lastAudit = null;
    store.audits = [];
    mocks.getOrCreateUserAccount.mockReset();
    mocks.findPrimaryOrganization.mockReset();
    mocks.getMemberAccess.mockReset();
    mocks.getEventAccess.mockReset();
    mocks.createAuditEvent.mockClear();
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
    fullAccess();
  });

  it("does not let unauthorized users read or change pickup records", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);

    await expect(getMemberApprovedPickups(MEMBER_ID)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    await expect(
      createMemberApprovedPickup(MEMBER_ID, {
        firstName: "Jordan",
        lastName: "Hayes",
        relationship: "Grandparent",
      }),
    ).resolves.toEqual({ status: "SIGNED_OUT" });
    await expect(
      deleteMemberApprovedPickup(MEMBER_ID, PICKUP_ID),
    ).resolves.toEqual({ status: "SIGNED_OUT" });

    expect(store.memberFindFirstCalls).toBe(0);
    expect(store.pickupFindManyCalls).toBe(0);
    expect(store.pickupCreateCalls).toBe(0);
    expect(store.audits).toHaveLength(0);
  });

  it("treats member-view-only access as insufficient", async () => {
    mocks.getMemberAccess.mockResolvedValue({
      canView: true,
      canEdit: false,
    });
    mocks.getEventAccess.mockResolvedValue({ canManageCheckIn: true });
    store.pickups = [pickup()];

    await expect(getMemberApprovedPickups(MEMBER_ID)).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    await expect(
      createMemberApprovedPickup(MEMBER_ID, {
        firstName: "Jordan",
        lastName: "Hayes",
        relationship: "Grandparent",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    expect(store.memberFindFirstCalls).toBe(0);
    expect(store.pickupFindManyCalls).toBe(0);
  });

  it("treats member-edit-only access as insufficient", async () => {
    mocks.getMemberAccess.mockResolvedValue({
      canView: true,
      canEdit: true,
    });
    mocks.getEventAccess.mockResolvedValue({ canManageCheckIn: false });
    store.pickups = [pickup()];

    await expect(getMemberApprovedPickups(MEMBER_ID)).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    await expect(
      updateMemberApprovedPickup(MEMBER_ID, PICKUP_ID, {
        firstName: "Jordan",
        lastName: "Hayes",
        relationship: "Parent",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    expect(store.pickupFindManyCalls).toBe(0);
    expect(store.pickupUpdateManyCalls).toBe(0);
  });

  it("treats check-in-only access as insufficient", async () => {
    mocks.getMemberAccess.mockResolvedValue({
      canView: false,
      canEdit: false,
    });
    mocks.getEventAccess.mockResolvedValue({ canManageCheckIn: true });
    store.pickups = [pickup()];

    await expect(getMemberApprovedPickups(MEMBER_ID)).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    await expect(
      deactivateMemberApprovedPickup(MEMBER_ID, PICKUP_ID),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    expect(store.memberFindFirstCalls).toBe(0);
    expect(store.pickupFindManyCalls).toBe(0);
  });

  it("does not query or change a member from another organization", async () => {
    store.members = [{ id: OTHER_MEMBER_ID, organizationId: OTHER_ORG }];
    store.pickups = [
      pickup({
        id: PICKUP_ID,
        organizationId: OTHER_ORG,
        memberId: OTHER_MEMBER_ID,
        firstName: "Casey",
        lastName: "Nguyen",
        relationship: "Family Friend",
      }),
    ];

    await expect(getMemberApprovedPickups(OTHER_MEMBER_ID)).resolves.toEqual({
      status: "NOT_FOUND",
    });
    await expect(
      createMemberApprovedPickup(OTHER_MEMBER_ID, {
        firstName: "Casey",
        lastName: "Nguyen",
        relationship: "Family Friend",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(
      deleteMemberApprovedPickup(OTHER_MEMBER_ID, PICKUP_ID),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    expect(store.lastMemberWhere).toEqual({
      id: OTHER_MEMBER_ID,
      organizationId: ORG_ID,
    });
    expect(store.pickupFindManyCalls).toBe(0);
    expect(store.pickupCreateCalls).toBe(0);
    expect(store.pickupDeleteManyCalls).toBe(0);
  });

  it("returns a DTO with only allowed pickup fields", async () => {
    store.pickups = [pickup()];

    const result = await getMemberApprovedPickups(MEMBER_ID);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;

    expect(Object.keys(result.rows[0]).sort()).toEqual(
      [...MEMBER_APPROVED_PICKUP_DTO_FIELDS].sort(),
    );
    for (const field of MEMBER_APPROVED_PICKUP_FORBIDDEN_DTO_FIELDS) {
      expect(result.rows[0]).not.toHaveProperty(field);
    }
    expect(result.rows[0]).toEqual({
      id: PICKUP_ID,
      firstName: "Jordan",
      lastName: "Hayes",
      relationship: "Grandparent",
      isActive: true,
    });
  });

  it("creates, edits, deactivates, reactivates, and removes pickup people", async () => {
    const created = await createMemberApprovedPickup(MEMBER_ID, {
      firstName: "  Jordan  ",
      lastName: "Hayes",
      relationship: "Grandparent",
    });
    expect(created.status).toBe("CREATED");
    if (created.status !== "CREATED") return;

    const duplicate = await createMemberApprovedPickup(MEMBER_ID, {
      firstName: "jordan",
      lastName: "HAYES",
      relationship: "grandparent",
    });
    expect(duplicate).toEqual({ status: "DUPLICATE" });

    const updated = await updateMemberApprovedPickup(MEMBER_ID, created.row.id, {
      firstName: "Jordan",
      lastName: "Hayes",
      relationship: "Family Friend",
    });
    expect(updated.status).toBe("UPDATED");
    if (updated.status !== "UPDATED") return;
    expect(updated.row.relationship).toBe("Family Friend");

    const deactivated = await deactivateMemberApprovedPickup(
      MEMBER_ID,
      created.row.id,
    );
    expect(deactivated.status).toBe("DEACTIVATED");
    if (deactivated.status !== "DEACTIVATED") return;
    expect(deactivated.row.isActive).toBe(false);

    const reactivated = await reactivateMemberApprovedPickup(
      MEMBER_ID,
      created.row.id,
    );
    expect(reactivated.status).toBe("REACTIVATED");
    if (reactivated.status !== "REACTIVATED") return;
    expect(reactivated.row.isActive).toBe(true);

    const removed = await deleteMemberApprovedPickup(MEMBER_ID, created.row.id);
    expect(removed).toEqual({ status: "DELETED" });
    expect(store.pickups).toHaveLength(0);
  });

  it("records audit action names without personal names or relationship values", async () => {
    const created = await createMemberApprovedPickup(MEMBER_ID, {
      firstName: "Jordan",
      lastName: "Hayes",
      relationship: "Grandparent",
    });
    expect(created.status).toBe("CREATED");
    if (created.status !== "CREATED") return;

    await updateMemberApprovedPickup(MEMBER_ID, created.row.id, {
      firstName: "Jordan",
      lastName: "Hayes",
      relationship: "Parent",
    });
    await deactivateMemberApprovedPickup(MEMBER_ID, created.row.id);
    await reactivateMemberApprovedPickup(MEMBER_ID, created.row.id);
    await deleteMemberApprovedPickup(MEMBER_ID, created.row.id);

    const actions = store.audits.map((entry) => entry.action);
    expect(actions).toEqual([
      MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS.CREATED,
      MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS.UPDATED,
      MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS.DEACTIVATED,
      MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS.REACTIVATED,
      MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS.DELETED,
    ]);

    for (const audit of store.audits) {
      expect(audit.entityType).toBe("MemberApprovedPickup");
      expect(audit.actorUserAccountId).toBe(USER_ID);
      expect(
        approvedPickupAuditContainsPersonalData(audit, [
          "Jordan",
          "Hayes",
          "Grandparent",
          "Parent",
        ]),
      ).toBe(false);
      const changeText = JSON.stringify(audit.changes);
      expect(changeText).not.toMatch(/firstName|lastName|relationship/i);
    }
  });
});
