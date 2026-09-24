import { beforeEach, describe, expect, it, vi } from "vitest";

type HouseholdRow = {
  id: string;
  organizationId: string;
  displayName: string;
  mailingAddressLine1: string;
  mailingAddressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  primaryDonorId: string | null;
  preferredStatementRecipientId: string | null;
  statementDeliveryMethod: string | null;
  active: boolean;
  members: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    internalNotes: string;
  }>;
};

type MembershipRow = {
  id: string;
  organizationId: string;
  householdId: string;
  donorId: string;
  startDate: Date;
  endDate: Date | null;
  relationshipLabel: string | null;
};

type DonorRow = {
  id: string;
  organizationId: string;
  userAccountId: string;
  active: boolean;
  firstName: string;
  lastName: string;
  email: string;
};

const store = vi.hoisted(() => ({
  donors: [] as DonorRow[],
  households: [] as HouseholdRow[],
  memberships: [] as MembershipRow[],
  lastDonorWhere: null as unknown,
  lastMembershipWhere: null as unknown,
  lastMembershipSelect: null as unknown,
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
    donor: {
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId: string;
          userAccountId: string;
          active: boolean;
        };
      }) => {
        store.lastDonorWhere = where;
        const donor = store.donors.find(
          (row) =>
            row.organizationId === where.organizationId &&
            row.userAccountId === where.userAccountId &&
            row.active === where.active,
        );
        if (!donor) return null;
        return { id: donor.id };
      },
    },
    householdMembership: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId?: string;
          donorId?: string;
          endDate?: Date | null;
          household?: { organizationId?: string; active?: boolean };
        };
        select?: unknown;
      }) => {
        store.lastMembershipWhere = where;
        store.lastMembershipSelect = select;
        return store.memberships
          .filter((membership) => {
            if (
              where.organizationId &&
              membership.organizationId !== where.organizationId
            ) {
              return false;
            }
            if (where.donorId && membership.donorId !== where.donorId) {
              return false;
            }
            if (where.endDate === null && membership.endDate !== null) {
              return false;
            }
            const household = store.households.find(
              (row) => row.id === membership.householdId,
            );
            if (!household) return false;
            if (
              where.household?.organizationId &&
              household.organizationId !== where.household.organizationId
            ) {
              return false;
            }
            if (
              where.household?.active !== undefined &&
              household.active !== where.household.active
            ) {
              return false;
            }
            return true;
          })
          .map((membership) => {
            const household = store.households.find(
              (row) => row.id === membership.householdId,
            )!;
            return {
              id: membership.id,
              relationshipLabel: membership.relationshipLabel,
              household: {
                id: household.id,
                displayName: household.displayName,
                mailingAddressLine1: household.mailingAddressLine1,
                mailingAddressLine2: household.mailingAddressLine2,
                city: household.city,
                state: household.state,
                postalCode: household.postalCode,
                country: household.country,
                primaryDonorId: household.primaryDonorId,
                preferredStatementRecipientId:
                  household.preferredStatementRecipientId,
                statementDeliveryMethod: household.statementDeliveryMethod,
                members: household.members,
              },
            };
          });
      },
    },
  },
}));

import {
  HOUSEHOLD_STATEMENT_AUTHORIZATION_EXPLANATION,
  getMemberHouseholdSummary,
} from "./member-household-summary.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_DONOR = "00000000-0000-4000-8000-00000000d002";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-00000000h001";
const SECOND_HOUSEHOLD = "00000000-0000-4000-8000-00000000h002";
const OTHER_ORG_HOUSEHOLD = "00000000-0000-4000-8000-00000000h003";
const INACTIVE_HOUSEHOLD = "00000000-0000-4000-8000-00000000h004";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-00000000m001";
const ENDED_MEMBERSHIP = "00000000-0000-4000-8000-00000000m002";
const OTHER_DONOR_MEMBERSHIP = "00000000-0000-4000-8000-00000000m003";
const OTHER_ORG_MEMBERSHIP = "00000000-0000-4000-8000-00000000m004";
const INACTIVE_MEMBERSHIP = "00000000-0000-4000-8000-00000000m005";
const SECOND_MEMBERSHIP = "00000000-0000-4000-8000-00000000m006";

const SECRET_SPOUSE = "Secret Spouse";
const SECRET_EMAIL = "secret-spouse@church.test";
const SECRET_PHONE = "207-555-0199";
const SECRET_NOTE = "staff only household memo";

function secretMember() {
  return {
    id: OTHER_DONOR,
    firstName: "Secret",
    lastName: "Spouse",
    email: SECRET_EMAIL,
    phone: SECRET_PHONE,
    dateOfBirth: "1980-01-15",
    internalNotes: SECRET_NOTE,
  };
}

