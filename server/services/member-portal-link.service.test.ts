import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACCOUNT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_ACCOUNT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OUTSIDER = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const OPEN_DONOR = "11111111-1111-4111-8111-111111111111";
const OTHER_CHURCH_DONOR = "22222222-2222-4222-8222-222222222222";
const OWNED_DONOR = "33333333-3333-4333-8333-333333333333";

type Donor = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  active: boolean;
};

type Membership = {
  id: string;
  organizationId: string;
  userAccountId: string;
  active: boolean;
  churchAccess: string;
  roleCode: string;
};

const store = vi.hoisted(() => ({
  accounts: [] as { id: string; active: boolean; primaryEmail: string }[],
  memberships: [] as Membership[],
  donors: [] as Donor[],
  updates: [] as { id: string; userAccountId: string }[],
  audits: [] as { action: string; entityId: string }[],
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: mocks.currentUser,
}));

function matchesIdNot(id: string, filter: { not?: string } | undefined) {
  return !filter?.not || id !== filter.not;
}

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
          churchAccess?: string;
          roleType?: { code: { in: string[] } };
        };
      }) =>
        store.memberships.find(
          (membership) =>
            membership.organizationId === where.organizationId &&
            membership.userAccountId === where.userAccountId &&
            (where.active === undefined || membership.active === where.active) &&
            (where.churchAccess === undefined ||
              membership.churchAccess === where.churchAccess) &&
            (!where.roleType || where.roleType.code.in.includes(membership.roleCode)),
        ) ?? null,
    },
    userAccount: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.accounts.find((account) => account.id === where.id) ?? null,
    },
    donor: {
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string | { not: string };
          organizationId: string;
          userAccountId?: string;
          active?: boolean;
        };
      }) =>
        store.donors.find((donor) => {
          const idFilter = where.id;
          const idMatches =
            typeof idFilter === "string"
              ? donor.id === idFilter
              : matchesIdNot(donor.id, idFilter);
          return (
            idMatches &&
            donor.organizationId === where.organizationId &&
            (where.userAccountId === undefined ||
              donor.userAccountId === where.userAccountId) &&
            (where.active === undefined || donor.active === where.active)
          );
        }) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { userAccountId: string };
      }) => {
        const donor = store.donors.find((row) => row.id === where.id);
        if (!donor) throw new Error("missing donor");
        donor.userAccountId = data.userAccountId;
        store.updates.push({ id: where.id, userAccountId: data.userAccountId });
        return donor;
      },
    },
    member: {
      findFirst: async () => null,
    },
    churchPersonProfile: {
      findFirst: async () => null,
      update: async () => {
        throw new Error("profile update was not expected");
      },
    },
    auditEvent: {
      create: async ({
        data,
      }: {
        data: { action: string; entityId: string };
      }) => {
        store.audits.push({ action: data.action, entityId: data.entityId });
        return data;
      },
    },
  },
}));

import { connectExistingPersonRecords } from "./member-portal-link.service";

function input(donorId: string, userAccountId = ACCOUNT) {
  return {
    userAccountId,
    donorId,
    memberId: "",
    profileId: "",
    confirmed: "on" as const,
  };
}

describe("connectExistingPersonRecords", () => {
  beforeEach(() => {
    store.accounts = [
      { id: ACCOUNT, active: true, primaryEmail: "member@example.test" },
      { id: OTHER_ACCOUNT, active: true, primaryEmail: "other@example.test" },
      { id: OUTSIDER, active: true, primaryEmail: "outsider@example.test" },
      { id: ACTOR, active: true, primaryEmail: "admin@example.test" },
    ];
    store.memberships = [
      {
        id: "99999999-9999-4999-8999-999999999999",
        organizationId: ORG,
        userAccountId: ACTOR,
        active: true,
        churchAccess: "ACTIVE",
        roleCode: "ORG_ADMIN",
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        organizationId: ORG,
        userAccountId: ACCOUNT,
        active: true,
        churchAccess: "ACTIVE",
        roleCode: "MEMBER",
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        organizationId: OTHER_ORG,
        userAccountId: OUTSIDER,
        active: true,
        churchAccess: "ACTIVE",
        roleCode: "ORG_ADMIN",
      },
    ];
    store.donors = [
      { id: OPEN_DONOR, organizationId: ORG, userAccountId: null, active: true },
      {
        id: OTHER_CHURCH_DONOR,
        organizationId: OTHER_ORG,
        userAccountId: null,
        active: true,
      },
      {
        id: OWNED_DONOR,
        organizationId: ORG,
        userAccountId: OTHER_ACCOUNT,
        active: true,
      },
    ];
    store.updates = [];
    store.audits = [];
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG,
      name: "First Church",
      displayName: "First Church",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: ACTOR });
    mocks.currentUser.mockResolvedValue({ publicMetadata: {} });
  });

  it("connects an unlinked donor in the selected church", async () => {
    await connectExistingPersonRecords(input(OPEN_DONOR));

    expect(store.donors.find((donor) => donor.id === OPEN_DONOR)?.userAccountId).toBe(
      ACCOUNT,
    );
    expect(store.updates).toEqual([{ id: OPEN_DONOR, userAccountId: ACCOUNT }]);
    expect(store.audits).toEqual([
      { action: "PERSON_RECORD_LINKED", entityId: OPEN_DONOR },
    ]);
    expect(store.donors.find((donor) => donor.id === OTHER_CHURCH_DONOR)?.userAccountId).toBe(
      null,
    );
  });

  it("rejects a donor from another church without writing a link", async () => {
    await expect(connectExistingPersonRecords(input(OTHER_CHURCH_DONOR))).rejects.toThrow(
      "Donor record not found in this church.",
    );
    expect(store.updates).toEqual([]);
    expect(store.audits).toEqual([]);
    expect(
      store.donors.find((donor) => donor.id === OTHER_CHURCH_DONOR)?.userAccountId,
    ).toBeNull();
  });

  it("rejects a record already linked to another account", async () => {
    await expect(connectExistingPersonRecords(input(OWNED_DONOR))).rejects.toThrow(
      "already connected to a different account",
    );
    expect(store.updates).toEqual([]);
    expect(store.donors.find((donor) => donor.id === OWNED_DONOR)?.userAccountId).toBe(
      OTHER_ACCOUNT,
    );
  });

  it("rejects an account that belongs to another church", async () => {
    await expect(
      connectExistingPersonRecords(input(OPEN_DONOR, OUTSIDER)),
    ).rejects.toThrow("That BITS account is not in this church.");
    expect(store.updates).toEqual([]);
    expect(store.donors.find((donor) => donor.id === OPEN_DONOR)?.userAccountId).toBeNull();
  });
});
