import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RoleCode,
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

type DonationRow = {
  organizationId: string;
  donorId: string | null;
  isTest: boolean;
  anonymous?: boolean;
  offeringDate: Date;
  totalAmount: string;
};

type DonorRow = {
  id: string;
  organizationId: string;
  mailingAddressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

type MembershipRow = {
  organizationId: string;
  householdId: string;
  donorId: string;
  startDate: Date;
  endDate: Date | null;
  mailingAddressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  householdOrganizationId: string;
  donorOrganizationId: string;
};

type StatementRow = {
  organizationId: string;
  statementType: StatementType;
  taxYear: number | null;
  periodStart: Date;
  status: StatementStatus;
};

type OrganizationRow = {
  id: string;
  name: string;
  displayName: string | null;
  ein: string | null;
  mailingAddressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  statementFooterText: string | null;
};

const store = vi.hoisted(() => ({
  donations: [] as DonationRow[],
  donors: [] as DonorRow[],
  memberships: [] as MembershipRow[],
  statements: [] as StatementRow[],
  organization: null as OrganizationRow | null,
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

function officialRows(where: {
  organizationId: string;
  isTest: boolean;
  offeringDate: { gte: Date; lt: Date };
  donorId?: { not: null } | { in: string[] };
  anonymous?: boolean;
}) {
  return store.donations.filter((row) => {
    if (row.organizationId !== where.organizationId) return false;
    if (row.isTest !== where.isTest) return false;
    if (row.offeringDate < where.offeringDate.gte) return false;
    if (row.offeringDate >= where.offeringDate.lt) return false;
    if (where.donorId && "not" in where.donorId && row.donorId == null) {
      return false;
    }
    if (
      where.donorId &&
      "in" in where.donorId &&
      (row.donorId == null || !where.donorId.in.includes(row.donorId))
    ) {
      return false;
    }
    if (where.anonymous === false && row.anonymous) return false;
    return true;
  });
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    donation: {
      aggregate: async ({
        where,
      }: {
        where: {
          organizationId: string;
          isTest: boolean;
          offeringDate: { gte: Date; lt: Date };
        };
      }) => {
        const rows = officialRows(where);
        const total = rows.reduce((sum, row) => sum + Number(row.totalAmount), 0);
        return {
          _count: { _all: rows.length },
          _sum: { totalAmount: { toString: () => total.toFixed(2) } },
        };
      },
      groupBy: async ({
        where,
      }: {
        where: {
          organizationId: string;
          isTest: boolean;
          donorId: { not: null };
          offeringDate: { gte: Date; lt: Date };
        };
      }) => {
        const grouped = new Map<string, number>();
        for (const row of officialRows(where)) {
          if (!row.donorId) continue;
          grouped.set(row.donorId, (grouped.get(row.donorId) ?? 0) + 1);
        }
        return [...grouped.entries()].map(([donorId, count]) => ({
          donorId,
          _count: { _all: count },
        }));
      },
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          isTest: boolean;
          anonymous: boolean;
          donorId: { in: string[] };
          offeringDate: { gte: Date; lt: Date };
        };
      }) =>
        officialRows({ ...where, anonymous: where.anonymous }),
    },
    donor: {
      findMany: async ({
        where,
      }: {
        where: { id: { in: string[] }; organizationId: string };
      }) =>
        store.donors
          .filter(
            (donor) =>
              donor.organizationId === where.organizationId &&
              where.id.in.includes(donor.id),
          )
          .map((donor) => ({
            mailingAddressLine1: donor.mailingAddressLine1,
            city: donor.city,
            state: donor.state,
            postalCode: donor.postalCode,
          })),
    },
    householdMembership: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          startDate: { lt: Date };
          OR: Array<{ endDate: null } | { endDate: { gte: Date } }>;
          household: { organizationId: string };
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
            if (row.householdOrganizationId !== where.household.organizationId) {
              return false;
            }
            if (row.donorOrganizationId !== where.donor.organizationId) {
              return false;
            }
            if (row.startDate >= yearEnd) return false;
            if (row.endDate != null && row.endDate < yearStart) return false;
            return true;
          })
          .map((row) => ({
            householdId: row.householdId,
            donorId: row.donorId,
            startDate: row.startDate,
            endDate: row.endDate,
            household: {
              mailingAddressLine1: row.mailingAddressLine1,
              city: row.city,
              state: row.state,
              postalCode: row.postalCode,
            },
          }));
      },
    },
    contributionStatement: {
      groupBy: async ({
        where,
      }: {
        where: {
          organizationId: string;
          OR: Array<
            | { taxYear: number }
            | { taxYear: null; periodStart: { gte: Date; lt: Date } }
          >;
        };
      }) => {
        const taxYear =
          where.OR[0] &&
          "taxYear" in where.OR[0] &&
          typeof where.OR[0].taxYear === "number"
            ? where.OR[0].taxYear
            : null;
        const period = where.OR.find((entry) => "periodStart" in entry) as
          | { periodStart: { gte: Date; lt: Date } }
          | undefined;
        const rows = store.statements.filter((row) => {
          if (row.organizationId !== where.organizationId) return false;
          if (taxYear != null && row.taxYear === taxYear) return true;
          return (
            row.taxYear == null &&
            period != null &&
            row.periodStart >= period.periodStart.gte &&
            row.periodStart < period.periodStart.lt
          );
        });
        const grouped = new Map<string, { type: StatementType; status: StatementStatus; count: number }>();
        for (const row of rows) {
          const key = `${row.statementType}:${row.status}`;
          const current = grouped.get(key) ?? {
            type: row.statementType,
            status: row.status,
            count: 0,
          };
          current.count += 1;
          grouped.set(key, current);
        }
        return [...grouped.values()].map((row) => ({
          statementType: row.type,
          status: row.status,
          _count: { _all: row.count },
        }));
      },
    },
  },
}));