function ownHousehold(overrides: Partial<HouseholdRow> = {}): HouseholdRow {
  return {
    id: HOUSEHOLD_ID,
    organizationId: ORG_ID,
    displayName: "Adams Household",
    mailingAddressLine1: "12 Church Street",
    mailingAddressLine2: "Apt 2",
    city: "Saco",
    state: "ME",
    postalCode: "04072",
    country: "US",
    primaryDonorId: OTHER_DONOR,
    preferredStatementRecipientId: DONOR_ID,
    statementDeliveryMethod: "EMAIL",
    active: true,
    members: [
      {
        id: DONOR_ID,
        firstName: "Ann",
        lastName: "Adams",
        email: "ann@church.test",
        phone: "207-555-0100",
        dateOfBirth: "1982-04-10",
        internalNotes: "own memo",
      },
      secretMember(),
    ],
    ...overrides,
  };
}

function ownMembership(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return {
    id: MEMBERSHIP_ID,
    organizationId: ORG_ID,
    householdId: HOUSEHOLD_ID,
    donorId: DONOR_ID,
    startDate: new Date("2020-01-01T00:00:00.000Z"),
    endDate: null,
    relationshipLabel: "SPOUSE",
    ...overrides,
  };
}

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
    },
    {
      id: OTHER_DONOR,
      organizationId: ORG_ID,
      userAccountId: "00000000-0000-4000-8000-00000000c099",
      active: true,
      firstName: "Secret",
      lastName: "Spouse",
      email: SECRET_EMAIL,
    },
    {
      id: "00000000-0000-4000-8000-00000000d003",
      organizationId: OTHER_ORG,
      userAccountId: USER_ID,
      active: true,
      firstName: "Ann",
      lastName: "Elsewhere",
      email: "elsewhere@church.test",
    },
  ];
  store.households = [
    ownHousehold(),
    {
      id: SECOND_HOUSEHOLD,
      organizationId: ORG_ID,
      displayName: "Second Household",
      mailingAddressLine1: "99 Hidden Lane",
      mailingAddressLine2: null,
      city: "Portland",
      state: "ME",
      postalCode: "04101",
      country: "US",
      primaryDonorId: DONOR_ID,
      preferredStatementRecipientId: OTHER_DONOR,
      statementDeliveryMethod: "MAIL",
      active: true,
      members: [secretMember()],
    },
    {
      id: OTHER_ORG_HOUSEHOLD,
      organizationId: OTHER_ORG,
      displayName: "Other Church Household",
      mailingAddressLine1: "1 Other Org Way",
      mailingAddressLine2: null,
      city: "Nashville",
      state: "TN",
      postalCode: "37201",
      country: "US",
      primaryDonorId: DONOR_ID,
      preferredStatementRecipientId: DONOR_ID,
      statementDeliveryMethod: "EMAIL",
      active: true,
      members: [secretMember()],
    },
    {
      id: INACTIVE_HOUSEHOLD,
      organizationId: ORG_ID,
      displayName: "Inactive Household",
      mailingAddressLine1: "7 Closed Court",
      mailingAddressLine2: null,
      city: "Saco",
      state: "ME",
      postalCode: "04072",
      country: "US",
      primaryDonorId: DONOR_ID,
      preferredStatementRecipientId: DONOR_ID,
      statementDeliveryMethod: "EMAIL",
      active: false,
      members: [secretMember()],
    },
  ];
  store.memberships = [
    ownMembership(),
    ownMembership({
      id: ENDED_MEMBERSHIP,
      householdId: SECOND_HOUSEHOLD,
      endDate: new Date("2024-12-31T00:00:00.000Z"),
      relationshipLabel: "SELF",
    }),
    ownMembership({
      id: OTHER_DONOR_MEMBERSHIP,
      householdId: HOUSEHOLD_ID,
      donorId: OTHER_DONOR,
      relationshipLabel: "SELF",
    }),
    ownMembership({
      id: OTHER_ORG_MEMBERSHIP,
      organizationId: OTHER_ORG,
      householdId: OTHER_ORG_HOUSEHOLD,
    }),
    ownMembership({
      id: INACTIVE_MEMBERSHIP,
      householdId: INACTIVE_HOUSEHOLD,
      relationshipLabel: "SELF",
    }),
  ];
  store.lastDonorWhere = null;
  store.lastMembershipWhere = null;
  store.lastMembershipSelect = null;
}

function payloadText(value: unknown) {
  return JSON.stringify(value);
}

