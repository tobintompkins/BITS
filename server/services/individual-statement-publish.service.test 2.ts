import { Readable } from "node:stream";
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
  donorId: string | null;
  householdId: string | null;
  statementType: StatementType;
  status: StatementStatus;
  statementIdentifier: string;
  pdfStorageKey: string;
  pdfChecksum: string | null;
  generatedByUserAccountId: string;
  taxYear: number | null;
  deductibleTotal: string;
};

type DonorRow = {
  id: string;
  organizationId: string;
};

const store = vi.hoisted(() => ({
  statements: [] as StatementRow[],
  donors: [] as DonorRow[],
  audits: [] as Array<Record<string, unknown>>,
  lastFindFirstWhere: null as unknown,
  opened: [] as Array<Record<string, unknown>>,
}));

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  getGivingAccess: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  openAuthorizedStatementPdf: vi.fn(),
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

vi.mock("@/lib/storage/statement-pdf", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/storage/statement-pdf")
  >("@/lib/storage/statement-pdf");
  return {
    ...actual,
    openAuthorizedStatementPdf: mocks.openAuthorizedStatementPdf,
  };
});

vi.mock("@/lib/db/prisma", () => {
  function matchesGeneratedLookup(where: {
    id?: string;
    organizationId: string;
    statementType?: StatementType;
    status?: StatementStatus;
    householdId?: null;
  }) {
    return store.statements.find((row) => {
      if (where.id && row.id !== where.id) return false;
      if (row.organizationId !== where.organizationId) return false;
      if (where.statementType && row.statementType !== where.statementType) {
        return false;
      }
      if (where.status && row.status !== where.status) return false;
      if (where.householdId === null && row.householdId !== null) return false;
      return true;
    });
  }

  const contributionStatement = {
    findFirst: async ({
      where,
    }: {
      where: {
        id?: string;
        organizationId: string;
        statementType?: StatementType;
        status?: StatementStatus;
        householdId?: null;
      };
    }) => {
      store.lastFindFirstWhere = where;
      const row = matchesGeneratedLookup(where);
      if (!row) return null;
      const donor = store.donors.find((item) => item.id === row.donorId) ?? null;
      return {
        ...row,
        donor: donor
          ? { id: donor.id, organizationId: donor.organizationId }
          : null,
      };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        id: string;
        organizationId: string;
        statementType: StatementType;
        status: StatementStatus;
      };
      data: { status: StatementStatus };
    }) => {
      const row = store.statements.find(
        (statement) =>
          statement.id === where.id &&
          statement.organizationId === where.organizationId &&
          statement.statementType === where.statementType &&
          statement.status === where.status,
      );
      if (!row) return { count: 0 };
      row.status = data.status;
      return { count: 1 };
    },
  };

  const tx = {
    contributionStatement,
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return data;
      },
    },
  };

  return {
    prisma: {
      contributionStatement,
      $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) =>
        fn(tx),
    },
  };
});

import {
  PUBLISH_CONTRIBUTION_STATEMENT,
  TWO_PERSON_PUBLISH_MESSAGE,
  publishIndividualContributionStatement,
} from "./individual-statement-publish.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const STATEMENT_ID = "00000000-0000-4000-8000-00000000b001";
const GENERATOR_ID = "00000000-0000-4000-8000-00000000c001";
const PUBLISHER_ID = "00000000-0000-4000-8000-00000000c002";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const CHECKSUM = "a".repeat(64);
const STORAGE_KEY = `private/statements/${ORG_ID}/${STATEMENT_ID}/IND-2026-ABCD.pdf`;

function generatedStatement(
  overrides: Partial<StatementRow> = {},
): StatementRow {
  return {
    id: STATEMENT_ID,
    organizationId: ORG_ID,
    donorId: DONOR_ID,
    householdId: null,
    statementType: StatementType.INDIVIDUAL,
    status: StatementStatus.GENERATED,
    statementIdentifier: "IND-2026-ABCD",
    pdfStorageKey: STORAGE_KEY,
    pdfChecksum: CHECKSUM,
    generatedByUserAccountId: GENERATOR_ID,
    taxYear: 2026,
    deductibleTotal: "90.00",
    ...overrides,
  };
}

function seedReady() {
  store.statements = [generatedStatement()];
  store.donors = [{ id: DONOR_ID, organizationId: ORG_ID }];
  store.audits = [];
  store.lastFindFirstWhere = null;
  store.opened = [];
}

