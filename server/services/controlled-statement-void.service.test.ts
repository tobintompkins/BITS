import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RoleCode,
  StatementStatus,
  StatementType,
  StatementVoidRequestStatus,
} from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

type StatementRow = {
  id: string;
  organizationId: string;
  statementType: StatementType;
  status: StatementStatus;
  statementIdentifier: string;
  taxYear: number | null;
  deductibleTotal: { toString(): string };
  donorId: string | null;
  householdId: string | null;
  pdfStorageKey: string;
  pdfChecksum: string;
  generatedByUserAccountId: string;
};

type VoidRequestRow = {
  id: string;
  organizationId: string;
  contributionStatementId: string;
  status: StatementVoidRequestStatus;
  reason: string;
  requestedByUserAccountId: string;
  reviewedByUserAccountId: string | null;
  reviewNote: string | null;
};

type AuditRow = {
  action: string;
  entityType: string;
  entityId: string;
  organizationId: string;
  actorUserAccountId: string | null;
  changeMetadata: {
    changes: Array<{ field: string; oldValue: string | null; newValue: string | null }>;
  };
};

const store = vi.hoisted(() => ({
  statements: [] as StatementRow[],
  donors: [] as Array<{ id: string; organizationId: string }>,
  households: [] as Array<{ id: string; organizationId: string }>,
  requests: [] as VoidRequestRow[],
  audits: [] as AuditRow[],
  forceUpdateManyCount: null as number | null,
  lastStatementUpdate: null as unknown,
  lastRequestLock: null as { id?: string; organizationId?: string } | null,
  lastStatementLock: null as { id?: string; organizationId?: string } | null,
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
    requireStatementManageAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canManageStatements) throw new Error("denied");
      return access;
    },
  };
});

vi.mock("@/lib/db/prisma", () => {
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join(" ");
      const id = String(values[0] ?? "");
      const organizationId = String(values[1] ?? "");
      if (sql.includes("statement_void_requests")) {
        store.lastRequestLock = { id, organizationId };
        const row = store.requests.find(
          (request) =>
            request.id === id && request.organizationId === organizationId,
        );
        return row ? [{ id: row.id }] : [];
      }
      store.lastStatementLock = { id, organizationId };
      const row = store.statements.find(
        (statement) =>
          statement.id === id && statement.organizationId === organizationId,
      );
      return row ? [{ id: row.id }] : [];
    },
    contributionStatement: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => {
        const row = store.statements.find(
          (statement) =>
            statement.id === where.id &&
            statement.organizationId === where.organizationId,
        );
        if (!row) return null;
        return {
          id: row.id,
          status: row.status,
          statementType: row.statementType,
          statementIdentifier: row.statementIdentifier,
          taxYear: row.taxYear,
          deductibleTotal: row.deductibleTotal,
          donorId: row.donorId,
          householdId: row.householdId,
          donor: store.donors.find((donor) => donor.id === row.donorId) ?? null,
          household:
            store.households.find(
              (household) => household.id === row.householdId,
            ) ?? null,
        };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          organizationId: string;
          status: { in: StatementStatus[] };
        };
        data: { status: StatementStatus };
      }) => {
        store.lastStatementUpdate = { where, data };
        if (store.forceUpdateManyCount != null) {
          return { count: store.forceUpdateManyCount };
        }
        const row = store.statements.find(
          (statement) =>
            statement.id === where.id &&
            statement.organizationId === where.organizationId &&
            where.status.in.includes(statement.status),
        );
        if (!row) return { count: 0 };
        row.status = data.status;
        return { count: 1 };
      },
    },
    statementVoidRequest: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) =>
        store.requests.find(
          (row) => row.id === where.id && row.organizationId === where.organizationId,
        ) ?? null,
      update: async () => {
        throw new Error("void request records must not be rewritten on execute");
      },
      updateMany: async () => {
        throw new Error("void request records must not be rewritten on execute");
      },
    },
    auditEvent: {
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          actorUserAccountId: string | null;
          action: string;
          entityType: string;
          entityId: string;
          changeMetadata: AuditRow["changeMetadata"];
        };
      }) => {
        store.audits.push(data);
        return data;
      },
    },
  };

  return {
    prisma: {
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
    },
  };
});