describe("member household summary", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: "ann@church.test",
      displayName: "Ann Adams",
    });
  });

  it("returns signed out without querying church records", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberHouseholdSummary()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastDonorWhere).toBeNull();
    expect(store.lastMembershipWhere).toBeNull();
  });

  it("shows a safe pending state when no donor is linked", async () => {
    store.donors = [];
    await expect(getMemberHouseholdSummary()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: "ann@church.test",
    });
    expect(store.lastMembershipWhere).toBeNull();
  });

  it("returns no household when the linked donor has no active membership", async () => {
    store.memberships = store.memberships.filter(
      (row) => row.donorId !== DONOR_ID || row.endDate !== null,
    );
    await expect(getMemberHouseholdSummary()).resolves.toEqual({
      status: "NO_HOUSEHOLD",
    });
    expect(store.lastMembershipWhere).toEqual({
      organizationId: ORG_ID,
      donorId: DONOR_ID,
      endDate: null,
      household: {
        organizationId: ORG_ID,
        active: true,
      },
    });
  });

  it("ignores ended memberships, inactive households, other donors, and other organizations", async () => {
    const result = await getMemberHouseholdSummary();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.household.displayName).toBe("Adams Household");
    expect(store.lastDonorWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      active: true,
    });
    expect(store.lastMembershipWhere).toMatchObject({
      organizationId: ORG_ID,
      donorId: DONOR_ID,
      endDate: null,
      household: { organizationId: ORG_ID, active: true },
    });
    const text = payloadText(result);
    expect(text).not.toContain("Second Household");
    expect(text).not.toContain("Other Church Household");
    expect(text).not.toContain("Inactive Household");
    expect(text).not.toContain(OTHER_ORG);
    expect(text).not.toContain(SECOND_HOUSEHOLD);
    expect(text).not.toContain(OTHER_ORG_HOUSEHOLD);
  });

  it("marks the signed-in donor as the preferred household statement recipient", async () => {
    const result = await getMemberHouseholdSummary();
    expect(result).toEqual({
      status: "READY",
      household: {
        displayName: "Adams Household",
        mailingAddress: {
          mailingAddressLine1: "12 Church Street",
          mailingAddressLine2: "Apt 2",
          city: "Saco",
          state: "ME",
          postalCode: "04072",
          country: "US",
        },
        relationshipLabel: "Spouse",
        isPreferredStatementRecipient: true,
        statementDeliveryMethodLabel: "Email",
      },
      authorizationExplanation: HOUSEHOLD_STATEMENT_AUTHORIZATION_EXPLANATION,
    });
  });

  it("does not reveal the preferred recipient when it is another household member", async () => {
    const household = store.households.find((row) => row.id === HOUSEHOLD_ID)!;
    household.preferredStatementRecipientId = OTHER_DONOR;
    household.statementDeliveryMethod = "POSTAL_MAIL";

    const result = await getMemberHouseholdSummary();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.household.isPreferredStatementRecipient).toBe(false);
    expect(result.household.statementDeliveryMethodLabel).toBe("Postal mail");
    const text = payloadText(result);
    expect(text).not.toContain(SECRET_SPOUSE);
    expect(text).not.toContain("Secret");
    expect(text).not.toContain(SECRET_EMAIL);
    expect(text).not.toContain(OTHER_DONOR);
    expect(text).not.toMatch(/preferredStatementRecipientId/);
  });

  it("returns a safe staff-review status when more than one active household link exists", async () => {
    store.memberships.push(
      ownMembership({
        id: SECOND_MEMBERSHIP,
        householdId: SECOND_HOUSEHOLD,
        relationshipLabel: "SELF",
      }),
    );

    const result = await getMemberHouseholdSummary();
    expect(result).toEqual({ status: "NEEDS_REVIEW" });
    const text = payloadText(result);
    expect(text).not.toContain("Adams Household");
    expect(text).not.toContain("Second Household");
    expect(text).not.toContain(HOUSEHOLD_ID);
    expect(text).not.toContain(SECOND_HOUSEHOLD);
    expect(text).not.toContain(SECRET_SPOUSE);
    expect(text).not.toContain(SECRET_EMAIL);
  });

  it("excludes other household member details and internal identifiers from the payload", async () => {
    const result = await getMemberHouseholdSummary();
    expect(result.status).toBe("READY");
    const text = payloadText(result);
    expect(text).not.toContain(DONOR_ID);
    expect(text).not.toContain(HOUSEHOLD_ID);
    expect(text).not.toContain(MEMBERSHIP_ID);
    expect(text).not.toContain(OTHER_DONOR);
    expect(text).not.toContain(SECRET_SPOUSE);
    expect(text).not.toContain(SECRET_EMAIL);
    expect(text).not.toContain(SECRET_PHONE);
    expect(text).not.toContain("1980-01-15");
    expect(text).not.toContain(SECRET_NOTE);
    expect(text).not.toContain("primaryDonorId");
    expect(text).not.toMatch(/"id"/);
    expect(store.lastMembershipSelect).toEqual({
      relationshipLabel: true,
      household: {
        select: {
          displayName: true,
          mailingAddressLine1: true,
          mailingAddressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
          preferredStatementRecipientId: true,
          statementDeliveryMethod: true,
        },
      },
    });
    expect(JSON.stringify(store.lastMembershipSelect)).not.toContain(
      "memberships",
    );
    expect(JSON.stringify(store.lastMembershipSelect)).not.toContain("email");
    expect(JSON.stringify(store.lastMembershipSelect)).not.toContain("phone");
  });
});
