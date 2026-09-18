import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RoleCode,
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

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
  mailingAddressLine1: string | null;
  mailingAddressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
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
  generatedAt?: Date;
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
  donations: [] as DonationRow[],
  donors: [] as DonorRow[],
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
          donorId: string;
          status?: { in: StatementStatus[] };
          OR?: Array<
            | { taxYear: number }
            | { taxYear: null; periodStart: { gte: Date; lt: Date } }
          >;
        };
      }) => prismaDelegate.findFirst(args),
      create: async (args: { data: StatementRow & { generatedByUserAccountId: string } }) =>
        prismaDelegate.create(args),
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
      orderBy,
    }: {
      where: {
        organizationId: string;
        donorId: string;
        status?: StatementStatus | { in: StatementStatus[] };
        OR?: Array<
          | { taxYear: number }
          | { taxYear: null; periodStart: { gte: Date; lt: Date } }
        >;
      };
      orderBy?: Array<Record<string, "asc" | "desc">>;
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
      const matches = store.statements.filter((row) => {
        if (row.organizationId !== where.organizationId) return false;
        if (row.donorId !== where.donorId) return false;
        if (row.statementType !== StatementType.INDIVIDUAL) return false;
        if (typeof where.status === "string") {
          if (row.status !== where.status) return false;
        } else if (where.status?.in && !where.status.in.includes(row.status)) {
          return false;
        }
        if (year != null && row.taxYear === year) return true;
        return (
          row.taxYear == null &&
          period != null &&
          row.periodStart >= period.periodStart.gte &&
          row.periodStart < period.periodStart.lt
        );
      });
      const sorted = [...matches].sort((left, right) => {
        for (const rule of orderBy ?? []) {
          const [field, direction] = Object.entries(rule)[0] ?? [];
          if (field === "generatedAt") {
            const leftTime = left.generatedAt?.getTime() ?? 0;
            const rightTime = right.generatedAt?.getTime() ?? 0;
            if (leftTime !== rightTime) {
              return direction === "desc" ? rightTime - leftTime : leftTime - rightTime;
            }
          }
          if (field === "id" && left.id !== right.id) {
            return direction === "desc"
              ? right.id.localeCompare(left.id)
              : left.id.localeCompare(right.id);
          }
        }
        return 0;
      });
      return sorted[0] ?? null;
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
  REISSUE_CONTRIBUTION_STATEMENT,
  IndividualStatementGenerationError,
  generateIndividualContributionStatement,
} from "./individual-statement-generation.service";
import {
  portalPublishedIndividualStatementWhere,
  portalPublishedStatementAccessWhere,
} from "./member-portal-statement-pdf.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ANN = "00000000-0000-4000-8000-00000000d001";
const DONOR_OTHER = "00000000-0000-4000-8000-00000000d002";
const NOW = new Date("2026-09-14T16:00:00.000Z");
const VOIDED_ID = "00000000-0000-4000-8000-00000000b009";
const VOIDED_KEY = `private/statements/${ORG_ID}/${VOIDED_ID}/IND-2026-VOID.pdf`;
const VOIDED_SUM = "b".repeat(64);
const PDF_BYTES = new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"));

function officialGift(): DonationRow {
  return {
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
  };
}