import {
  portalPublishedIndividualStatementWhere,
  portalPublishedStatementAccessWhere,
} from "./member-portal-statement-pdf.service";
import {
  EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST,
  VOID_CONTRIBUTION_STATEMENT,
  executeApprovedStatementVoid,
} from "./controlled-statement-void.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const REVIEWER_ID = "00000000-0000-4000-8000-00000000c001";
const REQUESTER_ID = "00000000-0000-4000-8000-00000000c002";
const OTHER_USER = "00000000-0000-4000-8000-00000000c003";
const DONOR_ANN = "00000000-0000-4000-8000-00000000d001";
const STMT = "00000000-0000-4000-8000-00000000b001";
const STMT_OTHER = "00000000-0000-4000-8000-00000000b002";
const REQ = "00000000-0000-4000-8000-00000000f001";
const REQ_OTHER = "00000000-0000-4000-8000-00000000f002";
const PDF_KEY = `private/statements/${ORG_ID}/${STMT}/file.pdf`;
const PDF_SUM = "a".repeat(64);
const REASON = "The published total does not match the locked batch.";
const NOTE = "Totals were checked against the locked batch.";

function seed() {
  store.donors = [{ id: DONOR_ANN, organizationId: ORG_ID }];
  store.households = [];
  store.statements = [
    {
      id: STMT,
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.PUBLISHED,
      statementIdentifier: "IND-2026-ADAM",
      taxYear: 2026,
      deductibleTotal: { toString: () => "90.00" },
      donorId: DONOR_ANN,
      householdId: null,
      pdfStorageKey: PDF_KEY,
      pdfChecksum: PDF_SUM,
      generatedByUserAccountId: REQUESTER_ID,
    },
  ];
  store.requests = [
    {
      id: REQ,
      organizationId: ORG_ID,
      contributionStatementId: STMT,
      status: StatementVoidRequestStatus.APPROVED,
      reason: REASON,
      requestedByUserAccountId: REQUESTER_ID,
      reviewedByUserAccountId: REVIEWER_ID,
      reviewNote: NOTE,
    },
  ];
  store.audits = [];
  store.forceUpdateManyCount = null;
  store.lastStatementUpdate = null;
  store.lastRequestLock = null;
  store.lastStatementLock = null;
}