describe("individual statement publish", () => {
  beforeEach(() => {
    seedReady();
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: PUBLISHER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
    mocks.openAuthorizedStatementPdf.mockImplementation(async (input) => {
      store.opened.push(input);
      const stream = Readable.from([Buffer.from("%PDF-1.4\n")]);
      return { ok: true, absolutePath: "/tmp/hidden-statement.pdf", stream };
    });
  });

  it("rejects signed-out users", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      publishIndividualContributionStatement({ statementId: STATEMENT_ID }),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
    expect(store.opened).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  it.each([RoleCode.REPORT_VIEWER, RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s from publishing",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      await expect(
        publishIndividualContributionStatement({ statementId: STATEMENT_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(store.opened).toHaveLength(0);
    },
  );

  it("does not publish a statement from another organization", async () => {
    store.statements = [
      generatedStatement({
        organizationId: OTHER_ORG,
        pdfStorageKey: `private/statements/${OTHER_ORG}/${STATEMENT_ID}/file.pdf`,
      }),
    ];
    store.donors = [{ id: DONOR_ID, organizationId: OTHER_ORG }];
    await expect(
      publishIndividualContributionStatement({ statementId: STATEMENT_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.lastFindFirstWhere).toMatchObject({
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.GENERATED,
    });
    expect(store.statements[0]?.status).toBe(StatementStatus.GENERATED);
    expect(store.opened).toHaveLength(0);
  });

  it.each([StatementStatus.PUBLISHED, StatementStatus.VOIDED])(
    "does not publish a %s statement",
    async (status) => {
      store.statements = [generatedStatement({ status })];
      await expect(
        publishIndividualContributionStatement({ statementId: STATEMENT_ID }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(store.opened).toHaveLength(0);
    },
  );

  it("does not publish a household statement", async () => {
    store.statements = [
      generatedStatement({ statementType: StatementType.HOUSEHOLD }),
    ];
    await expect(
      publishIndividualContributionStatement({ statementId: STATEMENT_ID }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not let the generator publish their own statement", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: GENERATOR_ID });
    await expect(
      publishIndividualContributionStatement({ statementId: STATEMENT_ID }),
    ).rejects.toMatchObject({
      code: "SAME_PERSON",
      message: TWO_PERSON_PUBLISH_MESSAGE,
    });
    expect(store.opened).toHaveLength(0);
    expect(store.statements[0]?.status).toBe(StatementStatus.GENERATED);
  });

  it("does not publish when the PDF is missing or unsafe", async () => {
    store.statements = [
      generatedStatement({
        pdfStorageKey: `private/statements/${ORG_ID}/${STATEMENT_ID}/../secret.pdf`,
      }),
    ];
    await expect(
      publishIndividualContributionStatement({ statementId: STATEMENT_ID }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(store.opened).toHaveLength(0);

    seedReady();
    store.statements = [generatedStatement({ pdfChecksum: null })];
    await expect(
      publishIndividualContributionStatement({ statementId: STATEMENT_ID }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(store.opened).toHaveLength(0);

    seedReady();
    mocks.openAuthorizedStatementPdf.mockResolvedValue({
      ok: false,
      reason: "UNAVAILABLE",
    });
    await expect(
      publishIndividualContributionStatement({ statementId: STATEMENT_ID }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(store.statements[0]?.status).toBe(StatementStatus.GENERATED);
    expect(store.audits).toHaveLength(0);
  });

  it("lets a different authorized person publish after PDF verification", async () => {
    const result = await publishIndividualContributionStatement({
      statementId: STATEMENT_ID,
    });
    expect(result).toEqual({
      statementId: STATEMENT_ID,
      statementIdentifier: "IND-2026-ABCD",
      donorId: DONOR_ID,
      taxYear: 2026,
      status: StatementStatus.PUBLISHED,
    });
    expect(store.statements[0]?.status).toBe(StatementStatus.PUBLISHED);
    expect(store.opened).toEqual([
      {
        organizationId: ORG_ID,
        statementId: STATEMENT_ID,
        storageKey: STORAGE_KEY,
        checksum: CHECKSUM,
      },
    ]);
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      action: PUBLISH_CONTRIBUTION_STATEMENT,
      entityType: "ContributionStatement",
      entityId: STATEMENT_ID,
      actorUserAccountId: PUBLISHER_ID,
      organizationId: ORG_ID,
    });
    const auditJson = JSON.stringify(store.audits[0]);
    expect(auditJson).toContain("GENERATED");
    expect(auditJson).toContain("PUBLISHED");
    expect(auditJson).toContain("INDIVIDUAL");
    expect(auditJson).toContain("IND-2026-ABCD");
    expect(auditJson).toContain("2026");
    expect(auditJson).toContain("90.00");
    expect(auditJson).toContain(GENERATOR_ID);
    expect(auditJson).toContain(PUBLISHER_ID);
    expect(auditJson).not.toMatch(
      /private\/statements|\/tmp\/hidden|checksum|10 Oak|pi_secret|internal memo/i,
    );
  });

  it("fails safely when a concurrent publish already transitioned the row", async () => {
    mocks.openAuthorizedStatementPdf.mockImplementation(async (input) => {
      store.opened.push(input);
      store.statements[0]!.status = StatementStatus.PUBLISHED;
      return {
        ok: true,
        absolutePath: "/tmp/hidden-statement.pdf",
        stream: Readable.from([Buffer.from("%PDF-1.4\n")]),
      };
    });
    await expect(
      publishIndividualContributionStatement({ statementId: STATEMENT_ID }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(store.audits).toHaveLength(0);
    expect(store.statements[0]?.status).toBe(StatementStatus.PUBLISHED);
  });
});
