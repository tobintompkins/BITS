import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RoleCode,
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

type StatementRow = {
  id: string;
  organizationId: string;
  statementType: StatementType;
  status: StatementStatus;
  taxYear: number | null;
  periodStart: Date;
  periodEnd: Date;
  statementIdentifier: string;
  deductibleTotal: string;
  generatedAt: Date;
  generatedByUserAccountId: string;
  donorId: string | null;
  householdId: string | null;
  pdfStorageKey: string;
  pdfChecksum: string;
  mailingAddressLine1?: string;
  stripePaymentIntentId?: string;
  note?: string;
};

type DonorRow = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
};

type HouseholdRow = {
  id: string;
  organizationId: string;
  displayName: string;
};

type UserRow = {
  id: string;
  displayName: string | null;
  primaryEmail: string;
};

const store = vi.hoisted(() => ({
  statements: [] as StatementRow[],
  donors: [] as DonorRow[],
  households: [] as HouseholdRow[],
  users: [] as UserRow[],
  lastFindManyWhere: null as unknown,
  lastGroupByWhere: null as unknown,
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
    contributionStatement: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          statementType?: StatementType;
          status?: StatementStatus;
          OR: Array<
            | { taxYear: number }
            | { taxYear: null; periodStart: { gte: Date; lt: Date } }
          >;
        };
      }) => {
        store.lastFindManyWhere = where;
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
            if (where.statementType && row.statementType !== where.statementType) {
              return false;
            }
            if (where.status && row.status !== where.status) return false;
            if (year != null && row.taxYear === year) return true;
            return (
              row.taxYear == null &&
              period != null &&
              row.periodStart >= period.periodStart.gte &&
              row.periodStart < period.periodStart.lt
            );
          })
          .sort((left, right) => {
            const byDate = right.generatedAt.getTime() - left.generatedAt.getTime();
            if (byDate !== 0) return byDate;
            return right.id.localeCompare(left.id);
          })
          .map((row) => ({
            id: row.id,
            statementIdentifier: row.statementIdentifier,
            statementType: row.statementType,
            status: row.status,
            taxYear: row.taxYear,
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            deductibleTotal: row.deductibleTotal,
            generatedAt: row.generatedAt,
            donorId: row.donorId,
            householdId: row.householdId,
            generatedBy:
              store.users.find((user) => user.id === row.generatedByUserAccountId) ??
              {
                displayName: null,
                primaryEmail: "unknown@example.com",
              },
            donor: store.donors.find((donor) => donor.id === row.donorId) ?? null,
            household:
              store.households.find((household) => household.id === row.householdId) ??
              null,
          }));
      },
      groupBy: async ({
        where,
      }: {
        where: {
          organizationId: string;
          OR?: Array<
            | { taxYear: number }
            | { taxYear: null; periodStart: { gte: Date; lt: Date } }
          >;
        };
      }) => {
        store.lastGroupByWhere = where;
        const counts = new Map<StatementStatus, number>();
        const year =
          where.OR?.[0] &&
          "taxYear" in where.OR[0] &&
          typeof where.OR[0].taxYear === "number"
            ? where.OR[0].taxYear
            : null;
        for (const row of store.statements) {
          if (row.organizationId !== where.organizationId) continue;
          if (year != null && row.taxYear !== year) continue;
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

import { getStatementRegistry } from "./statement-registry.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const GENERATOR_ID = "00000000-0000-4000-8000-00000000c002";
const DONOR_ANN = "00000000-0000-4000-8000-00000000d001";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-00000000e001";
const STMT_NEW = "00000000-0000-4000-8000-00000000b009";
const STMT_OLD = "00000000-0000-4000-8000-00000000b001";
const STMT_HH = "00000000-0000-4000-8000-00000000b002";
const STMT_PUB = "00000000-0000-4000-8000-00000000b003";
const STMT_VOID = "00000000-0000-4000-8000-00000000b004";
const STMT_2025 = "00000000-0000-4000-8000-00000000b005";
const STMT_OTHER = "00000000-0000-4000-8000-00000000b006";
const NOW = new Date("2026-09-15T16:00:00.000Z");

function seedRegistry() {
  store.users = [
    {
      id: GENERATOR_ID,
      displayName: "Terry Treasurer",
      primaryEmail: "terry@church.test",
    },
  ];
  store.donors = [
    {
      id: DONOR_ANN,
      organizationId: ORG_ID,
      firstName: "Ann",
      lastName: "Adams",
    },
  ];
  store.households = [
    {
      id: HOUSEHOLD_ID,
      organizationId: ORG_ID,
      displayName: "Adams Household",
    },
  ];
  store.statements = [
    {
      id: STMT_NEW,
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.GENERATED,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      statementIdentifier: "IND-2026-NEW1",
      deductibleTotal: "90.00",
      generatedAt: new Date("2026-09-14T12:00:00.000Z"),
      generatedByUserAccountId: GENERATOR_ID,
      donorId: DONOR_ANN,
      householdId: null,
      pdfStorageKey: `private/statements/${ORG_ID}/${STMT_NEW}/file.pdf`,
      pdfChecksum: "a".repeat(64),
      mailingAddressLine1: "10 Oak St",
      stripePaymentIntentId: "pi_secret",
      note: "internal memo",
    },
    {
      id: STMT_OLD,
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.GENERATED,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      statementIdentifier: "IND-2026-OLD1",
      deductibleTotal: "40.00",
      generatedAt: new Date("2026-09-10T12:00:00.000Z"),
      generatedByUserAccountId: GENERATOR_ID,
      donorId: DONOR_ANN,
      householdId: null,
      pdfStorageKey: `private/statements/${ORG_ID}/${STMT_OLD}/file.pdf`,
      pdfChecksum: "b".repeat(64),
    },
    {
      id: STMT_HH,
      organizationId: ORG_ID,
      statementType: StatementType.HOUSEHOLD,
      status: StatementStatus.GENERATED,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      statementIdentifier: "HH-2026-ADAMS",
      deductibleTotal: "125.00",
      generatedAt: new Date("2026-09-12T12:00:00.000Z"),
      generatedByUserAccountId: GENERATOR_ID,
      donorId: null,
      householdId: HOUSEHOLD_ID,
      pdfStorageKey: `private/statements/${ORG_ID}/${STMT_HH}/file.pdf`,
      pdfChecksum: "c".repeat(64),
    },
    {
      id: STMT_PUB,
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.PUBLISHED,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      statementIdentifier: "IND-2026-PUB1",
      deductibleTotal: "50.00",
      generatedAt: new Date("2026-08-01T12:00:00.000Z"),
      generatedByUserAccountId: GENERATOR_ID,
      donorId: DONOR_ANN,
      householdId: null,
      pdfStorageKey: `private/statements/${ORG_ID}/${STMT_PUB}/file.pdf`,
      pdfChecksum: "d".repeat(64),
    },
    {
      id: STMT_VOID,
      organizationId: ORG_ID,
      statementType: StatementType.HOUSEHOLD,
      status: StatementStatus.VOIDED,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      statementIdentifier: "HH-2026-VOID",
      deductibleTotal: "10.00",
      generatedAt: new Date("2026-07-01T12:00:00.000Z"),
      generatedByUserAccountId: GENERATOR_ID,
      donorId: null,
      householdId: HOUSEHOLD_ID,
      pdfStorageKey: `private/statements/${ORG_ID}/${STMT_VOID}/file.pdf`,
      pdfChecksum: "e".repeat(64),
    },
    {
      id: STMT_2025,
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.PUBLISHED,
      taxYear: 2025,
      periodStart: new Date("2025-01-01T00:00:00.000Z"),
      periodEnd: new Date("2025-12-31T00:00:00.000Z"),
      statementIdentifier: "IND-2025-ANN",
      deductibleTotal: "15.00",
      generatedAt: new Date("2025-12-01T12:00:00.000Z"),
      generatedByUserAccountId: GENERATOR_ID,
      donorId: DONOR_ANN,
      householdId: null,
      pdfStorageKey: `private/statements/${ORG_ID}/${STMT_2025}/file.pdf`,
      pdfChecksum: "f".repeat(64),
    },
    {
      id: STMT_OTHER,
      organizationId: OTHER_ORG,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.PUBLISHED,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      statementIdentifier: "IND-2026-OTHER",
      deductibleTotal: "999.00",
      generatedAt: new Date("2026-09-15T12:00:00.000Z"),
      generatedByUserAccountId: GENERATOR_ID,
      donorId: DONOR_ANN,
      householdId: null,
      pdfStorageKey: `private/statements/${OTHER_ORG}/${STMT_OTHER}/file.pdf`,
      pdfChecksum: "g".repeat(64),
    },
  ];
}

describe("statement registry", () => {
  beforeEach(() => {
    seedRegistry();
    store.lastFindManyWhere = null;
    store.lastGroupByWhere = null;
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church",
      displayName: "First UPC",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
  });

  it("rejects signed-out users", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getStatementRegistry({ year: "2026" }, NOW)).rejects.toMatchObject(
      { code: "SIGNED_OUT" },
    );
  });

  it.each([RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s from the registry",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      await expect(
        getStatementRegistry({ year: "2026" }, NOW),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it("does not return statements from another organization", async () => {
    const result = await getStatementRegistry({ year: "2026" }, NOW);
    expect(result.statements.map((row) => row.id)).not.toContain(STMT_OTHER);
    expect(store.lastFindManyWhere).toMatchObject({ organizationId: ORG_ID });
    expect(store.lastGroupByWhere).toMatchObject({ organizationId: ORG_ID });
    expect(JSON.stringify(result)).not.toContain("IND-2026-OTHER");
    expect(JSON.stringify(result)).not.toContain("999.00");
  });

  it("filters to the selected year", async () => {
    const result = await getStatementRegistry({ year: "2025" }, NOW);
    expect(result.year).toBe(2025);
    expect(result.statements.map((row) => row.id)).toEqual([STMT_2025]);
    expect(result.counts).toEqual({
      generated: 0,
      published: 1,
      voided: 0,
    });
  });

  it("filters by type and status", async () => {
    const households = await getStatementRegistry(
      { year: "2026", type: "household" },
      NOW,
    );
    expect(households.statements.every((row) => row.statementType === "HOUSEHOLD")).toBe(
      true,
    );
    expect(households.statements.map((row) => row.id).sort()).toEqual(
      [STMT_HH, STMT_VOID].sort(),
    );

    const published = await getStatementRegistry(
      { year: "2026", status: "published" },
      NOW,
    );
    expect(published.statements).toEqual([
      expect.objectContaining({
        id: STMT_PUB,
        status: StatementStatus.PUBLISHED,
      }),
    ]);
  });

  it("searches by recipient name or statement identifier", async () => {
    const byIdentifier = await getStatementRegistry(
      { year: "2026", q: "HH-2026-ADAMS" },
      NOW,
    );
    expect(byIdentifier.statements.map((row) => row.id)).toEqual([STMT_HH]);

    const byName = await getStatementRegistry(
      { year: "2026", q: "adams household" },
      NOW,
    );
    expect(byName.statements.map((row) => row.id).sort()).toEqual(
      [STMT_HH, STMT_VOID].sort(),
    );
  });

  it("pages newest generated first with a stable id tie-break", async () => {
    const result = await getStatementRegistry(
      { year: "2026", page: "1" },
      NOW,
    );
    expect(result.pageSize).toBe(25);
    expect(result.statements.map((row) => row.id)).toEqual([
      STMT_NEW,
      STMT_HH,
      STMT_OLD,
      STMT_PUB,
      STMT_VOID,
    ]);
    expect(result.counts).toEqual({
      generated: 3,
      published: 1,
      voided: 1,
    });
    expect(result.canManageStatements).toBe(true);
  });

  it("does not leak storage keys, checksums, addresses, or payment details", async () => {
    const result = await getStatementRegistry({ year: "2026" }, NOW);
    const json = JSON.stringify(result);
    expect(json).not.toMatch(
      /private\/statements|checksum|10 Oak|pi_secret|internal memo/i,
    );
    expect(result.statements[0]).toEqual({
      id: STMT_NEW,
      statementIdentifier: "IND-2026-NEW1",
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.GENERATED,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      deductibleTotal: "90.00",
      generatedAt: new Date("2026-09-14T12:00:00.000Z"),
      generatedByLabel: "Terry Treasurer",
      recipientLabel: "Ann Adams",
      recipientId: DONOR_ANN,
    });
  });
});
