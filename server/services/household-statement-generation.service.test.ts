import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RoleCode,
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

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
};

type StatementRow = {
  id: string;
  organizationId: string;
  donorId: string | null;
  householdId: string | null;
  statementType: StatementType;
  taxYear: number | null;
  periodStart: Date;
  status: StatementStatus;
  statementIdentifier: string;
  pdfStorageKey?: string;
  pdfChecksum?: string;
  deductibleTotal?: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  displayName: string | null;
  mailingAddressLine1: string;
  mailingAddressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  ein: string | null;
  statementFooterText: string | null;
  locale: string;
};

const store = vi.hoisted(() => ({
  households: [] as HouseholdRow[],
  memberships: [] as MembershipRow[],
  donations: [] as DonationRow[],
  statements: [] as StatementRow[],
  audits: [] as Array<Record<string, unknown>>,
  organization: null as OrganizationRow | null,
  persistShouldFail: false,
  written: [] as Array<{
    organizationId: string;
    statementId: string;
    storageKey: string;
    bytes: Uint8Array;
  }>,
  deleted: [] as Array<{
    organizationId: string;
    statementId: string;
    storageKey: string;
  }>,
  lastDonationQuery: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  getGivingAccess: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  renderContributionStatementPdf: vi.fn(),
  writePrivateStatementPdf: vi.fn(),
  deletePrivateStatementPdf: vi.fn(),
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
    requireStatementManageAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canManageStatements) throw new Error("denied");
      return access;
    },
  };
});

vi.mock("@/lib/statements/render-contribution-statement-pdf", () => ({
  renderContributionStatementPdf: mocks.renderContributionStatementPdf,
}));

vi.mock("@/lib/storage/statement-pdf", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/storage/statement-pdf")
  >("@/lib/storage/statement-pdf");
  return {
    ...actual,
    writePrivateStatementPdf: mocks.writePrivateStatementPdf,
    deletePrivateStatementPdf: mocks.deletePrivateStatementPdf,
  };
});

vi.mock("@/lib/db/prisma", () => {
  const tx = {
    $queryRaw: async () => [{ id: "locked" }],
    contributionStatement: {
      findFirst: async (args: {
        where: {
          organizationId: string;
          householdId: string;
          donorId?: null;
          status?: { in: StatementStatus[] };
          OR?: Array<
            | { taxYear: number }
            | { taxYear: null; periodStart: { gte: Date; lt: Date } }
          >;
        };
      }) => prismaDelegate.findFirst(args),
      create: async (args: {
        data: StatementRow & { generatedByUserAccountId: string };
      }) => prismaDelegate.create(args),
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return data;
      },
    },
  };
  const prismaDelegate = {
    findFirst: async ({
      where,
    }: {
      where: {
        organizationId: string;
        householdId: string;
        donorId?: null;
        status?: { in: StatementStatus[] };
        OR?: Array<
          | { taxYear: number }
          | { taxYear: null; periodStart: { gte: Date; lt: Date } }
        >;
      };
    }) => {
      const year =
        where.OR?.[0] &&
        "taxYear" in where.OR[0] &&
        typeof where.OR[0].taxYear === "number"
          ? where.OR[0].taxYear
          : null;
      const period = where.OR?.find((entry) => "periodStart" in entry) as
        | { periodStart: { gte: Date; lt: Date } }
        | undefined;
      const allowed = where.status?.in;
      return (
        store.statements.find((row) => {
          if (row.organizationId !== where.organizationId) return false;
          if (row.householdId !== where.householdId) return false;
          if (row.statementType !== StatementType.HOUSEHOLD) return false;
          if (where.donorId === null && row.donorId !== null) return false;
          if (allowed && !allowed.includes(row.status)) return false;
          if (year != null && row.taxYear === year) return true;
          return (
            row.taxYear == null &&
            period != null &&
            row.periodStart >= period.periodStart.gte &&
            row.periodStart < period.periodStart.lt
          );
        }) ?? null
      );
    },
    create: async ({
      data,
    }: {
      data: StatementRow & { generatedByUserAccountId: string };
    }) => {
      if (store.persistShouldFail) {
        throw new Error("db down");
      }
      store.statements.push({
        id: data.id,
        organizationId: data.organizationId,
        donorId: data.donorId,
        householdId: data.householdId,
        statementType: data.statementType,
        taxYear: data.taxYear,
        periodStart: data.periodStart,
        status: data.status,
        statementIdentifier: data.statementIdentifier,
        pdfStorageKey: data.pdfStorageKey,
        pdfChecksum: data.pdfChecksum,
        deductibleTotal: String(data.deductibleTotal),
      });
      return data;
    },
  };
  return {
    prisma: {
      household: {
        findFirst: async ({
          where,
        }: {
          where: { id: string; organizationId: string };
        }) =>
          store.households.find(
            (row) =>
              row.id === where.id && row.organizationId === where.organizationId,
          ) ?? null,
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
              donor: { id: row.donorId },
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
                .filter(
                  (allocation) =>
                    allocation.organizationId === where.organizationId &&
                    allocation.offeringTypeOrganizationId ===
                      where.organizationId,
                )
                .map((allocation) => ({
                  amount: allocation.amount,
                  offeringType: { name: allocation.fundName },
                })),
            }));
        },
      },
      contributionStatement: prismaDelegate,
      $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) =>
        fn(tx),
    },
  };
});