function seedReadyData() {
  store.donors = [
    {
      id: DONOR_ANN,
      organizationId: ORG_ID,
      firstName: "Ann",
      lastName: "Adams",
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
      mailingAddressLine1: "99 Other Rd",
      mailingAddressLine2: null,
      city: "Elsewhere",
      state: "ME",
      postalCode: "04000",
      country: "US",
    },
  ];
  store.donations = [
    officialGift(),
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

describe("individual statement generation", () => {
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
      generateIndividualContributionStatement(
        { donorId: DONOR_ANN, year: "2026" },
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
        generateIndividualContributionStatement(
          { donorId: DONOR_ANN, year: "2026" },
          NOW,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(store.written).toHaveLength(0);
    },
  );

  it("does not generate for a donor in another organization", async () => {
    await expect(
      generateIndividualContributionStatement(
        { donorId: DONOR_OTHER, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.written).toHaveLength(0);
  });

  it("rejects when the only gifts are test gifts", async () => {
    store.donations = store.donations.filter((row) => row.isTest);
    await expect(
      generateIndividualContributionStatement(
        { donorId: DONOR_ANN, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringMatching(/no official gifts/i),
    });
    expect(store.written).toHaveLength(0);
  });

  it("rejects a missing donor mailing address", async () => {
    store.donors[0].mailingAddressLine1 = null;
    store.donors[0].city = null;
    await expect(
      generateIndividualContributionStatement(
        { donorId: DONOR_ANN, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringMatching(/mailing address/i),
    });
    expect(store.written).toHaveLength(0);
  });

  it("rejects an existing GENERATED statement for the same donor and year", async () => {
    store.statements.push({
      id: "existing-generated",
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      householdId: null,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.GENERATED,
      statementIdentifier: "IND-2026-EXISTING",
    });
    await expect(
      generateIndividualContributionStatement(
        { donorId: DONOR_ANN, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(store.written).toHaveLength(0);
  });

  it("rejects an existing PUBLISHED statement for the same donor and year", async () => {
    store.statements.push({
      id: "existing-published",
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      householdId: null,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.PUBLISHED,
      statementIdentifier: "IND-2026-PUB",
    });
    await expect(
      generateIndividualContributionStatement(
        { donorId: DONOR_ANN, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(store.written).toHaveLength(0);
  });

  it("still denies generation when a VOIDED statement is followed by a GENERATED duplicate", async () => {
    store.statements.push(
      {
        id: VOIDED_ID,
        organizationId: ORG_ID,
        donorId: DONOR_ANN,
        householdId: null,
        statementType: StatementType.INDIVIDUAL,
        taxYear: 2026,
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        status: StatementStatus.VOIDED,
        statementIdentifier: "IND-2026-VOID",
        pdfStorageKey: VOIDED_KEY,
        pdfChecksum: VOIDED_SUM,
        deductibleTotal: "10.00",
      },
      {
        id: "existing-generated",
        organizationId: ORG_ID,
        donorId: DONOR_ANN,
        householdId: null,
        statementType: StatementType.INDIVIDUAL,
        taxYear: 2026,
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        status: StatementStatus.GENERATED,
        statementIdentifier: "IND-2026-EXISTING",
      },
    );
    await expect(
      generateIndividualContributionStatement(
        { donorId: DONOR_ANN, year: "2026" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(store.written).toHaveLength(0);
    expect(store.statements.find((row) => row.id === VOIDED_ID)).toMatchObject({
      status: StatementStatus.VOIDED,
      statementIdentifier: "IND-2026-VOID",
      pdfStorageKey: VOIDED_KEY,
      pdfChecksum: VOIDED_SUM,
    });
  });

  it("reissues a replacement after a VOIDED statement without changing the voided record", async () => {
    store.statements.push({
      id: VOIDED_ID,
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      householdId: null,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.VOIDED,
      statementIdentifier: "IND-2026-VOID",
      pdfStorageKey: VOIDED_KEY,
      pdfChecksum: VOIDED_SUM,
      deductibleTotal: "10.00",
      generatedAt: new Date("2026-08-01T12:00:00.000Z"),
    });
    const result = await generateIndividualContributionStatement(
      { donorId: DONOR_ANN, year: "2026" },
      NOW,
    );
    expect(result.status).toBe(StatementStatus.GENERATED);
    expect(result.statementId).not.toBe(VOIDED_ID);
    expect(result.statementIdentifier).toMatch(/^IND-2026-[A-F0-9]{8}$/);
    expect(result.statementIdentifier).not.toBe("IND-2026-VOID");
    expect(store.statements).toHaveLength(2);
    expect(store.statements.find((row) => row.id === VOIDED_ID)).toEqual({
      id: VOIDED_ID,
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      householdId: null,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.VOIDED,
      statementIdentifier: "IND-2026-VOID",
      pdfStorageKey: VOIDED_KEY,
      pdfChecksum: VOIDED_SUM,
      deductibleTotal: "10.00",
      generatedAt: new Date("2026-08-01T12:00:00.000Z"),
    });
    const replacement = store.statements.find((row) => row.id === result.statementId);
    expect(replacement).toMatchObject({
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      householdId: null,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      status: StatementStatus.GENERATED,
      statementIdentifier: result.statementIdentifier,
      deductibleTotal: "90.00",
      pdfChecksum: "a".repeat(64),
    });
    expect(replacement?.pdfStorageKey).toBe(
      `private/statements/${ORG_ID}/${result.statementId}/${result.statementIdentifier}.pdf`,
    );
    expect(replacement?.pdfStorageKey).not.toBe(VOIDED_KEY);
    expect(store.written).toHaveLength(1);
    expect(store.written[0]?.statementId).toBe(result.statementId);
    expect(store.written[0]?.storageKey).toBe(replacement?.pdfStorageKey);
    expect(store.deleted).toHaveLength(0);
    expect(store.audits).toHaveLength(2);
    expect(store.audits[0]).toMatchObject({
      action: GENERATE_CONTRIBUTION_STATEMENT,
      entityId: result.statementId,
    });
    expect(store.audits[1]).toMatchObject({
      action: REISSUE_CONTRIBUTION_STATEMENT,
      entityType: "ContributionStatement",
      entityId: result.statementId,
      actorUserAccountId: USER_ID,
    });
    const reissueJson = JSON.stringify(store.audits[1]);
    expect(reissueJson).toContain(VOIDED_ID);
    expect(reissueJson).toContain("IND-2026-VOID");
    expect(reissueJson).toContain(result.statementId);
    expect(reissueJson).toContain(result.statementIdentifier);
    expect(reissueJson).toContain("INDIVIDUAL");
    expect(reissueJson).toContain("2026");
    expect(reissueJson).toContain("90.00");
    expect(reissueJson).toContain(USER_ID);
    expect(reissueJson).not.toMatch(
      /10 Oak St|100 Church St|internal memo|pi_secret|1234|storage\/private|%PDF-|IND-2026-VOID\.pdf/i,
    );
    const snapshot = mocks.renderContributionStatementPdf.mock.calls[0]?.[0];
    expect(snapshot).toMatchObject({
      statementType: "INDIVIDUAL",
      statementIdentifier: result.statementIdentifier,
      deductibleTotal: "90.00",
    });
    expect(JSON.stringify(snapshot)).not.toContain("IND-2026-VOID");
    const portalWhere = portalPublishedIndividualStatementWhere({
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      statementId: result.statementId,
    });
    const portalAccess = portalPublishedStatementAccessWhere({
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      authorizedHouseholdIds: [],
      statementId: result.statementId,
    });
    expect(portalWhere.status).toBe("PUBLISHED");
    expect(JSON.stringify(portalWhere)).not.toContain("GENERATED");
    expect(JSON.stringify(portalWhere)).not.toContain("VOIDED");
    expect(JSON.stringify(portalAccess)).not.toContain("GENERATED");
    expect(JSON.stringify(portalAccess)).not.toContain("VOIDED");
  });

  it("saves a private PDF, GENERATED record, and safe audit event", async () => {
    const result = await generateIndividualContributionStatement(
      { donorId: DONOR_ANN, year: "2026" },
      NOW,
    );
    expect(result.status).toBe(StatementStatus.GENERATED);
    expect(result.statementIdentifier).toMatch(/^IND-2026-[A-F0-9]{8}$/);
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
      donorId: DONOR_ANN,
      householdId: null,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      status: StatementStatus.GENERATED,
      statementIdentifier: result.statementIdentifier,
      deductibleTotal: "90.00",
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
    expect(auditJson).toContain("INDIVIDUAL");
    expect(auditJson).toContain("2026");
    expect(auditJson).toContain(DONOR_ANN);
    expect(auditJson).toContain("90.00");
    expect(auditJson).toContain(result.statementIdentifier);
    expect(auditJson).toContain("GENERATED");
    expect(auditJson).not.toMatch(
      /10 Oak St|100 Church St|internal memo|pi_secret|1234|storage\/private|%PDF-/i,
    );
    expect(store.lastDonationQuery).toMatchObject({
      where: {
        organizationId: ORG_ID,
        donorId: DONOR_ANN,
        isTest: false,
        anonymous: false,
      },
    });
    expect(JSON.stringify(store.lastDonationQuery)).not.toMatch(
      /checkNumber|note|stripe/i,
    );
    const snapshot = mocks.renderContributionStatementPdf.mock.calls[0]?.[0];
    expect(snapshot).toMatchObject({
      statementType: "INDIVIDUAL",
      deductibleTotal: "90.00",
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /999\.00|75\.00|80\.00|1234|internal memo|pi_secret/i,
    );
  });

  it("does not block solely because EIN is missing", async () => {
    store.organization!.ein = null;
    const result = await generateIndividualContributionStatement(
      { donorId: DONOR_ANN, year: "2026" },
      NOW,
    );
    expect(result.einMissing).toBe(true);
    expect(store.statements).toHaveLength(1);
  });

  it("removes the private file when database creation fails", async () => {
    store.persistShouldFail = true;
    await expect(
      generateIndividualContributionStatement(
        { donorId: DONOR_ANN, year: "2026" },
        NOW,
      ),
    ).rejects.toBeInstanceOf(IndividualStatementGenerationError);
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

  it("cleans up only the replacement PDF when reissue persistence fails", async () => {
    store.statements.push({
      id: VOIDED_ID,
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      householdId: null,
      statementType: StatementType.INDIVIDUAL,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      status: StatementStatus.VOIDED,
      statementIdentifier: "IND-2026-VOID",
      pdfStorageKey: VOIDED_KEY,
      pdfChecksum: VOIDED_SUM,
      deductibleTotal: "10.00",
    });
    store.persistShouldFail = true;
    await expect(
      generateIndividualContributionStatement(
        { donorId: DONOR_ANN, year: "2026" },
        NOW,
      ),
    ).rejects.toBeInstanceOf(IndividualStatementGenerationError);
    expect(store.written).toHaveLength(1);
    expect(store.written[0]?.storageKey).not.toBe(VOIDED_KEY);
    expect(store.deleted).toEqual([
      {
        organizationId: ORG_ID,
        statementId: store.written[0]?.statementId,
        storageKey: store.written[0]?.storageKey,
      },
    ]);
    expect(store.deleted[0]?.storageKey).not.toBe(VOIDED_KEY);
    expect(store.statements).toEqual([
      expect.objectContaining({
        id: VOIDED_ID,
        status: StatementStatus.VOIDED,
        statementIdentifier: "IND-2026-VOID",
        pdfStorageKey: VOIDED_KEY,
        pdfChecksum: VOIDED_SUM,
      }),
    ]);
    expect(store.audits).toHaveLength(0);
  });
});
