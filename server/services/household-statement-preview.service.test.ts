import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RoleCode,
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";
import { sumMoneyAmounts } from "@/lib/money/decimal";

type AllocationRow = {
  organizationId: string;
  offeringTypeOrganizationId: string;
  amount: string;
  fundName: string;
};

type DonationRow = {
  organizationId: string;
  donorId: string;
  isTest: boolean;
  anonymous: boolean;
  offeringDate: Date;
  totalAmount: string;
  deductibleAmount: string;
  checkNumber?: string;
  note?: string;
  stripePaymentIntentId?: string;
  allocations: AllocationRow[];
};

type MembershipRow = {
  organizationId: string;
  householdId: string;
  donorId: string;
  startDate: Date;
  endDate: Date | null;
  donorOrganizationId: string;
  firstName: string;
  lastName: string;
};

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
  preferredFirstName: string | null;
  preferredLastName: string | null;
};

type StatementRow = {
  id: string;
  organizationId: string;
  householdId: string;
  statementType: StatementType;
  taxYear: number | null;
  periodStart: Date;
  status: StatementStatus;
  statementIdentifier: string;
  generatedByUserAccountId: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  displayName: string | null;
  mailingAddressLine1: string | null;
  mailingAddressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  ein: string | null;
  statementFooterText: string | null;
};

const store = vi.hoisted(() => ({
  households: [] as HouseholdRow[],
  memberships: [] as MembershipRow[],
  donations: [] as DonationRow[],
  statements: [] as StatementRow[],
  organization: null as OrganizationRow | null,
  lastDonationQuery: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  getGivingAccess: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/lib/auth/giving-permissions", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/giving-permissions")
  >("@/lib/auth/giving-permissions");
  return {
    ...actual,
    getGivingAccess: mocks.getGivingAccess,
    requireStatementViewAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canViewStatements) throw new Error("denied");
      return access;
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    household: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => {
        const household = store.households.find(
          (row) =>
            row.id === where.id && row.organizationId === where.organizationId,
        );
        if (!household) return null;
        return {
          id: household.id,
          displayName: household.displayName,
          mailingAddressLine1: household.mailingAddressLine1,
          mailingAddressLine2: household.mailingAddressLine2,
          city: household.city,
          state: household.state,
          postalCode: household.postalCode,
          country: household.country,
          preferredStatementRecipient:
            household.preferredFirstName && household.preferredLastName
              ? {
                  firstName: household.preferredFirstName,
                  lastName: household.preferredLastName,
                }
              : null,
        };
      },
      findMany: async ({
        where,
      }: {
        where: { organizationId: string };
      }) =>
        store.households
          .filter((row) => row.organizationId === where.organizationId)
          .map((row) => ({ id: row.id, displayName: row.displayName })),
    },
    householdMembership: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          householdId: string;
          startDate: { lt: Date };
          OR: Array<{ endDate: null } | { endDate: { gte: Date } }>;
          donor: { organizationId: string };
        };
      }) => {
        const yearEnd = where.startDate.lt;
        const yearStartEntry = where.OR.find(
          (entry): entry is { endDate: { gte: Date } } =>
            typeof entry.endDate === "object" &&
            entry.endDate !== null &&
            "gte" in entry.endDate,
        );
        const yearStart = yearStartEntry?.endDate.gte ?? new Date(0);
        return store.memberships
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (row.householdId !== where.householdId) return false;
            if (row.donorOrganizationId !== where.donor.organizationId) {
              return false;
            }
            if (row.startDate >= yearEnd) return false;
            if (row.endDate != null && row.endDate < yearStart) return false;
            return true;
          })
          .map((row) => ({
            startDate: row.startDate,
            endDate: row.endDate,
            donor: {
              id: row.donorId,
              firstName: row.firstName,
              lastName: row.lastName,
            },
          }));
      },
    },
    donation: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          isTest: boolean;
          anonymous: boolean;
          donorId: { in: string[] };
          offeringDate: { gte: Date; lt: Date };
        };
        select: Record<string, unknown>;
      }) => {
        store.lastDonationQuery = { where, select };
        return store.donations
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.isTest === where.isTest &&
              row.anonymous === where.anonymous &&
              where.donorId.in.includes(row.donorId) &&
              row.offeringDate >= where.offeringDate.gte &&
              row.offeringDate < where.offeringDate.lt,
          )
          .map((row) => ({
            donorId: row.donorId,
            offeringDate: row.offeringDate,
            totalAmount: row.totalAmount,
            deductibleAmount: row.deductibleAmount,
            allocations: row.allocations
              .filter((allocation) => {
                const allocationWhere = (
                  select.allocations as {
                    where?: {
                      organizationId?: string;
                      offeringType?: { organizationId?: string };
                    };
                  }
                ).where;
                return (
                  allocation.organizationId ===
                    (allocationWhere?.organizationId ?? where.organizationId) &&
                  allocation.offeringTypeOrganizationId ===
                    (allocationWhere?.offeringType?.organizationId ??
                      where.organizationId)
                );
              })
              .map((allocation) => ({
                amount: allocation.amount,
                offeringType: { name: allocation.fundName },
              })),
          }));
      },
    },
    contributionStatement: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          statementType: StatementType;
          householdId: string;
          OR: Array<
            | { taxYear: number }
            | { taxYear: null; periodStart: { gte: Date; lt: Date } }
          >;
        };
      }) => {
        const year =
          where.OR[0] &&
          "taxYear" in where.OR[0] &&
          typeof where.OR[0].taxYear === "number"
            ? where.OR[0].taxYear
            : null;
        const period = where.OR.find((entry) => "periodStart" in entry) as
          | { periodStart: { gte: Date; lt: Date } }
          | undefined;
        return store.statements
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (row.statementType !== where.statementType) return false;
            if (row.householdId !== where.householdId) return false;
            if (year != null && row.taxYear === year) return true;
            return (
              row.taxYear == null &&
              period != null &&
              row.periodStart >= period.periodStart.gte &&
              row.periodStart < period.periodStart.lt
            );
          })
          .map((row) => ({
            id: row.id,
            status: row.status,
            statementIdentifier: row.statementIdentifier,
            generatedByUserAccountId: row.generatedByUserAccountId,
          }));
      },
    },
  },
}));

