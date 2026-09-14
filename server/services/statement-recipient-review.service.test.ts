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
  offeringDate: Date;
  totalAmount: string;
};

type DonorRow = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  mailingAddressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

type StatementRow = {
  organizationId: string;
  donorId: string;
  statementType: StatementType;
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
  } as { id: string; name: string; displayName: string | null } | null,
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
        const rows = store.donations.filter(
          (row) =>
            row.organizationId === where.organizationId &&
            row.isTest === where.isTest &&
            row.donorId != null &&
            row.offeringDate >= where.offeringDate.gte &&
            row.offeringDate < where.offeringDate.lt,
        );
        const grouped = new Map<string, { count: number; total: number }>();
        for (const row of rows) {
          const current = grouped.get(row.donorId!) ?? { count: 0, total: 0 };
          current.count += 1;
          current.total += Number(row.totalAmount);
          grouped.set(row.donorId!, current);
        }
        return [...grouped.entries()].map(([donorId, value]) => ({
          donorId,
          _count: { _all: value.count },
          _sum: { totalAmount: { toString: () => value.total.toFixed(2) } },
        }));
      },
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
            id: donor.id,
            firstName: donor.firstName,
            lastName: donor.lastName,
            email: donor.email,
            mailingAddressLine1: donor.mailingAddressLine1,
            city: donor.city,
            state: donor.state,
            postalCode: donor.postalCode,
          })),
    },
    contributionStatement: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          statementType: StatementType;
          donorId: { in: string[] };
          OR: Array<
            | { taxYear: number }
            | { taxYear: null; periodStart: { gte: Date; lt: Date } }
          >;
        };
      }) => {
        const year =
          where.OR[0] && "taxYear" in where.OR[0] && typeof where.OR[0].taxYear === "number"
            ? where.OR[0].taxYear
            : null;
        const period = where.OR.find((entry) => "periodStart" in entry) as
          | { periodStart: { gte: Date; lt: Date } }
          | undefined;
        return store.statements
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (row.statementType !== where.statementType) return false;
            if (!where.donorId.in.includes(row.donorId)) return false;
            if (year != null && row.taxYear === year) return true;
            return (
              row.taxYear == null &&
              period != null &&
              row.periodStart >= period.periodStart.gte &&
              row.periodStart < period.periodStart.lt
            );
          })
          .map((row) => ({ donorId: row.donorId, status: row.status }));
      },
    },
  },
}));

import {
  StatementRecipientReviewError,
  getStatementRecipientReview,
} from "./statement-recipient-review.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const NOW = new Date("2026-09-11T16:00:00.000Z");

function seedOfficialGiving() {
  store.donations = [
    {
      organizationId: ORG_ID,
      donorId: "donor-ann",
      isTest: false,
      offeringDate: new Date("2026-02-01T00:00:00.000Z"),
      totalAmount: "20.00",
    },
    {
      organizationId: ORG_ID,
      donorId: "donor-ann",
      isTest: false,
      offeringDate: new Date("2026-03-01T00:00:00.000Z"),
      totalAmount: "5.00",
    },
    {
      organizationId: ORG_ID,
      donorId: "donor-ann",
      isTest: true,
      offeringDate: new Date("2026-04-01T00:00:00.000Z"),
      totalAmount: "999.00",
    },
    {
      organizationId: ORG_ID,
      donorId: "donor-ben",
      isTest: false,
      offeringDate: new Date("2026-05-01T00:00:00.000Z"),
      totalAmount: "15.00",
    },
    {
      organizationId: ORG_ID,
      donorId: null,
      isTest: false,
      offeringDate: new Date("2026-06-01T00:00:00.000Z"),
      totalAmount: "40.00",
    },
    {
      organizationId: OTHER_ORG,
      donorId: "donor-other",
      isTest: false,
      offeringDate: new Date("2026-07-01T00:00:00.000Z"),
      totalAmount: "80.00",
    },
  ];
  store.donors = [
    {
      id: "donor-ann",
      organizationId: ORG_ID,
      firstName: "Ann",
      lastName: "Adams",
      email: "ann@example.com",
      mailingAddressLine1: "10 Oak St",
      city: "Townville",
      state: "TN",
      postalCode: "37000",
    },
    {
      id: "donor-ben",
      organizationId: ORG_ID,
      firstName: "Ben",
      lastName: "Brown",
      email: "ben@example.com",
      mailingAddressLine1: "11 Oak St",
      city: "",
      state: "TN",
      postalCode: "37000",
    },
    {
      id: "donor-other",
      organizationId: OTHER_ORG,
      firstName: "Other",
      lastName: "Church",
      email: "other@example.com",
      mailingAddressLine1: null,
      city: null,
      state: null,
      postalCode: null,
    },
  ];
  store.statements = [
    {
      organizationId: ORG_ID,
      donorId: "donor-ann",
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.PUBLISHED,
    },
    {
      organizationId: ORG_ID,
      donorId: "donor-ben",
      statementType: StatementType.HOUSEHOLD,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.GENERATED,
    },
  ];
}

describe("statement recipient review", () => {
  beforeEach(() => {
    seedOfficialGiving();
    store.organization = {
      id: ORG_ID,
      name: "First United Pentecostal Church",
      displayName: "First UPC",
    };
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockImplementation(async () => store.organization);
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
  });

  it("rejects signed-out users", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getStatementRecipientReview({}, NOW)).rejects.toMatchObject({
      code: "SIGNED_OUT",
    });
  });

  it.each([RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s from recipient review",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(role));
      await expect(getStatementRecipientReview({}, NOW)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    },
  );

  it("excludes test gifts, unmatched gifts, and other organizations", async () => {
    const result = await getStatementRecipientReview({ year: "2026" }, NOW);
    expect(result.recipientCount).toBe(2);
    expect(result.missingAddressCount).toBe(1);
    expect(result.recipients.map((row) => row.displayName)).toEqual([
      "Ann Adams",
      "Ben Brown",
    ]);
    expect(result.recipients[0]).toMatchObject({
      officialTotal: "25.00",
      giftCount: 2,
      mailingAddressComplete: true,
      statement: { exists: true, status: StatementStatus.PUBLISHED },
    });
    expect(result.recipients[1]).toMatchObject({
      officialTotal: "15.00",
      giftCount: 1,
      mailingAddressComplete: false,
      statement: { exists: false, status: null },
    });
    expect(JSON.stringify(result.recipients)).not.toMatch(
      /999.00|Oak St|CHECK|stripe|pi_|other@example.com/i,
    );
  });

  it("filters recipients missing a mailing address", async () => {
    const result = await getStatementRecipientReview(
      { year: "2026", address: "missing" },
      NOW,
    );
    expect(result.recipientCount).toBe(2);
    expect(result.total).toBe(1);
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0]?.displayName).toBe("Ben Brown");
  });

  it("shows an existing individual statement status", async () => {
    store.statements.push({
      organizationId: ORG_ID,
      donorId: "donor-ben",
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.GENERATED,
    });
    const result = await getStatementRecipientReview({ year: "2026" }, NOW);
    const ben = result.recipients.find((row) => row.displayName === "Ben Brown");
    expect(ben?.statement).toEqual({
      exists: true,
      status: StatementStatus.GENERATED,
    });
  });

  it("rejects a missing organization", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(getStatementRecipientReview({}, NOW)).rejects.toBeInstanceOf(
      StatementRecipientReviewError,
    );
  });
});