import {
  StatementRunReviewError,
  getStatementRunReview,
} from "./statement-run-review.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ANN = "00000000-0000-4000-8000-00000000d001";
const DONOR_BEN = "00000000-0000-4000-8000-00000000d002";
const DONOR_CARA = "00000000-0000-4000-8000-00000000d003";
const HH_ADAMS = "00000000-0000-4000-8000-00000000e001";
const HH_BROWN = "00000000-0000-4000-8000-00000000e002";
const HH_COLE = "00000000-0000-4000-8000-00000000e003";
const HH_OTHER = "00000000-0000-4000-8000-00000000e004";
const NOW = new Date("2026-09-11T16:00:00.000Z");

function seedRunReview() {
  store.donations = [
    {
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      isTest: false,
      offeringDate: new Date("2026-02-01T00:00:00.000Z"),
      totalAmount: "25.00",
    },
    {
      organizationId: ORG_ID,
      donorId: DONOR_BEN,
      isTest: false,
      offeringDate: new Date("2026-06-01T00:00:00.000Z"),
      totalAmount: "10.00",
    },
    {
      organizationId: ORG_ID,
      donorId: DONOR_CARA,
      isTest: false,
      offeringDate: new Date("2026-02-15T00:00:00.000Z"),
      totalAmount: "15.00",
    },
    {
      organizationId: ORG_ID,
      donorId: null,
      isTest: false,
      offeringDate: new Date("2026-03-01T00:00:00.000Z"),
      totalAmount: "5.00",
    },
    {
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      isTest: true,
      offeringDate: new Date("2026-04-01T00:00:00.000Z"),
      totalAmount: "999.00",
    },
    {
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      isTest: false,
      offeringDate: new Date("2025-12-31T00:00:00.000Z"),
      totalAmount: "50.00",
    },
    {
      organizationId: OTHER_ORG,
      donorId: DONOR_ANN,
      isTest: false,
      offeringDate: new Date("2026-05-01T00:00:00.000Z"),
      totalAmount: "80.00",
    },
  ];
  store.donors = [
    {
      id: DONOR_ANN,
      organizationId: ORG_ID,
      mailingAddressLine1: "10 Oak St",
      city: "Townville",
      state: "TN",
      postalCode: "37000",
    },
    {
      id: DONOR_BEN,
      organizationId: ORG_ID,
      mailingAddressLine1: "11 Oak St",
      city: "",
      state: "TN",
      postalCode: "37000",
    },
    {
      id: DONOR_CARA,
      organizationId: ORG_ID,
      mailingAddressLine1: "12 Oak St",
      city: "Townville",
      state: "TN",
      postalCode: "37000",
    },
  ];
  store.memberships = [
    {
      organizationId: ORG_ID,
      householdId: HH_ADAMS,
      donorId: DONOR_ANN,
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      endDate: null,
      mailingAddressLine1: "10 Oak St",
      city: "Townville",
      state: "TN",
      postalCode: "37000",
      householdOrganizationId: ORG_ID,
      donorOrganizationId: ORG_ID,
    },
    {
      organizationId: ORG_ID,
      householdId: HH_BROWN,
      donorId: DONOR_BEN,
      startDate: new Date("2024-01-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
      mailingAddressLine1: "11 Oak St",
      city: "",
      state: "TN",
      postalCode: "37000",
      householdOrganizationId: ORG_ID,
      donorOrganizationId: ORG_ID,
    },
    {
      organizationId: ORG_ID,
      householdId: HH_COLE,
      donorId: DONOR_CARA,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: null,
      mailingAddressLine1: "12 Oak St",
      city: "",
      state: "TN",
      postalCode: "37000",
      householdOrganizationId: ORG_ID,
      donorOrganizationId: ORG_ID,
    },
    {
      organizationId: OTHER_ORG,
      householdId: HH_OTHER,
      donorId: DONOR_ANN,
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      endDate: null,
      mailingAddressLine1: "99 Other Rd",
      city: "Elsewhere",
      state: "ME",
      postalCode: "04000",
      householdOrganizationId: OTHER_ORG,
      donorOrganizationId: OTHER_ORG,
    },
  ];
  store.statements = [
    {
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.GENERATED,
    },
    {
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.PUBLISHED,
    },
    {
      organizationId: ORG_ID,
      statementType: StatementType.HOUSEHOLD,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.VOIDED,
    },
    {
      organizationId: ORG_ID,
      statementType: StatementType.HOUSEHOLD,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.GENERATED,
    },
    {
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2025,
      periodStart: new Date("2025-01-01T00:00:00.000Z"),
      status: StatementStatus.VOIDED,
    },
    {
      organizationId: OTHER_ORG,
      statementType: StatementType.HOUSEHOLD,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.PUBLISHED,
    },
  ];
  store.organization = {
    id: ORG_ID,
    name: "First United Pentecostal Church",
    displayName: "First UPC",
    ein: "12-3456789",
    mailingAddressLine1: "100 Church St",
    city: "Townville",
    state: "TN",
    postalCode: "37000",
    statementFooterText: "No goods or services were provided.",
  };
}

describe("statement run review", () => {
  beforeEach(() => {
    seedRunReview();
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
    await expect(getStatementRunReview("2026", NOW)).rejects.toMatchObject({
      code: "SIGNED_OUT",
    });
  });

  it.each([RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s from statement run review",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      await expect(getStatementRunReview("2026", NOW)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    },
  );

  it("rejects a missing organization", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(getStatementRunReview("2026", NOW)).rejects.toBeInstanceOf(
      StatementRunReviewError,
    );
  });

  it("excludes test gifts, other organizations, and out-of-year gifts", async () => {
    const result = await getStatementRunReview("2026", NOW);
    expect(result.year).toBe(2026);
    expect(result.giving.donationCount).toBe(4);
    expect(result.giving.donationTotal).toBe("55.00");
    expect(result.individual.recipientCount).toBe(3);
    expect(result.individual.missingAddressCount).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/999\.00|80\.00|Oak St|99 Other/i);
  });

  it("counts households with official giving using membership dates", async () => {
    const result = await getStatementRunReview("2026", NOW);
    expect(result.household.recipientCount).toBe(2);
    expect(result.household.missingAddressCount).toBe(1);
  });

  it("groups existing statements by type and status for the selected year", async () => {
    const result = await getStatementRunReview("2026", NOW);
    expect(result.individual.statements).toEqual({
      generated: 1,
      published: 1,
      voided: 0,
    });
    expect(result.household.statements).toEqual({
      generated: 1,
      published: 0,
      voided: 1,
    });
  });

  it("filters statement counts and giving to the selected calendar year", async () => {
    const result = await getStatementRunReview("2025", NOW);
    expect(result.year).toBe(2025);
    expect(result.giving.donationCount).toBe(1);
    expect(result.giving.donationTotal).toBe("50.00");
    expect(result.individual.recipientCount).toBe(1);
    expect(result.household.recipientCount).toBe(1);
    expect(result.individual.statements).toEqual({
      generated: 0,
      published: 0,
      voided: 1,
    });
    expect(result.household.statements).toEqual({
      generated: 0,
      published: 0,
      voided: 0,
    });
  });

  it("falls back to the current year when the query is invalid", async () => {
    const result = await getStatementRunReview("1999", NOW);
    expect(result.year).toBe(2026);
  });
});