import {
  HouseholdStatementPreviewError,
  getHouseholdStatementPreview,
  listHouseholdsForStatementPreview,
} from "./household-statement-preview.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-00000000e001";
const STMT_HH = "00000000-0000-4000-8000-00000000b011";
const STMT_PUB = "00000000-0000-4000-8000-00000000b012";
const OTHER_HOUSEHOLD = "00000000-0000-4000-8000-00000000e002";
const DONOR_ANN = "00000000-0000-4000-8000-00000000d001";
const DONOR_BEN = "00000000-0000-4000-8000-00000000d002";
const DONOR_CARA = "00000000-0000-4000-8000-00000000d003";
const NOW = new Date("2026-09-11T16:00:00.000Z");

function seedHouseholdPreview() {
  store.households = [
    {
      id: HOUSEHOLD_ID,
      organizationId: ORG_ID,
      displayName: "Adams Household",
      mailingAddressLine1: "10 Oak St",
      mailingAddressLine2: null,
      city: "Townville",
      state: "TN",
      postalCode: "37000",
      country: "US",
      preferredFirstName: "Ann",
      preferredLastName: "Adams",
    },
    {
      id: OTHER_HOUSEHOLD,
      organizationId: OTHER_ORG,
      displayName: "Other Household",
      mailingAddressLine1: "99 Other Rd",
      mailingAddressLine2: null,
      city: "Elsewhere",
      state: "ME",
      postalCode: "04000",
      country: "US",
      preferredFirstName: "Other",
      preferredLastName: "Church",
    },
  ];
  store.memberships = [
    {
      organizationId: ORG_ID,
      householdId: HOUSEHOLD_ID,
      donorId: DONOR_ANN,
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      endDate: null,
      donorOrganizationId: ORG_ID,
      firstName: "Ann",
      lastName: "Adams",
    },
    {
      organizationId: ORG_ID,
      householdId: HOUSEHOLD_ID,
      donorId: DONOR_BEN,
      startDate: new Date("2024-01-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
      donorOrganizationId: ORG_ID,
      firstName: "Ben",
      lastName: "Brown",
    },
    {
      organizationId: ORG_ID,
      householdId: HOUSEHOLD_ID,
      donorId: DONOR_CARA,
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: null,
      donorOrganizationId: ORG_ID,
      firstName: "Cara",
      lastName: "Cole",
    },
  ];
  store.donations = [
    {
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      isTest: false,
      anonymous: false,
      offeringDate: new Date("2026-02-01T00:00:00.000Z"),
      totalAmount: "100.00",
      deductibleAmount: "90.00",
      checkNumber: "1234",
      note: "internal memo",
      stripePaymentIntentId: "pi_secret",
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "60.00",
          fundName: "Tithe",
        },
        {
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "40.00",
          fundName: "Missions",
        },
      ],
    },
    {
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      isTest: false,
      anonymous: true,
      offeringDate: new Date("2026-02-15T00:00:00.000Z"),
      totalAmount: "45.00",
      deductibleAmount: "45.00",
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "45.00",
          fundName: "Tithe",
        },
      ],
    },
    {
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      isTest: true,
      anonymous: false,
      offeringDate: new Date("2026-03-01T00:00:00.000Z"),
      totalAmount: "999.00",
      deductibleAmount: "999.00",
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "999.00",
          fundName: "Test Fund",
        },
      ],
    },
    {
      organizationId: ORG_ID,
      donorId: DONOR_BEN,
      isTest: false,
      anonymous: false,
      offeringDate: new Date("2026-03-31T00:00:00.000Z"),
      totalAmount: "20.00",
      deductibleAmount: "20.00",
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "20.00",
          fundName: "Tithe",
        },
      ],
    },
    {
      organizationId: ORG_ID,
      donorId: DONOR_BEN,
      isTest: false,
      anonymous: false,
      offeringDate: new Date("2026-04-15T00:00:00.000Z"),
      totalAmount: "50.00",
      deductibleAmount: "50.00",
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "50.00",
          fundName: "Tithe",
        },
      ],
    },
    {
      organizationId: ORG_ID,
      donorId: DONOR_CARA,
      isTest: false,
      anonymous: false,
      offeringDate: new Date("2026-06-01T00:00:00.000Z"),
      totalAmount: "30.00",
      deductibleAmount: "30.00",
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "30.00",
          fundName: "Tithe",
        },
      ],
    },
    {
      organizationId: ORG_ID,
      donorId: DONOR_CARA,
      isTest: false,
      anonymous: false,
      offeringDate: new Date("2026-07-01T00:00:00.000Z"),
      totalAmount: "15.00",
      deductibleAmount: "15.00",
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "15.00",
          fundName: "Missions",
        },
      ],
    },
    {
      organizationId: OTHER_ORG,
      donorId: DONOR_ANN,
      isTest: false,
      anonymous: false,
      offeringDate: new Date("2026-05-01T00:00:00.000Z"),
      totalAmount: "80.00",
      deductibleAmount: "80.00",
      allocations: [
        {
          organizationId: OTHER_ORG,
          offeringTypeOrganizationId: OTHER_ORG,
          amount: "80.00",
          fundName: "Other Tithe",
        },
      ],
    },
  ];
  store.statements = [
    {
      id: STMT_HH,
      organizationId: ORG_ID,
      householdId: HOUSEHOLD_ID,
      statementType: StatementType.HOUSEHOLD,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.GENERATED,
      statementIdentifier: "HH-2026-ADAMS",
      generatedByUserAccountId: USER_ID,
    },
    {
      id: "00000000-0000-4000-8000-00000000b013",
      organizationId: ORG_ID,
      householdId: HOUSEHOLD_ID,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.PUBLISHED,
      statementIdentifier: "IND-SHOULD-IGNORE",
      generatedByUserAccountId: USER_ID,
    },
  ];
  store.organization = {
    id: ORG_ID,
    name: "First United Pentecostal Church",
    displayName: "First UPC",
    mailingAddressLine1: "100 Church St",
    mailingAddressLine2: null,
    city: "Saco",
    state: "ME",
    postalCode: "04072",
    country: "US",
    ein: "12-3456789",
    statementFooterText: "No goods or services were provided.",
  };
}

