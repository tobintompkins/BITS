import { beforeEach, describe, expect, it, vi } from "vitest";

type DonorRow = {
  id: string;
  organizationId: string;
  userAccountId: string;
  active: boolean;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredCommunicationMethod: string | null;
  internalNotes: string | null;
  mailingAddressLine1: string | null;
  deceased: boolean;
};

const store = vi.hoisted(() => ({
  donors: [] as DonorRow[],
  audits: [] as Array<Record<string, unknown>>,
  lastDonorWhere: null as unknown,
  lastUpdateWhere: null as unknown,
  lastUpdateData: null as unknown,
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

vi.mock("@/lib/db/prisma", () => {
  async function findLinkedDonor(where: {
    organizationId: string;
    userAccountId: string;
    active: boolean;
  }) {
    store.lastDonorWhere = where;
    return (
      store.donors.find(
        (donor) =>
          donor.organizationId === where.organizationId &&
          donor.userAccountId === where.userAccountId &&
          donor.active === where.active,
      ) ?? null
    );
  }

  const donorApi = {
    findFirst: async ({
      where,
    }: {
      where: {
        organizationId: string;
        userAccountId: string;
        active: boolean;
      };
    }) => {
      const donor = await findLinkedDonor(where);
      if (!donor) return null;
      return {
        id: donor.id,
        firstName: donor.firstName,
        lastName: donor.lastName,
        email: donor.email,
        phone: donor.phone,
        preferredCommunicationMethod: donor.preferredCommunicationMethod,
      };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        id: string;
        organizationId: string;
        userAccountId: string;
        active: boolean;
      };
      data: {
        email: string | null;
        phone: string | null;
        preferredCommunicationMethod: string;
      };
    }) => {
      store.lastUpdateWhere = where;
      store.lastUpdateData = data;
      const donor = store.donors.find(
        (row) =>
          row.id === where.id &&
          row.organizationId === where.organizationId &&
          row.userAccountId === where.userAccountId &&
          row.active === where.active,
      );
      if (!donor) return { count: 0 };
      donor.email = data.email;
      donor.phone = data.phone;
      donor.preferredCommunicationMethod = data.preferredCommunicationMethod;
      return { count: 1 };
    },
  };

  return {
    prisma: {
      donor: donorApi,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          donor: donorApi,
          auditEvent: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              store.audits.push(data);
              return { id: "audit-1" };
            },
          },
        }),
    },
  };
});

import {
  getMemberProfilePreferences,
  updateMemberProfilePreferences,
} from "./member-profile-preferences.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_DONOR = "00000000-0000-4000-8000-00000000d002";

function seed() {
  store.donors = [
    {
      id: DONOR_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      active: true,
      firstName: "Ann",
      lastName: "Adams",
      email: "ann@church.test",
      phone: "207-555-0100",
      preferredCommunicationMethod: "EMAIL",
      internalNotes: "staff only memo",
      mailingAddressLine1: "9 Secret Lane",
      deceased: false,
    },
    {
      id: OTHER_DONOR,
      organizationId: ORG_ID,
      userAccountId: "00000000-0000-4000-8000-00000000c099",
      active: true,
      firstName: "Other",
      lastName: "Donor",
      email: "other@church.test",
      phone: "207-555-0199",
      preferredCommunicationMethod: "PHONE",
      internalNotes: "other donor memo",
      mailingAddressLine1: "1 Other Road",
      deceased: false,
    },
    {
      id: "00000000-0000-4000-8000-00000000d003",
      organizationId: OTHER_ORG,
      userAccountId: USER_ID,
      active: true,
      firstName: "Ann",
      lastName: "Elsewhere",
      email: "elsewhere@church.test",
      phone: "615-555-0100",
      preferredCommunicationMethod: "MAIL",
      internalNotes: "other org memo",
      mailingAddressLine1: "100 Other St",
      deceased: false,
    },
  ];
  store.audits = [];
  store.lastDonorWhere = null;
  store.lastUpdateWhere = null;
  store.lastUpdateData = null;
}