import {
  GENERATE_CONTRIBUTION_STATEMENT,
  HouseholdStatementGenerationError,
  generateHouseholdContributionStatement,
} from "./household-statement-generation.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-00000000e001";
const OTHER_HOUSEHOLD = "00000000-0000-4000-8000-00000000e002";
const DONOR_ANN = "00000000-0000-4000-8000-00000000d001";
const DONOR_BEN = "00000000-0000-4000-8000-00000000d002";
const DONOR_CARA = "00000000-0000-4000-8000-00000000d003";
const NOW = new Date("2026-09-14T16:00:00.000Z");
const PDF_BYTES = new Uint8Array(
  Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"),
);

function seedReadyData() {
  store.households = [
    {
      id: HOUSEHOLD_ID,
      organizationId: ORG_ID,
      displayName: "Adams Household",
      mailingAddressLine1: "10 Oak St",
      mailingAddressLine2: "Apt 2",
      city: "Townville",
      state: "TN",
      postalCode: "37000",
      country: "US",
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
    },
    {
      organizationId: ORG_ID,
      householdId: HOUSEHOLD_ID,
      donorId: DONOR_BEN,
      startDate: new Date("2024-01-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
      donorOrganizationId: ORG_ID,
    },
    {
      organizationId: ORG_ID,
      householdId: HOUSEHOLD_ID,
      donorId: DONOR_CARA,
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: null,
      donorOrganizationId: ORG_ID,
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
  store.statements = [];
  store.audits = [];
  store.written = [];
  store.deleted = [];
  store.persistShouldFail = false;
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
    locale: "en-US",
  };
}

describe("household statement generation", () => {
  beforeEach(() => {
    seedReadyData();
    store.lastDonationQuery = null;
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockImplementation(
      async () => store.organization,
    );
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
    mocks.renderContributionStatementPdf.mockResolvedValue(PDF_BYTES);
    mocks.writePrivateStatementPdf.mockImplementation(async (input) => {
      store.written.push(input);
      return { ok: true, checksum: "a".repeat(64) };
    });
    mocks.deletePrivateStatementPdf.mockImplementation(async (input) => {
      store.deleted.push(input);
    });
  });

  it("rejects signed-out users", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      generateHouseholdContributionStatement(
        { householdId: HOUSEHOLD_ID, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
    expect(store.written).toHaveLength(0);
  });

  it.each([RoleCode.REPORT_VIEWER, RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s because viewing or entry is not enough",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      await expect(
        generateHouseholdContributionStatement(
          { householdId: HOUSEHOLD_ID, year: "2026" },
          NOW,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(store.written).toHaveLength(0);
    },
  );

  it("does not generate for a household in another organization", async () => {
    await expect(
      generateHouseholdContributionStatement(
        { householdId: OTHER_HOUSEHOLD, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.written).toHaveLength(0);
  });

  it("includes gifts only while household membership covers the offering date", async () => {
    const result = await generateHouseholdContributionStatement(
      { householdId: HOUSEHOLD_ID, year: "2026" },
      NOW,
    );
    expect(result.status).toBe(StatementStatus.GENERATED);
    expect(store.statements[0]?.deductibleTotal).toBe("125.00");
    const snapshot = mocks.renderContributionStatementPdf.mock.calls[0]?.[0];
    expect(snapshot).toMatchObject({
      statementType: "HOUSEHOLD",
      deductibleTotal: "125.00",
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /999\.00|50\.00|30\.00|80\.00|45\.00/i,
    );
  });

  it("rejects when the only gifts are test gifts", async () => {
    store.donations = store.donations.filter((row) => row.isTest);
    await expect(
      generateHouseholdContributionStatement(
        { householdId: HOUSEHOLD_ID, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringMatching(/no official gifts/i),
    });
    expect(store.written).toHaveLength(0);
  });

  it("rejects a missing household mailing address", async () => {
    store.households[0].mailingAddressLine1 = "";
    store.households[0].city = "";
    await expect(
      generateHouseholdContributionStatement(
        { householdId: HOUSEHOLD_ID, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringMatching(/mailing address/i),
    });
    expect(store.written).toHaveLength(0);
  });

  it("rejects an existing GENERATED statement for the same household and year", async () => {
    store.statements.push({
      id: "existing-generated",
      organizationId: ORG_ID,
      donorId: null,
      householdId: HOUSEHOLD_ID,
      statementType: StatementType.HOUSEHOLD,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.GENERATED,
      statementIdentifier: "HH-2026-EXISTING",
    });
    await expect(
      generateHouseholdContributionStatement(
        { householdId: HOUSEHOLD_ID, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(store.written).toHaveLength(0);
  });

  it("rejects an existing PUBLISHED statement for the same household and year", async () => {
    store.statements.push({
      id: "existing-published",
      organizationId: ORG_ID,
      donorId: null,
      householdId: HOUSEHOLD_ID,
      statementType: StatementType.HOUSEHOLD,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.PUBLISHED,
      statementIdentifier: "HH-2026-PUB",
    });
    await expect(
      generateHouseholdContributionStatement(
        { householdId: HOUSEHOLD_ID, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(store.written).toHaveLength(0);
  });

  it("ignores an individual statement for the same household and year", async () => {
    store.statements.push({
      id: "individual",
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      householdId: HOUSEHOLD_ID,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.PUBLISHED,
      statementIdentifier: "IND-SHOULD-IGNORE",
    });
    await expect(
      generateHouseholdContributionStatement(
        { householdId: HOUSEHOLD_ID, year: "2026" },
        NOW,
      ),
    ).resolves.toMatchObject({ status: StatementStatus.GENERATED });
  });

  it("saves a private PDF, GENERATED record, and safe household audit event", async () => {
    const result = await generateHouseholdContributionStatement(
      { householdId: HOUSEHOLD_ID, year: "2026" },
      NOW,
    );
    expect(result.status).toBe(StatementStatus.GENERATED);
    expect(result.statementIdentifier).toMatch(/^HH-2026-[A-F0-9]{8}$/);
    expect(result.einMissing).toBe(false);
    expect(store.written).toHaveLength(1);
    expect(store.written[0]?.organizationId).toBe(ORG_ID);
    expect(store.written[0]?.storageKey).toBe(
      `private/statements/${ORG_ID}/${store.written[0]?.statementId}/${result.statementIdentifier}.pdf`,
    );
    expect(Buffer.from(store.written[0]?.bytes ?? []).toString("utf8")).toMatch(
      /^%PDF-/,
    );
    expect(store.statements).toHaveLength(1);
    expect(store.statements[0]).toMatchObject({
      organizationId: ORG_ID,
      donorId: null,
      householdId: HOUSEHOLD_ID,
      statementType: StatementType.HOUSEHOLD,
      taxYear: 2026,
      status: StatementStatus.GENERATED,
      statementIdentifier: result.statementIdentifier,
      deductibleTotal: "125.00",
      pdfChecksum: "a".repeat(64),
    });
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      action: GENERATE_CONTRIBUTION_STATEMENT,
      entityType: "ContributionStatement",
      entityId: result.statementId,
      actorUserAccountId: USER_ID,
      organizationId: ORG_ID,
    });
    const auditJson = JSON.stringify(store.audits[0]);
    expect(auditJson).toContain("HOUSEHOLD");
    expect(auditJson).toContain("2026");
    expect(auditJson).toContain(HOUSEHOLD_ID);
    expect(auditJson).toContain("125.00");
    expect(auditJson).toContain(result.statementIdentifier);
    expect(auditJson).toContain("GENERATED");
    expect(auditJson).not.toMatch(
      /10 Oak St|100 Church St|internal memo|pi_secret|1234|storage\/private|%PDF-/i,
    );
    expect(store.lastDonationQuery).toMatchObject({
      where: {
        organizationId: ORG_ID,
        isTest: false,
        anonymous: false,
      },
    });
    expect(JSON.stringify(store.lastDonationQuery)).not.toMatch(
      /checkNumber|note|stripe/i,
    );
  });

  it("does not block solely because EIN is missing", async () => {
    store.organization!.ein = null;
    const result = await generateHouseholdContributionStatement(
      { householdId: HOUSEHOLD_ID, year: "2026" },
      NOW,
    );
    expect(result.einMissing).toBe(true);
    expect(store.statements).toHaveLength(1);
  });

  it("removes the private file when database creation fails", async () => {
    store.persistShouldFail = true;
    await expect(
      generateHouseholdContributionStatement(
        { householdId: HOUSEHOLD_ID, year: "2026" },
        NOW,
      ),
    ).rejects.toBeInstanceOf(HouseholdStatementGenerationError);
    expect(store.written).toHaveLength(1);
    expect(store.deleted).toEqual([
      {
        organizationId: ORG_ID,
        statementId: store.written[0]?.statementId,
        storageKey: store.written[0]?.storageKey,
      },
    ]);
    expect(store.statements).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });
});
