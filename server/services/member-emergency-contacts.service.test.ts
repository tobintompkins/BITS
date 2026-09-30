import { beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBER_EMERGENCY_CONTACTS_ROW_FIELDS } from "@/lib/validation/member-emergency-contacts";

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  householdId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  notes: string;
};

type ContactRow = {
  id: string;
  memberId: string;
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
  medicalNote: string;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  contacts: [] as ContactRow[],
  lastMemberWhere: null as unknown,
  lastContactWhere: null as unknown,
  lastContactSelect: null as unknown,
  lastContactOrderBy: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    member: {
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId: string;
          userAccountId: string;
          recordStatus: string;
        };
      }) => {
        store.lastMemberWhere = where;
        const row = store.members.find(
          (item) =>
            item.organizationId === where.organizationId &&
            item.userAccountId === where.userAccountId &&
            item.recordStatus === where.recordStatus,
        );
        return row ? { id: row.id } : null;
      },
    },
    memberEmergencyContact: {
      findMany: async ({
        where,
        select,
        orderBy,
      }: {
        where: {
          memberId: string;
          member: { organizationId: string };
        };
        select: unknown;
        orderBy: unknown;
      }) => {
        store.lastContactWhere = where;
        store.lastContactSelect = select;
        store.lastContactOrderBy = orderBy;
        const member = store.members.find((item) => item.id === where.memberId);
        if (!member || member.organizationId !== where.member.organizationId) {
          return [];
        }
        return store.contacts
          .filter((row) => row.memberId === where.memberId)
          .sort((a, b) => {
            if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
          .map((row) => ({
            name: row.name,
            relationship: row.relationship,
            phone: row.phone,
            email: row.email,
            isPrimary: row.isPrimary,
          }));
      },
    },
  },
}));

import { getMemberEmergencyContacts } from "./member-emergency-contacts.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000d001";
const HOUSEHOLD_MEMBER = "00000000-0000-4000-8000-00000000d002";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000d003";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000d004";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-00000000e001";
const OWN_EMAIL = "ann@church.test";

function seed() {
  store.members = [
    {
      id: MEMBER_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      householdId: HOUSEHOLD_ID,
      firstName: "Ann",
      lastName: "Adams",
      email: OWN_EMAIL,
      notes: "pastoral note must stay hidden",
    },
    {
      id: HOUSEHOLD_MEMBER,
      organizationId: ORG_ID,
      userAccountId: OTHER_USER,
      recordStatus: "ACTIVE",
      householdId: HOUSEHOLD_ID,
      firstName: "Blake",
      lastName: "Adams",
      email: "blake@church.test",
      notes: "household member note",
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      userAccountId: "00000000-0000-4000-8000-00000000c003",
      recordStatus: "ACTIVE",
      householdId: null,
      firstName: "Casey",
      lastName: "Cole",
      email: "casey@church.test",
      notes: "other member note",
    },
    {
      id: OTHER_ORG_MEMBER,
      organizationId: OTHER_ORG,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      householdId: null,
      firstName: "Other",
      lastName: "Church",
      email: "other@elsewhere.test",
      notes: "other church note",
    },
  ];
  store.contacts = [
    {
      id: "00000000-0000-4000-8000-00000000b002",
      memberId: MEMBER_ID,
      name: "Sam Adams",
      relationship: "Spouse",
      phone: "(615) 555-0102",
      email: "sam@church.test",
      isPrimary: false,
      notes: "staff only: prefers evening calls",
      medicalNote: "allergy list must stay hidden",
    },
    {
      id: "00000000-0000-4000-8000-00000000b001",
      memberId: MEMBER_ID,
      name: "Pat Adams",
      relationship: "Parent",
      phone: "(615) 555-0101",
      email: null,
      isPrimary: true,
      notes: "internal custody note",
      medicalNote: "do not disclose",
    },
    {
      id: "00000000-0000-4000-8000-00000000b003",
      memberId: HOUSEHOLD_MEMBER,
      name: "Household Contact",
      relationship: "Grandparent",
      phone: "(615) 555-0199",
      email: "household@church.test",
      isPrimary: true,
      notes: "household staff note",
      medicalNote: "household medical",
    },
    {
      id: "00000000-0000-4000-8000-00000000b004",
      memberId: OTHER_MEMBER,
      name: "Other Member Contact",
      relationship: "Friend",
      phone: "(615) 555-0188",
      email: "other-member@church.test",
      isPrimary: true,
      notes: "other member staff note",
      medicalNote: "other medical",
    },
    {
      id: "00000000-0000-4000-8000-00000000b005",
      memberId: OTHER_ORG_MEMBER,
      name: "Other Church Contact",
      relationship: "Pastor",
      phone: "(207) 555-0177",
      email: "secret@elsewhere.test",
      isPrimary: true,
      notes: "other church note",
      medicalNote: "other church medical",
    },
  ];
}