describe("member profile preferences", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First Community Church",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: "ann@church.test",
      displayName: "Ann Adams",
    });
  });

  it("returns signed out without querying church records", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberProfilePreferences()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastDonorWhere).toBeNull();
  });

  it("shows a safe pending state when no donor is linked", async () => {
    store.donors = store.donors.filter((donor) => donor.id !== DONOR_ID);
    const result = await getMemberProfilePreferences();
    expect(result).toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: "ann@church.test",
    });
    expect(store.lastUpdateWhere).toBeNull();
  });

  it("returns only safe display fields for the linked donor", async () => {
    const result = await getMemberProfilePreferences();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.profile).toEqual({
      firstName: "Ann",
      lastName: "Adams",
      email: "ann@church.test",
      phone: "207-555-0100",
      preferredCommunicationMethod: "EMAIL",
    });
    const json = JSON.stringify(result);
    expect(json).not.toMatch(
      /staff only memo|9 Secret Lane|other@church.test|deceased|internalNotes|mailingAddress/i,
    );
    expect(json).not.toContain(DONOR_ID);
    expect(json).not.toContain(OTHER_DONOR);
    expect(json).not.toContain(USER_ID);
    expect(json).not.toContain(ORG_ID);
  });

  it("rejects invalid input without changing records or writing audit", async () => {
    const result = await updateMemberProfilePreferences({
      email: "not-an-email",
      phone: "x".repeat(41),
      preferredCommunicationMethod: "SMS",
      firstName: "Hacker",
      internalNotes: "injected",
    });
    expect(result.status).toBe("INVALID");
    if (result.status !== "INVALID") return;
    expect(result.fieldErrors.email?.length).toBeGreaterThan(0);
    expect(result.fieldErrors.phone?.length).toBeGreaterThan(0);
    expect(result.fieldErrors.preferredCommunicationMethod?.length).toBeGreaterThan(
      0,
    );
    expect(store.donors[0]?.firstName).toBe("Ann");
    expect(store.donors[0]?.email).toBe("ann@church.test");
    expect(store.donors[0]?.internalNotes).toBe("staff only memo");
    expect(store.audits).toHaveLength(0);
    expect(store.lastUpdateWhere).toBeNull();
  });

  it("updates only the three allowed fields for the linked donor", async () => {
    const result = await updateMemberProfilePreferences({
      email: " Ann.New@Church.TEST ",
      phone: " 207-555-0111 ",
      preferredCommunicationMethod: "PHONE",
      firstName: "Nope",
      lastName: "Nope",
      donorId: OTHER_DONOR,
      internalNotes: "should not save",
      deceased: true,
    });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.profile).toEqual({
      firstName: "Ann",
      lastName: "Adams",
      email: "ann.new@church.test",
      phone: "207-555-0111",
      preferredCommunicationMethod: "PHONE",
    });
    expect(store.lastUpdateWhere).toEqual({
      id: DONOR_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      active: true,
    });
    expect(store.lastUpdateData).toEqual({
      email: "ann.new@church.test",
      phone: "207-555-0111",
      preferredCommunicationMethod: "PHONE",
    });
    expect(store.donors[0]?.firstName).toBe("Ann");
    expect(store.donors[0]?.internalNotes).toBe("staff only memo");
    expect(store.donors[0]?.mailingAddressLine1).toBe("9 Secret Lane");
    expect(store.donors[0]?.deceased).toBe(false);
    expect(store.donors[1]?.email).toBe("other@church.test");
    expect(store.donors[2]?.email).toBe("elsewhere@church.test");
  });

  it("writes an allow-listed audit event and omits sensitive data", async () => {
    await updateMemberProfilePreferences({
      email: "ann.new@church.test",
      phone: "207-555-0111",
      preferredCommunicationMethod: "MAIL",
      internalNotes: "ignore me",
    });
    expect(store.audits).toHaveLength(1);
    const audit = store.audits[0];
    expect(audit).toMatchObject({
      organizationId: ORG_ID,
      actorUserAccountId: USER_ID,
      action: "UPDATE_MEMBER_PORTAL_PROFILE",
      entityType: "Donor",
      entityId: DONOR_ID,
    });
    expect(audit?.changeMetadata).toEqual({
      changes: [
        {
          field: "email",
          oldValue: "ann@church.test",
          newValue: "ann.new@church.test",
        },
        {
          field: "phone",
          oldValue: "207-555-0100",
          newValue: "207-555-0111",
        },
        {
          field: "preferredCommunicationMethod",
          oldValue: "EMAIL",
          newValue: "MAIL",
        },
      ],
    });
    const json = JSON.stringify(audit);
    expect(json).not.toMatch(
      /internalNotes|staff only memo|9 Secret Lane|ignore me|firstName|deceased/i,
    );
  });

  it("does not update when signed out or unlinked", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      updateMemberProfilePreferences({
        email: "changed@church.test",
        phone: "207-555-0000",
        preferredCommunicationMethod: "MAIL",
      }),
    ).resolves.toEqual({ status: "SIGNED_OUT" });
    expect(store.audits).toHaveLength(0);
    expect(store.lastUpdateWhere).toBeNull();

    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: "ann@church.test",
      displayName: "Ann Adams",
    });
    store.donors = store.donors.filter((donor) => donor.id !== DONOR_ID);
    const pending = await updateMemberProfilePreferences({
      email: "changed@church.test",
      phone: "207-555-0000",
      preferredCommunicationMethod: "MAIL",
    });
    expect(pending).toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: "ann@church.test",
    });
    expect(store.donors.find((row) => row.id === OTHER_DONOR)?.email).toBe(
      "other@church.test",
    );
    expect(store.audits).toHaveLength(0);
  });

  it("does not write an audit event when values are unchanged", async () => {
    const result = await updateMemberProfilePreferences({
      email: "ann@church.test",
      phone: "207-555-0100",
      preferredCommunicationMethod: "EMAIL",
    });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.unchanged).toBe(true);
    expect(store.audits).toHaveLength(0);
    expect(store.lastUpdateWhere).toBeNull();
  });
});