describe("household statement preview", () => {
  beforeEach(() => {
    seedHouseholdPreview();
    store.lastDonationQuery = null;
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockImplementation(
      async () => store.organization,
    );
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
  });

  it("rejects signed-out users", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      getHouseholdStatementPreview(HOUSEHOLD_ID, "2026", NOW),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
  });

  it.each([RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s from household statement preview",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      await expect(
        getHouseholdStatementPreview(HOUSEHOLD_ID, "2026", NOW),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it("returns not-found for a household in another organization", async () => {
    await expect(
      getHouseholdStatementPreview(OTHER_HOUSEHOLD, "2026", NOW),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns not-found for an invalid household id", async () => {
    await expect(
      getHouseholdStatementPreview("not-a-uuid", "2026", NOW),
    ).rejects.toBeInstanceOf(HouseholdStatementPreviewError);
  });

  it("includes gifts only while the donor’s household membership covers the offering date", async () => {
    const result = await getHouseholdStatementPreview(HOUSEHOLD_ID, "2026", NOW);
    expect(result.household.includedDonors.map((row) => row.displayName)).toEqual([
      "Ann Adams",
      "Ben Brown",
      "Cara Cole",
    ]);
    expect(result.giftCount).toBe(3);
    expect(result.deductibleTotal).toBe("125.00");
    expect(result.lines.map((line) => line.deductibleAmount).sort()).toEqual([
      "15.00",
      "20.00",
      "36.00",
      "54.00",
    ].sort());
    expect(JSON.stringify(result)).not.toMatch(
      /999\.00|50\.00|30\.00|80\.00|45\.00|1234|internal memo|pi_secret|12-3456789|CHECK|stripe/i,
    );
  });

  it("excludes test gifts and other-organization donations", async () => {
    const result = await getHouseholdStatementPreview(HOUSEHOLD_ID, "2026", NOW);
    expect(result.deductibleTotal).not.toBe("999.00");
    expect(store.lastDonationQuery).toMatchObject({
      where: {
        organizationId: ORG_ID,
        isTest: false,
        anonymous: false,
      },
    });
    expect(JSON.stringify(store.lastDonationQuery)).not.toMatch(
      /checkNumber|note|paymentMethod|stripe/i,
    );
  });

  it("does not double-count multi-fund allocations in the deductible total", async () => {
    store.memberships = store.memberships.filter(
      (row) => row.donorId === DONOR_ANN,
    );
    store.donations = store.donations.filter(
      (row) =>
        row.donorId === DONOR_ANN && row.isTest === false && row.anonymous === false,
    );
    const result = await getHouseholdStatementPreview(HOUSEHOLD_ID, "2026", NOW);
    expect(result.giftCount).toBe(1);
    expect(result.deductibleTotal).toBe("90.00");
    expect(result.deductibleTotal).not.toBe("100.00");
    expect(sumMoneyAmounts(result.lines.map((line) => line.deductibleAmount))).toBe(
      "90.00",
    );
  });

  it("returns the existing household statement status and identifier", async () => {
    const result = await getHouseholdStatementPreview(HOUSEHOLD_ID, "2026", NOW);
    expect(result.canManageStatements).toBe(true);
    expect(result.viewerUserAccountId).toBe(USER_ID);
    expect(result.statement).toEqual({
      exists: true,
      id: STMT_HH,
      status: StatementStatus.GENERATED,
      statementIdentifier: "HH-2026-ADAMS",
      generatedByUserAccountId: USER_ID,
    });
    expect(result.household.preferredStatementRecipient).toEqual({
      displayName: "Ann Adams",
    });
  });

  it("prefers a published household statement over generated or voided", async () => {
    store.statements.push({
      id: STMT_PUB,
      organizationId: ORG_ID,
      householdId: HOUSEHOLD_ID,
      statementType: StatementType.HOUSEHOLD,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.PUBLISHED,
      statementIdentifier: "HH-2026-PUB",
      generatedByUserAccountId: USER_ID,
    });
    const result = await getHouseholdStatementPreview(HOUSEHOLD_ID, "2026", NOW);
    expect(result.statement).toEqual({
      exists: true,
      id: STMT_PUB,
      status: StatementStatus.PUBLISHED,
      statementIdentifier: "HH-2026-PUB",
      generatedByUserAccountId: USER_ID,
    });
  });

  it("filters members and gifts to the selected calendar year", async () => {
    const result = await getHouseholdStatementPreview(HOUSEHOLD_ID, "2025", NOW);
    expect(result.year).toBe(2025);
    expect(result.household.includedDonors.map((row) => row.displayName)).toEqual([
      "Ann Adams",
      "Ben Brown",
    ]);
    expect(result.giftCount).toBe(0);
  });

  it("lists only current-organization households for preview links", async () => {
    const rows = await listHouseholdsForStatementPreview();
    expect(rows).toEqual([{ id: HOUSEHOLD_ID, displayName: "Adams Household" }]);
  });
});
