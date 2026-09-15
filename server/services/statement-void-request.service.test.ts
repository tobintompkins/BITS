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
  donorId: string | null;
  householdId: string | null;
  pdfStorageKey: string;
  pdfChecksum: string;
};

type VoidRequestRow = {
  id: string;
  organizationId: string;
  contributionStatementId: string;
  status: StatementVoidRequestStatus;
  reason: string;
  requestedByUserAccountId: string;
};

type AuditRow = {
  action: string;
  entityType: string;
  entityId: string;
  organizationId: string;
  actorUserAccountId: string | null;
  changeMetadata: { changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> };
};

const store = vi.hoisted(() => ({
  statements: [] as StatementRow[],
  donors: [] as Array<{ id: string; organizationId: string }>,
  households: [] as Array<{ id: string; organizationId: string }>,
  requests: [] as VoidRequestRow[],
  audits: [] as AuditRow[],
  statementUpdates: 0,
  skipPendingLookup: false,
  lastLockWhere: null as { id?: string; organizationId?: string } | null,
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
      const id = String(values[0] ?? "");
      const organizationId = String(values[1] ?? "");
      store.lastLockWhere = { id, organizationId };
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
          donorId: row.donorId,
          householdId: row.householdId,
          donor: store.donors.find((donor) => donor.id === row.donorId) ?? null,
          household:
            store.households.find((household) => household.id === row.householdId) ??
            null,
        };
      },
      update: async () => {
        store.statementUpdates += 1;
        throw new Error("statement records must not be updated");
      },
      updateMany: async () => {
        store.statementUpdates += 1;
        throw new Error("statement records must not be updated");
      },
    },
    statementVoidRequest: {
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId: string;
          contributionStatementId: string;
          status: StatementVoidRequestStatus;
        };
      }) => {
        if (store.skipPendingLookup) return null;
        return (
          store.requests.find(
            (row) =>
              row.organizationId === where.organizationId &&
              row.contributionStatementId === where.contributionStatementId &&
              row.status === where.status,
          ) ?? null
        );
      },
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          contributionStatementId: string;
          requestedByUserAccountId: string;
          reason: string;
          status: StatementVoidRequestStatus;
        };
        select: { id: true; status: true; contributionStatementId: true };
      }) => {
        const duplicate = store.requests.find(
          (row) =>
            row.contributionStatementId === data.contributionStatementId &&
            row.status === StatementVoidRequestStatus.PENDING &&
            data.status === StatementVoidRequestStatus.PENDING,
        );
        if (duplicate) {
          throw { code: "P2002" };
        }
        const row: VoidRequestRow = {
          id: `req-${store.requests.length + 1}`,
          organizationId: data.organizationId,
          contributionStatementId: data.contributionStatementId,
          status: data.status,
          reason: data.reason,
          requestedByUserAccountId: data.requestedByUserAccountId,
        };
        store.requests.push(row);
        return {
          id: row.id,
          status: row.status,
          contributionStatementId: row.contributionStatementId,
        };
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
  REQUEST_CONTRIBUTION_STATEMENT_VOID,
  createStatementVoidRequest,
} from "./statement-void-request.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ANN = "00000000-0000-4000-8000-00000000d001";
const OTHER_DONOR = "00000000-0000-4000-8000-00000000d099";
const STMT = "00000000-0000-4000-8000-00000000b001";
const STMT_OTHER = "00000000-0000-4000-8000-00000000b002";
const STMT_VOIDED = "00000000-0000-4000-8000-00000000b003";
const REASON = "The published total does not match the locked batch.";

function seed() {
  store.donors = [
    { id: DONOR_ANN, organizationId: ORG_ID },
    { id: OTHER_DONOR, organizationId: OTHER_ORG },
  ];
  store.households = [];
  store.statements = [
    {
      id: STMT,
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.PUBLISHED,
      statementIdentifier: "IND-2026-ADAM",
      donorId: DONOR_ANN,
      householdId: null,
      pdfStorageKey: `private/statements/${ORG_ID}/${STMT}/file.pdf`,
      pdfChecksum: "a".repeat(64),
    },
    {
      id: STMT_OTHER,
      organizationId: OTHER_ORG,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.GENERATED,
      statementIdentifier: "IND-2026-OTHER",
      donorId: OTHER_DONOR,
      householdId: null,
      pdfStorageKey: `private/statements/${OTHER_ORG}/${STMT_OTHER}/file.pdf`,
      pdfChecksum: "b".repeat(64),
    },
    {
      id: STMT_VOIDED,
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.VOIDED,
      statementIdentifier: "IND-2026-VOID",
      donorId: DONOR_ANN,
      householdId: null,
      pdfStorageKey: `private/statements/${ORG_ID}/${STMT_VOIDED}/file.pdf`,
      pdfChecksum: "c".repeat(64),
    },
  ];
  store.requests = [];
  store.audits = [];
  store.statementUpdates = 0;
  store.skipPendingLookup = false;
  store.lastLockWhere = null;
}

