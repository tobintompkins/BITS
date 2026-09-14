import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RoleCode,
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";
import { sumMoneyAmounts } from "@/lib/money/decimal";

type AllocationRow = {
  id: string;
  organizationId: string;
  offeringTypeOrganizationId: string;
  amount: string;
  fundName: string;
};

type DonationRow = {
  id: string;
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

type DonorRow = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  mailingAddressLine1: string | null;
  mailingAddressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

type StatementRow = {
  organizationId: string;
  donorId: string;
  statementType: StatementType;
  taxYear: number | null;
  periodStart: Date;
  status: StatementStatus;
  statementIdentifier: string;
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
  donations: [] as DonationRow[],
  donors: [] as DonorRow[],
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
    donor: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) =>
        store.donors.find(
          (donor) =>
            donor.id === where.id &&
            donor.organizationId === where.organizationId,
        ) ?? null,
    },
    donation: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          donorId: string;
          isTest: boolean;
          anonymous: boolean;
          offeringDate: { gte: Date; lt: Date };
        };
        select: Record<string, unknown>;
      }) => {
        store.lastDonationQuery = { where, select };
        return store.donations
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.donorId === where.donorId &&
              row.isTest === where.isTest &&
              row.anonymous === where.anonymous &&
              row.offeringDate >= where.offeringDate.gte &&
              row.offeringDate < where.offeringDate.lt,
          )
          .map((row) => ({
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
          donorId: string;
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
            if (row.donorId !== where.donorId) return false;
            if (year != null && row.taxYear === year) return true;
            return (
              row.taxYear == null &&
              period != null &&
              row.periodStart >= period.periodStart.gte &&
              row.periodStart < period.periodStart.lt
            );
          })
          .map((row) => ({
            status: row.status,
            statementIdentifier: row.statementIdentifier,
          }));
      },
    },
  },
}));

import {
  IndividualStatementPreviewError,
  getIndividualStatementPreview,
  previewLinesForGift,
} from "./individual-statement-preview.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ANN = "00000000-0000-4000-8000-00000000d001";
const DONOR_OTHER = "00000000-0000-4000-8000-00000000d002";
const NOW = new Date("2026-09-11T16:00:00.000Z");