describe("controlled statement void", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: REVIEWER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
  });

  it("rejects signed-out users without looking up a request", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      executeApprovedStatementVoid({ requestId: REQ, confirmed: true }),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
    expect(store.lastRequestLock).toBeNull();
    expect(store.statements[0]?.status).toBe(StatementStatus.PUBLISHED);
  });

  it.each([RoleCode.REPORT_VIEWER, RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s without revealing whether the request exists",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      await expect(
        executeApprovedStatementVoid({ requestId: REQ, confirmed: true }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(store.lastRequestLock).toBeNull();
    },
  );

  it("does not reveal other-organization or invalid request ids", async () => {
    store.statements.push({
      ...store.statements[0]!,
      id: STMT_OTHER,
      organizationId: OTHER_ORG,
      statementIdentifier: "IND-2026-OTHER",
      pdfStorageKey: `private/statements/${OTHER_ORG}/${STMT_OTHER}/file.pdf`,
    });
    store.requests.push({
      id: REQ_OTHER,
      organizationId: OTHER_ORG,
      contributionStatementId: STMT_OTHER,
      status: StatementVoidRequestStatus.APPROVED,
      reason: REASON,
      requestedByUserAccountId: REQUESTER_ID,
      reviewedByUserAccountId: REVIEWER_ID,
      reviewNote: NOTE,
    });
    await expect(
      executeApprovedStatementVoid({ requestId: "not-a-uuid", confirmed: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      executeApprovedStatementVoid({ requestId: REQ_OTHER, confirmed: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.lastRequestLock).toEqual({
      id: REQ_OTHER,
      organizationId: ORG_ID,
    });
    expect(store.lastStatementLock).toBeNull();
    expect(store.audits).toHaveLength(0);
  });

  it("does not let the requester execute the void", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: REQUESTER_ID });
    await expect(
      executeApprovedStatementVoid({ requestId: REQ, confirmed: true }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(/requested this void cannot execute/i),
    });
    expect(store.statements[0]?.status).toBe(StatementStatus.PUBLISHED);
    expect(store.audits).toHaveLength(0);
  });

  it("does not let a non-reviewer execute the void", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: OTHER_USER });
    await expect(
      executeApprovedStatementVoid({ requestId: REQ, confirmed: true }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(/who approved this void request/i),
    });
    expect(store.statements[0]?.status).toBe(StatementStatus.PUBLISHED);
    expect(store.audits).toHaveLength(0);
  });

  it("denies non-approved requests and unconfirmed execution", async () => {
    store.requests[0]!.status = StatementVoidRequestStatus.PENDING;
    await expect(
      executeApprovedStatementVoid({ requestId: REQ, confirmed: true }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    store.requests[0]!.status = StatementVoidRequestStatus.APPROVED;
    await expect(
      executeApprovedStatementVoid({ requestId: REQ, confirmed: false }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(store.statements[0]?.status).toBe(StatementStatus.PUBLISHED);
    expect(store.audits).toHaveLength(0);
  });

  it("denies an already voided statement without rewriting the PDF", async () => {
    store.statements[0]!.status = StatementStatus.VOIDED;
    await expect(
      executeApprovedStatementVoid({ requestId: REQ, confirmed: true }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringMatching(/already been voided/i),
    });
    expect(store.statements[0]?.pdfStorageKey).toBe(PDF_KEY);
    expect(store.statements[0]?.pdfChecksum).toBe(PDF_SUM);
    expect(store.audits).toHaveLength(0);
  });

  it("fails a concurrent void without changing retained statement data", async () => {
    store.forceUpdateManyCount = 0;
    await expect(
      executeApprovedStatementVoid({ requestId: REQ, confirmed: true }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringMatching(/already voided|no longer eligible/i),
    });
    expect(store.statements[0]?.status).toBe(StatementStatus.PUBLISHED);
    expect(store.statements[0]?.pdfStorageKey).toBe(PDF_KEY);
    expect(store.audits).toHaveLength(0);
  });

  it("voids the statement in a transaction and writes safe audits", async () => {
    const result = await executeApprovedStatementVoid({
      requestId: REQ,
      confirmed: true,
    });
    expect(result).toEqual({
      requestId: REQ,
      statementId: STMT,
      statementIdentifier: "IND-2026-ADAM",
      statementStatus: StatementStatus.VOIDED,
      statementType: StatementType.INDIVIDUAL,
      donorId: DONOR_ANN,
      householdId: null,
    });
    expect(store.statements[0]).toMatchObject({
      status: StatementStatus.VOIDED,
      pdfStorageKey: PDF_KEY,
      pdfChecksum: PDF_SUM,
      donorId: DONOR_ANN,
      householdId: null,
      statementIdentifier: "IND-2026-ADAM",
      generatedByUserAccountId: REQUESTER_ID,
    });
    expect(store.statements[0]?.deductibleTotal.toString()).toBe("90.00");
    expect(store.lastStatementUpdate).toEqual({
      where: {
        id: STMT,
        organizationId: ORG_ID,
        status: {
          in: [StatementStatus.GENERATED, StatementStatus.PUBLISHED],
        },
      },
      data: { status: StatementStatus.VOIDED },
    });
    expect(store.requests[0]?.status).toBe(StatementVoidRequestStatus.APPROVED);
    expect(store.requests[0]?.reason).toBe(REASON);
    expect(store.audits).toHaveLength(2);
    expect(store.audits[0]).toMatchObject({
      action: VOID_CONTRIBUTION_STATEMENT,
      entityType: "ContributionStatement",
      entityId: STMT,
    });
    expect(store.audits[1]).toMatchObject({
      action: EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST,
      entityType: "StatementVoidRequest",
      entityId: REQ,
    });
    const json = JSON.stringify(store.audits);
    expect(json).not.toContain(REASON);
    expect(json).not.toContain(NOTE);
    expect(json).not.toMatch(/private\/statements|checksum|10 Oak|pi_secret/i);
    expect(store.audits[0]?.changeMetadata.changes).toEqual(
      expect.arrayContaining([
        {
          field: "status",
          oldValue: StatementStatus.PUBLISHED,
          newValue: StatementStatus.VOIDED,
        },
        {
          field: "statementIdentifier",
          oldValue: null,
          newValue: "IND-2026-ADAM",
        },
        {
          field: "statementVoidRequestId",
          oldValue: null,
          newValue: REQ,
        },
        {
          field: "executedByUserAccountId",
          oldValue: null,
          newValue: REVIEWER_ID,
        },
      ]),
    );
  });

  it("keeps member-portal published queries exclusive of VOIDED statements", () => {
    const individual = portalPublishedIndividualStatementWhere({
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      statementId: STMT,
    });
    const access = portalPublishedStatementAccessWhere({
      organizationId: ORG_ID,
      donorId: DONOR_ANN,
      authorizedHouseholdIds: ["00000000-0000-4000-8000-00000000e001"],
      statementId: STMT,
    });
    expect(individual.status).toBe("PUBLISHED");
    expect(JSON.stringify(individual)).not.toContain("VOIDED");
    expect(JSON.stringify(individual)).not.toContain("GENERATED");
    expect(JSON.stringify(access)).not.toContain("VOIDED");
    expect(JSON.stringify(access)).not.toContain("GENERATED");
    expect(access.OR.every((branch) => branch.status === "PUBLISHED")).toBe(
      true,
    );
  });
});