describe("statement void requests", () => {
  beforeEach(() => {
    seed();
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
    await expect(
      createStatementVoidRequest({ statementId: STMT, reason: REASON }),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
    expect(store.requests).toHaveLength(0);
  });

  it.each([RoleCode.REPORT_VIEWER, RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s because statement viewing is not enough",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      await expect(
        createStatementVoidRequest({ statementId: STMT, reason: REASON }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(store.requests).toHaveLength(0);
      expect(store.lastLockWhere).toBeNull();
    },
  );

  it("does not reveal other-organization or invalid statement ids", async () => {
    await expect(
      createStatementVoidRequest({ statementId: "not-a-uuid", reason: REASON }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createStatementVoidRequest({ statementId: STMT_OTHER, reason: REASON }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.requests).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
    expect(store.lastLockWhere).toEqual({
      id: STMT_OTHER,
      organizationId: ORG_ID,
    });
  });

  it("denies voided statements without changing them", async () => {
    await expect(
      createStatementVoidRequest({ statementId: STMT_VOIDED, reason: REASON }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(store.requests).toHaveLength(0);
    expect(store.statementUpdates).toBe(0);
    expect(
      store.statements.find((row) => row.id === STMT_VOIDED)?.status,
    ).toBe(StatementStatus.VOIDED);
  });

  it("requires a reason between 10 and 1000 characters", async () => {
    await expect(
      createStatementVoidRequest({ statementId: STMT, reason: "too short" }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      createStatementVoidRequest({
        statementId: STMT,
        reason: "x".repeat(1001),
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(store.requests).toHaveLength(0);
  });

  it("prevents a second pending request for the same statement", async () => {
    await createStatementVoidRequest({ statementId: STMT, reason: REASON });
    await expect(
      createStatementVoidRequest({
        statementId: STMT,
        reason: "Another explanation that is long enough.",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(store.requests).toHaveLength(1);
    expect(store.requests[0]?.status).toBe(StatementVoidRequestStatus.PENDING);
    expect(
      store.statements.find((row) => row.id === STMT)?.status,
    ).toBe(StatementStatus.PUBLISHED);
  });

  it("maps a unique-constraint race to a duplicate pending error", async () => {
    store.requests.push({
      id: "req-existing",
      organizationId: ORG_ID,
      contributionStatementId: STMT,
      status: StatementVoidRequestStatus.PENDING,
      reason: REASON,
      requestedByUserAccountId: USER_ID,
    });
    store.skipPendingLookup = true;
    await expect(
      createStatementVoidRequest({ statementId: STMT, reason: REASON }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(store.requests).toHaveLength(1);
    expect(store.audits).toHaveLength(0);
    expect(store.statementUpdates).toBe(0);
  });

  it("records a pending request and safe audit without changing the statement", async () => {
    const result = await createStatementVoidRequest({
      statementId: STMT,
      reason: REASON,
    });
    expect(result).toEqual({
      id: "req-1",
      status: StatementVoidRequestStatus.PENDING,
      statementId: STMT,
      statementStatus: StatementStatus.PUBLISHED,
      statementIdentifier: "IND-2026-ADAM",
    });
    expect(store.requests).toEqual([
      expect.objectContaining({
        contributionStatementId: STMT,
        status: StatementVoidRequestStatus.PENDING,
        reason: REASON,
      }),
    ]);
    expect(store.statementUpdates).toBe(0);
    expect(
      store.statements.find((row) => row.id === STMT)?.status,
    ).toBe(StatementStatus.PUBLISHED);
    expect(
      store.statements.find((row) => row.id === STMT)?.pdfStorageKey,
    ).toContain("private/statements/");
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      action: REQUEST_CONTRIBUTION_STATEMENT_VOID,
      entityType: "StatementVoidRequest",
      entityId: "req-1",
      organizationId: ORG_ID,
      actorUserAccountId: USER_ID,
    });
    const json = JSON.stringify(store.audits[0]);
    expect(json).not.toContain(REASON);
    expect(json).not.toMatch(/private\/statements|checksum/i);
    expect(store.audits[0]?.changeMetadata.changes).toEqual([
      {
        field: "contributionStatementId",
        oldValue: null,
        newValue: STMT,
      },
      {
        field: "statementType",
        oldValue: null,
        newValue: StatementType.INDIVIDUAL,
      },
      {
        field: "statementIdentifier",
        oldValue: null,
        newValue: "IND-2026-ADAM",
      },
      {
        field: "status",
        oldValue: null,
        newValue: StatementStatus.PUBLISHED,
      },
      {
        field: "requestStatus",
        oldValue: null,
        newValue: StatementVoidRequestStatus.PENDING,
      },
    ]);
  });
});