function seedPreviewData() {
  store.donors = [
    {
      id: DONOR_ANN,
      organizationId: ORG_ID,
      firstName: "Ann",
      lastName: "Adams",
      email: "ann@example.com",
      mailingAddressLine1: "10 Oak St",
      mailingAddressLine2: "Apt 2",
      city: "Townville",
      state: "TN",
      postalCode: "37000",
      country: "US",
    },
    {
      id: DONOR_OTHER,
      organizationId: OTHER_ORG,
      firstName: "Other",
      lastName: "Church",
      email: "other@example.com",
      mailingAddressLine1: "99 Other Rd",
      mailingAddressLine2: null,
      city: "Elsewhere",
      state: "ME",
      postalCode: "04000",
      country: "US",
    },
  ];
  store.donations = [
    {
      id: "gift-multi",
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
          id: "alloc-1",
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "60.00",
          fundName: "Tithe",
        },
        {
          id: "alloc-2",
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "40.00",
          fundName: "Missions",
        },
      ],
    },
    {
      id: "gift-test",
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      isTest: true,
      anonymous: false,
      offeringDate: new Date("2026-03-01T00:00:00.000Z"),
      totalAmount: "999.00",
      deductibleAmount: "999.00",
      allocations: [
        {
          id: "alloc-test",
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "999.00",
          fundName: "Test Fund",
        },
      ],
    },
    {
      id: "gift-anonymous",
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      isTest: false,
      anonymous: true,
      offeringDate: new Date("2026-04-01T00:00:00.000Z"),
      totalAmount: "75.00",
      deductibleAmount: "75.00",
      allocations: [
        {
          id: "alloc-anon",
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "75.00",
          fundName: "Tithe",
        },
      ],
    },
    {
      id: "gift-prior-year",
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      isTest: false,
      anonymous: false,
      offeringDate: new Date("2025-12-31T00:00:00.000Z"),
      totalAmount: "40.00",
      deductibleAmount: "40.00",
      allocations: [
        {
          id: "alloc-2025",
          organizationId: ORG_ID,
          offeringTypeOrganizationId: ORG_ID,
          amount: "40.00",
          fundName: "Tithe",
        },
      ],
    },
    {
      id: "gift-other-org",
      organizationId: OTHER_ORG,
      donorId: DONOR_ANN,
      isTest: false,
      anonymous: false,
      offeringDate: new Date("2026-05-01T00:00:00.000Z"),
      totalAmount: "80.00",
      deductibleAmount: "80.00",
      allocations: [
        {
          id: "alloc-other",
          organizationId: OTHER_ORG,
          offeringTypeOrganizationId: OTHER_ORG,
          amount: "80.00",
          fundName: "Other Tithe",
        },
      ],
    },
    {
      id: "gift-other-donor",
      organizationId: OTHER_ORG,
      donorId: DONOR_OTHER,
      isTest: false,
      anonymous: false,
      offeringDate: new Date("2026-06-01T00:00:00.000Z"),
      totalAmount: "200.00",
      deductibleAmount: "200.00",
      allocations: [
        {
          id: "alloc-other-donor",
          organizationId: OTHER_ORG,
          offeringTypeOrganizationId: OTHER_ORG,
          amount: "200.00",
          fundName: "Other Tithe",
        },
      ],
    },
  ];
  store.statements = [
    {
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.GENERATED,
      statementIdentifier: "STMT-2026-ANN",
    },
    {
      organizationId: OTHER_ORG,
      donorId: DONOR_ANN,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.PUBLISHED,
      statementIdentifier: "STMT-OTHER",
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

describe("individual statement preview", () => {
  beforeEach(() => {
    seedPreviewData();
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
      getIndividualStatementPreview(DONOR_ANN, "2026", NOW),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
  });

  it.each([RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s from individual statement preview",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      await expect(
        getIndividualStatementPreview(DONOR_ANN, "2026", NOW),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it("returns not-found for a donor in another organization", async () => {
    await expect(
      getIndividualStatementPreview(DONOR_OTHER, "2026", NOW),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns not-found for an invalid donor id", async () => {
    await expect(
      getIndividualStatementPreview("not-a-uuid", "2026", NOW),
    ).rejects.toBeInstanceOf(IndividualStatementPreviewError);
  });

  it("excludes test gifts, anonymous gifts, other organizations, and payment details", async () => {
    const result = await getIndividualStatementPreview(DONOR_ANN, "2026", NOW);
    expect(result.giftCount).toBe(1);
    expect(result.deductibleTotal).toBe("90.00");
    expect(result.lines).toEqual([
      {
        offeringDate: new Date("2026-02-01T00:00:00.000Z"),
        fundName: "Missions",
        deductibleAmount: "36.00",
      },
      {
        offeringDate: new Date("2026-02-01T00:00:00.000Z"),
        fundName: "Tithe",
        deductibleAmount: "54.00",
      },
    ]);
    expect(sumMoneyAmounts(result.lines.map((line) => line.deductibleAmount))).toBe(
      "90.00",
    );
    expect(JSON.stringify(result)).not.toMatch(
      /999\.00|75\.00|80\.00|200\.00|1234|internal memo|pi_secret|12-3456789|other@example.com|CHECK|stripe/i,
    );
    expect(store.lastDonationQuery).toMatchObject({
      where: {
        organizationId: ORG_ID,
        donorId: DONOR_ANN,
        isTest: false,
        anonymous: false,
      },
      select: {
        offeringDate: true,
        totalAmount: true,
        deductibleAmount: true,
      },
    });
    expect(JSON.stringify(store.lastDonationQuery)).not.toMatch(
      /checkNumber|note|paymentMethod|stripe/i,
    );
  });

  it("does not double-count multi-fund allocations in the deductible total", async () => {
    const result = await getIndividualStatementPreview(DONOR_ANN, "2026", NOW);
    expect(result.deductibleTotal).toBe("90.00");
    expect(result.deductibleTotal).not.toBe("100.00");
    expect(result.deductibleTotal).not.toBe("190.00");
    expect(result.giftCount).toBe(1);
  });

  it("filters gifts to the selected calendar year", async () => {
    const result = await getIndividualStatementPreview(DONOR_ANN, "2025", NOW);
    expect(result.year).toBe(2025);
    expect(result.giftCount).toBe(1);
    expect(result.deductibleTotal).toBe("40.00");
    expect(result.lines[0]).toMatchObject({
      fundName: "Tithe",
      deductibleAmount: "40.00",
    });
  });

  it("falls back to the current year when the year is invalid", async () => {
    const result = await getIndividualStatementPreview(DONOR_ANN, "1999", NOW);
    expect(result.year).toBe(2026);
    expect(result.giftCount).toBe(1);
  });

  it("returns the existing individual statement status and identifier", async () => {
    const result = await getIndividualStatementPreview(DONOR_ANN, "2026", NOW);
    expect(result.statement).toEqual({
      exists: true,
      status: StatementStatus.GENERATED,
      statementIdentifier: "STMT-2026-ANN",
    });
  });

  it("prefers a published individual statement over generated or voided", async () => {
    store.statements.push({
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.PUBLISHED,
      statementIdentifier: "STMT-2026-PUB",
    });
    const result = await getIndividualStatementPreview(DONOR_ANN, "2026", NOW);
    expect(result.statement).toEqual({
      exists: true,
      status: StatementStatus.PUBLISHED,
      statementIdentifier: "STMT-2026-PUB",
    });
  });

  it("ignores household statements when selecting existing status", async () => {
    store.statements = [
      {
        organizationId: ORG_ID,
        donorId: DONOR_ANN,
        statementType: StatementType.HOUSEHOLD,
        taxYear: 2026,
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        status: StatementStatus.PUBLISHED,
        statementIdentifier: "STMT-HH",
      },
    ];
    const result = await getIndividualStatementPreview(DONOR_ANN, "2026", NOW);
    expect(result.statement).toEqual({
      exists: false,
      status: null,
      statementIdentifier: null,
    });
  });

  it("spreads a gift deductible across allocations without changing stored values", () => {
    const lines = previewLinesForGift({
      offeringDate: new Date("2026-02-01T00:00:00.000Z"),
      totalAmount: "10.00",
      deductibleAmount: "10.00",
      allocations: [
        { amount: "1.00", fundName: "A" },
        { amount: "1.00", fundName: "B" },
        { amount: "8.00", fundName: "C" },
      ],
    });
    expect(lines.map((line) => line.deductibleAmount)).toEqual([
      "1.00",
      "1.00",
      "8.00",
    ]);
    expect(sumMoneyAmounts(lines.map((line) => line.deductibleAmount))).toBe(
      "10.00",
    );
  });
});
