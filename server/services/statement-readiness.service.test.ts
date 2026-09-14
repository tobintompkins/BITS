import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode, StatementStatus } from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

type DonationRow = {
  organizationId: string;
  donorId: string | null;
  isTest: boolean;
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

type StatementRow = {
  organizationId: string;
  taxYear: number | null;
  periodStart: Date;
  status: StatementStatus;
};

const store = vi.hoisted(() => ({
  donations: [] as DonationRow[],
  donors: [] as DonorRow[],
  statements: [] as StatementRow[],
  organization: {
    id: "00000000-0000-4000-8000-00000000a001",
    name: "First United Pentecostal Church",
    displayName: "First UPC",
    ein: "12-3456789",
    mailingAddressLine1: "100 Church St",
    city: "Townville",
    state: "TN",
    postalCode: "37000",
    statementFooterText: "No goods or services were provided.",
  } as {
    id: string;
    name: string;
    displayName: string | null;
    ein: string | null;
    mailingAddressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    statementFooterText: string | null;
  } | null,
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
        const rows = store.donations.filter(
          (row) =>
            row.organizationId === where.organizationId &&
            row.isTest === where.isTest &&
            row.offeringDate >= where.offeringDate.gte &&
            row.offeringDate < where.offeringDate.lt,
        );
        const total = rows.reduce(
          (sum, row) => sum + Number(row.totalAmount),
          0,
        );
        return {
          _count: { _all: rows.length },
          _sum: { totalAmount: { toString: () => total.toFixed(2) } },
        };
      },
    },
    donor: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          donations: {
            some: {
              organizationId: string;
              isTest: boolean;
              offeringDate: { gte: Date; lt: Date };
            };
          };
        };
      }) => {
        const giftFilter = where.donations.some;
        const givingDonorIds = new Set(
          store.donations
            .filter(
              (row) =>
                row.organizationId === giftFilter.organizationId &&
                row.isTest === giftFilter.isTest &&
                row.donorId &&
                row.offeringDate >= giftFilter.offeringDate.gte &&
                row.offeringDate < giftFilter.offeringDate.lt,
            )
            .map((row) => row.donorId),
        );
        return store.donors
          .filter(
            (donor) =>
              donor.organizationId === where.organizationId &&
              givingDonorIds.has(donor.id),
          )
          .map((donor) => ({
            mailingAddressLine1: donor.mailingAddressLine1,
            city: donor.city,
            state: donor.state,
            postalCode: donor.postalCode,
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
        const taxYear = where.OR[0] && "taxYear" in where.OR[0] && typeof where.OR[0].taxYear === "number"
          ? where.OR[0].taxYear
          : null;
        const period = where.OR.find(
          (entry) => "periodStart" in entry,
        ) as { periodStart: { gte: Date; lt: Date } } | undefined;
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
        const counts = new Map<StatementStatus, number>();
        for (const row of rows) {
          counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
        }
        return [...counts.entries()].map(([status, count]) => ({
          status,
          _count: { _all: count },
        }));
      },
    },
  },
}));

import {
  StatementReadinessError,
  getStatementReadiness,
} from "./statement-readiness.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const NOW = new Date("2026-09-11T16:00:00.000Z");

describe("statement readiness service", () => {
  beforeEach(() => {
    store.donations = [
      {
        organizationId: ORG_ID,
        donorId: "donor-complete",
        isTest: false,
        offeringDate: new Date("2026-03-01T00:00:00.000Z"),
        totalAmount: "25.00",
      },
      {
        organizationId: ORG_ID,
        donorId: "donor-missing",
        isTest: false,
        offeringDate: new Date("2026-06-01T00:00:00.000Z"),
        totalAmount: "10.00",
      },
      {
        organizationId: ORG_ID,
        donorId: "donor-complete",
        isTest: true,
        offeringDate: new Date("2026-04-01T00:00:00.000Z"),
        totalAmount: "999.00",
      },
      {
        organizationId: ORG_ID,
        donorId: "donor-complete",
        isTest: false,
        offeringDate: new Date("2025-12-31T00:00:00.000Z"),
        totalAmount: "50.00",
      },
      {
        organizationId: OTHER_ORG,
        donorId: "other-donor",
        isTest: false,
        offeringDate: new Date("2026-05-01T00:00:00.000Z"),
        totalAmount: "80.00",
      },
    ];
    store.donors = [
      {
        id: "donor-complete",
        organizationId: ORG_ID,
        mailingAddressLine1: "10 Oak St",
        city: "Townville",
        state: "TN",
        postalCode: "37000",
      },
      {
        id: "donor-missing",
        organizationId: ORG_ID,
        mailingAddressLine1: "11 Oak St",
        city: "",
        state: "TN",
        postalCode: "37000",
      },
      {
        id: "other-donor",
        organizationId: OTHER_ORG,
        mailingAddressLine1: null,
        city: null,
        state: null,
        postalCode: null,
      },
    ];
    store.statements = [
      {
        organizationId: ORG_ID,
        taxYear: 2026,
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        status: StatementStatus.GENERATED,
      },
      {
        organizationId: ORG_ID,
        taxYear: 2026,
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        status: StatementStatus.PUBLISHED,
      },
      {
        organizationId: ORG_ID,
        taxYear: 2025,
        periodStart: new Date("2025-01-01T00:00:00.000Z"),
        status: StatementStatus.VOIDED,
      },
      {
        organizationId: OTHER_ORG,
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
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockImplementation(async () => store.organization);
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
  });

  it("lets statement viewers load current-organization official giving only", async () => {
    const result = await getStatementReadiness("2026", NOW);
    expect(result.year).toBe(2026);
    expect(result.giving.donationCount).toBe(2);
    expect(result.giving.donationTotal).toBe("35.00");
    expect(result.giving.donorCount).toBe(2);
    expect(result.giving.donorsMissingAddress).toBe(1);
    expect(result.statements).toEqual({
      generated: 1,
      published: 1,
      voided: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(/Oak St|other-donor|999.00/);
    expect(result.checks).toEqual({
      organizationName: true,
      organizationAddress: true,
      ein: true,
      statementFooter: true,
    });
  });

  it("falls back to the current year when the query is invalid", async () => {
    const result = await getStatementReadiness("1999", NOW);
    expect(result.year).toBe(2026);
  });

  it.each([RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s from statement readiness",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(role));
      await expect(getStatementReadiness("2026", NOW)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    },
  );

  it("rejects signed-out users and a missing organization", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getStatementReadiness("2026", NOW)).rejects.toMatchObject({
      code: "SIGNED_OUT",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(getStatementReadiness("2026", NOW)).rejects.toBeInstanceOf(
      StatementReadinessError,
    );
    await expect(getStatementReadiness("2026", NOW)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