beforeEach(() => {
  store.members = [];
  store.contacts = [];
  store.lastMemberWhere = null;
  store.lastContactWhere = null;
  store.lastContactSelect = null;
  store.lastContactOrderBy = null;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: OWN_EMAIL,
    displayName: "Ann Adams",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  seed();
});

describe("member emergency contacts access", () => {
  it("returns signed-out, no-organization, and pending states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getMemberEmergencyContacts()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastContactWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getMemberEmergencyContacts()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(store.lastContactWhere).toBeNull();

    store.members[0]!.userAccountId = null;
    await expect(getMemberEmergencyContacts()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastContactWhere).toBeNull();
  });

  it("scopes the member lookup to the current organization and never matches email or name", async () => {
    await getMemberEmergencyContacts();
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("email");
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OWN_EMAIL);
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("Adams");
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OTHER_ORG);
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OTHER_MEMBER);
  });
});

describe("member emergency contacts list", () => {
  it("lists only the linked member’s contacts for the current organization", async () => {
    const result = await getMemberEmergencyContacts();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastContactWhere).toEqual({
      memberId: MEMBER_ID,
      member: { organizationId: ORG_ID },
    });
    expect(result.rows.map((row) => row.name)).toEqual([
      "Pat Adams",
      "Sam Adams",
    ]);
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("Household Contact");
    expect(payload).not.toContain("Other Member Contact");
    expect(payload).not.toContain("Other Church Contact");
    expect(payload).not.toContain("blake@church.test");
    expect(payload).not.toContain("secret@elsewhere.test");
  });

  it("orders primary contacts first", async () => {
    const result = await getMemberEmergencyContacts();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastContactOrderBy).toEqual([
      { isPrimary: "desc" },
      { name: "asc" },
    ]);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        name: "Pat Adams",
        isPrimary: true,
        primaryStatusLabel: "Primary",
      }),
    );
    expect(result.rows[1]).toEqual(
      expect.objectContaining({
        name: "Sam Adams",
        isPrimary: false,
        primaryStatusLabel: "Additional",
      }),
    );
  });

  it("returns only the safe contact-field allow-list", async () => {
    const result = await getMemberEmergencyContacts();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...MEMBER_EMERGENCY_CONTACTS_ROW_FIELDS].sort(),
    );
    expect(store.lastContactSelect).toEqual({
      name: true,
      relationship: true,
      phone: true,
      email: true,
      isPrimary: true,
    });
    expect(result.rows[0]).toEqual({
      name: "Pat Adams",
      relationship: "Parent",
      phone: "(615) 555-0101",
      email: null,
      isPrimary: true,
      primaryStatusLabel: "Primary",
    });
    expect(result.rows[1]).toEqual({
      name: "Sam Adams",
      relationship: "Spouse",
      phone: "(615) 555-0102",
      email: "sam@church.test",
      isPrimary: false,
      primaryStatusLabel: "Additional",
    });
  });

  it("omits internal and private fields", async () => {
    const result = await getMemberEmergencyContacts();
    expect(result.status).toBe("READY");
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("pastoral note");
    expect(payload).not.toContain("internal custody");
    expect(payload).not.toContain("allergy");
    expect(payload).not.toContain("medical");
    expect(payload).not.toContain("staff only");
    expect(payload).not.toContain(MEMBER_ID);
    expect(payload).not.toContain(USER_ID);
    expect(payload).not.toContain("00000000-0000-4000-8000-00000000b001");
    expect(JSON.stringify(store.lastContactSelect)).not.toContain("notes");
    expect(JSON.stringify(store.lastContactSelect)).not.toContain("id");
  });

  it("returns an empty list when the linked member has no emergency contacts", async () => {
    store.contacts = store.contacts.filter((row) => row.memberId !== MEMBER_ID);
    const result = await getMemberEmergencyContacts();
    expect(result).toEqual({ status: "READY", rows: [] });
    expect(store.lastContactWhere).toEqual({
      memberId: MEMBER_ID,
      member: { organizationId: ORG_ID },
    });
  });
});
