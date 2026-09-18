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
  mailingAddressLine1?: string;
  stripePaymentIntentId?: string;
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

type VoidRequestRow = {
  id: string;
  organizationId: string;
  contributionStatementId: string;
  status: StatementVoidRequestStatus;
  reason: string;
  requestedByUserAccountId: string;
  reviewedByUserAccountId: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  requestedBy: { displayName: string | null; primaryEmail: string };
  reviewedBy: { displayName: string | null; primaryEmail: string } | null;
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
  donors: [] as DonorRow[],
  households: [] as HouseholdRow[],
  requests: [] as VoidRequestRow[],
  audits: [] as AuditRow[],
  statementUpdates: 0,
  forceUpdateManyCount: null as number | null,
  lastLockWhere: null as { id?: string; organizationId?: string } | null,
  lastFindManyWhere: null as unknown,
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
  function statementPayload(row: StatementRow) {
    return {
      id: row.id,
      statementIdentifier: row.statementIdentifier,
      statementType: row.statementType,
      status: row.status,
      donorId: row.donorId,
      householdId: row.householdId,
      donor: store.donors.find((donor) => donor.id === row.donorId) ?? null,
      household:
        store.households.find((household) => household.id === row.householdId) ??
        null,
    };
  }

  const tx = {
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      const id = String(values[0] ?? "");
      const organizationId = String(values[1] ?? "");
      store.lastLockWhere = { id, organizationId };
      const row = store.requests.find(
        (request) =>
          request.id === id && request.organizationId === organizationId,
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
        where: { id: string; organizationId: string };
      }) =>
        store.requests.find(
          (row) => row.id === where.id && row.organizationId === where.organizationId,
        ) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          organizationId: string;
          status: StatementVoidRequestStatus;
        };
        data: {
          status: StatementVoidRequestStatus;
          reviewNote: string;
          reviewedByUserAccountId: string;
          reviewedAt: Date;
        };
      }) => {
        if (store.forceUpdateManyCount != null) {
          return { count: store.forceUpdateManyCount };
        }
        const row = store.requests.find(
          (request) =>
            request.id === where.id &&
            request.organizationId === where.organizationId &&
            request.status === where.status,
        );
        if (!row) return { count: 0 };
        row.status = data.status;
        row.reviewNote = data.reviewNote;
        row.reviewedByUserAccountId = data.reviewedByUserAccountId;
        row.reviewedAt = data.reviewedAt;
        return { count: 1 };
      },
      count: async ({
        where,
      }: {
        where: {
          organizationId: string;
          status: StatementVoidRequestStatus | { not: StatementVoidRequestStatus };
        };
      }) =>
        store.requests.filter((row) => {
          if (row.organizationId !== where.organizationId) return false;
          if (typeof where.status === "object" && where.status && "not" in where.status) {
            return row.status !== where.status.not;
          }
          return row.status === where.status;
        }).length,
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: {
          organizationId: string;
          status: StatementVoidRequestStatus | { not: StatementVoidRequestStatus };
        };
        orderBy: { createdAt: "asc" | "desc" };
        take: number;
      }) => {
        store.lastFindManyWhere = where;
        const rows = store.requests.filter((row) => {
          if (row.organizationId !== where.organizationId) return false;
          if (typeof where.status === "object" && where.status && "not" in where.status) {
            return row.status !== where.status.not;
          }
          return row.status === where.status;
        });
        const sorted = [...rows].sort((left, right) => {
          const delta = left.createdAt.getTime() - right.createdAt.getTime();
          return orderBy.createdAt === "asc" ? delta : -delta;
        });
        return sorted.slice(0, take).map((row) => {
          const statement = store.statements.find(
            (item) => item.id === row.contributionStatementId,
          );
          return {
            ...row,
            statement: statement
              ? statementPayload(statement)
              : {
                  id: row.contributionStatementId,
                  statementIdentifier: "MISSING",
                  statementType: StatementType.INDIVIDUAL,
                  status: StatementStatus.GENERATED,
                  donorId: null,
                  householdId: null,
                  donor: null,
                  household: null,
                },
          };
        });
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
      statementVoidRequest: tx.statementVoidRequest,
    },
  };
});

import {
  APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST,
  REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST,
  decideStatementVoidRequest,
  getStatementVoidReviewQueue,
} from "./statement-void-review.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const REVIEWER_ID = "00000000-0000-4000-8000-00000000c001";
const REQUESTER_ID = "00000000-0000-4000-8000-00000000c002";
const DONOR_ANN = "00000000-0000-4000-8000-00000000d001";
const STMT = "00000000-0000-4000-8000-00000000b001";
const STMT_OTHER = "00000000-0000-4000-8000-00000000b002";
const REQ = "00000000-0000-4000-8000-00000000f001";
const REQ_OTHER = "00000000-0000-4000-8000-00000000f002";
const REASON = "The published total does not match the locked batch.";
const NOTE = "Totals were checked against the locked batch.";

function seedStatement(overrides: Partial<StatementRow> = {}): StatementRow {
  const row: StatementRow = {
    id: STMT,
    organizationId: ORG_ID,
    statementType: StatementType.INDIVIDUAL,
    status: StatementStatus.PUBLISHED,
    statementIdentifier: "IND-2026-ADAM",
    donorId: DONOR_ANN,
    householdId: null,
    pdfStorageKey: `private/statements/${ORG_ID}/${STMT}/file.pdf`,
    pdfChecksum: "a".repeat(64),
    mailingAddressLine1: "10 Oak Street",
    stripePaymentIntentId: "pi_secret",
    ...overrides,
  };
  store.statements.push(row);
  return row;
}

function seedRequest(overrides: Partial<VoidRequestRow> = {}): VoidRequestRow {
  const row: VoidRequestRow = {
    id: REQ,
    organizationId: ORG_ID,
    contributionStatementId: STMT,
    status: StatementVoidRequestStatus.PENDING,
    reason: REASON,
    requestedByUserAccountId: REQUESTER_ID,
    reviewedByUserAccountId: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: new Date("2026-09-10T12:00:00.000Z"),
    requestedBy: {
      displayName: "Terry Treasurer",
      primaryEmail: "terry@church.test",
    },
    reviewedBy: null,
    ...overrides,
  };
  store.requests.push(row);
  return row;
}

describe("statement void review queue", () => {
  beforeEach(() => {
    store.statements = [];
    store.donors = [
      { id: DONOR_ANN, organizationId: ORG_ID, firstName: "Ann", lastName: "Adams" },
    ];
    store.households = [];
    store.requests = [];
    store.audits = [];
    store.statementUpdates = 0;
    store.forceUpdateManyCount = null;
    store.lastLockWhere = null;
    store.lastFindManyWhere = null;
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: REVIEWER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
    seedStatement();
  });

  it("rejects signed-out users", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getStatementVoidReviewQueue()).rejects.toMatchObject({
      code: "SIGNED_OUT",
    });
  });

  it.each([RoleCode.REPORT_VIEWER, RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s from the review queue",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(role));
      await expect(getStatementVoidReviewQueue()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    },
  );

  it("lists current-organization pending requests oldest first, then reviewed newest first", async () => {
    seedRequest({
      id: "00000000-0000-4000-8000-00000000f010",
      createdAt: new Date("2026-09-07T12:00:00.000Z"),
    });
    seedRequest({
      id: "00000000-0000-4000-8000-00000000f011",
      createdAt: new Date("2026-09-04T12:00:00.000Z"),
    });
    seedRequest({
      id: "00000000-0000-4000-8000-00000000f012",
      status: StatementVoidRequestStatus.APPROVED,
      createdAt: new Date("2026-09-08T12:00:00.000Z"),
      reviewNote: "Checked and approved.",
      reviewedAt: new Date("2026-09-09T12:00:00.000Z"),
      reviewedByUserAccountId: REVIEWER_ID,
      reviewedBy: { displayName: "Patty Pastor", primaryEmail: "patty@church.test" },
    });
    seedRequest({
      id: "00000000-0000-4000-8000-00000000f013",
      status: StatementVoidRequestStatus.REJECTED,
      createdAt: new Date("2026-09-02T12:00:00.000Z"),
    });
    seedStatement({
      id: STMT_OTHER,
      organizationId: OTHER_ORG,
      statementIdentifier: "IND-2026-OTHER",
    });
    seedRequest({
      id: REQ_OTHER,
      organizationId: OTHER_ORG,
      contributionStatementId: STMT_OTHER,
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
    });

    const queue = await getStatementVoidReviewQueue();
    expect(queue.pendingCount).toBe(2);
    expect(queue.completedCount).toBe(2);
    expect(queue.requests.map((row) => row.id)).toEqual([
      "00000000-0000-4000-8000-00000000f011",
      "00000000-0000-4000-8000-00000000f010",
      "00000000-0000-4000-8000-00000000f012",
      "00000000-0000-4000-8000-00000000f013",
    ]);
    expect(queue.requests[0]).toMatchObject({
      statementIdentifier: "IND-2026-ADAM",
      statementType: StatementType.INDIVIDUAL,
      statementStatus: StatementStatus.PUBLISHED,
      recipientLabel: "Ann Adams",
      requester: { name: "Terry Treasurer", email: "terry@church.test" },
    });
    expect(
      queue.requests.find(
        (row) => row.id === "00000000-0000-4000-8000-00000000f012",
      )?.canExecuteApprovedVoid,
    ).toBe(true);
    expect(
      queue.requests.filter((row) => row.id !== "00000000-0000-4000-8000-00000000f012")
        .every((row) => row.canExecuteApprovedVoid === false),
    ).toBe(true);
    const json = JSON.stringify(queue);
    expect(json).not.toContain(REQ_OTHER);
    expect(json).not.toContain("IND-2026-OTHER");
    expect(json).not.toContain(DONOR_ANN);
    expect(json).not.toContain(REQUESTER_ID);
    expect(json).not.toContain(REVIEWER_ID);
    expect(json).not.toMatch(/private\/statements|checksum|10 Oak|pi_secret/i);
  });
});

describe("statement void request decisions", () => {
  beforeEach(() => {
    store.statements = [];
    store.donors = [
      { id: DONOR_ANN, organizationId: ORG_ID, firstName: "Ann", lastName: "Adams" },
    ];
    store.households = [];
    store.requests = [];
    store.audits = [];
    store.statementUpdates = 0;
    store.forceUpdateManyCount = null;
    store.lastLockWhere = null;
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: REVIEWER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN),
    );
    seedStatement();
    seedRequest();
  });

  it("rejects signed-out users without looking up a request", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      decideStatementVoidRequest(REQ, { decision: "APPROVED", reviewNote: NOTE }),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
    expect(store.lastLockWhere).toBeNull();
    expect(store.requests[0]?.status).toBe(StatementVoidRequestStatus.PENDING);
  });

  it.each([RoleCode.REPORT_VIEWER, RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s without revealing whether the request exists",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(role));
      await expect(
        decideStatementVoidRequest(REQ, { decision: "APPROVED", reviewNote: NOTE }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(store.lastLockWhere).toBeNull();
    },
  );

  it("does not reveal other-organization or invalid request ids", async () => {
    seedStatement({
      id: STMT_OTHER,
      organizationId: OTHER_ORG,
      statementIdentifier: "IND-2026-OTHER",
    });
    seedRequest({
      id: REQ_OTHER,
      organizationId: OTHER_ORG,
      contributionStatementId: STMT_OTHER,
    });
    await expect(
      decideStatementVoidRequest("not-a-uuid", {
        decision: "APPROVED",
        reviewNote: NOTE,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      decideStatementVoidRequest(REQ_OTHER, {
        decision: "APPROVED",
        reviewNote: NOTE,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.lastLockWhere).toEqual({
      id: REQ_OTHER,
      organizationId: ORG_ID,
    });
    expect(store.requests.find((row) => row.id === REQ_OTHER)?.status).toBe(
      StatementVoidRequestStatus.PENDING,
    );
    expect(store.audits).toHaveLength(0);
  });

  it("does not let the requester review their own request", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: REQUESTER_ID });
    await expect(
      decideStatementVoidRequest(REQ, { decision: "APPROVED", reviewNote: NOTE }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(/second authorized person/i),
    });
    expect(store.requests[0]?.status).toBe(StatementVoidRequestStatus.PENDING);
    expect(store.audits).toHaveLength(0);
    expect(store.statementUpdates).toBe(0);
  });

  it("rejects non-pending requests and short review notes", async () => {
    store.requests[0]!.status = StatementVoidRequestStatus.APPROVED;
    await expect(
      decideStatementVoidRequest(REQ, { decision: "REJECTED", reviewNote: NOTE }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    store.requests[0]!.status = StatementVoidRequestStatus.PENDING;
    await expect(
      decideStatementVoidRequest(REQ, { decision: "APPROVED", reviewNote: "no" }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      decideStatementVoidRequest(REQ, { decision: "MAYBE", reviewNote: NOTE }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(store.audits).toHaveLength(0);
  });

  it("fails a concurrent decision without changing the statement", async () => {
    store.forceUpdateManyCount = 0;
    await expect(
      decideStatementVoidRequest(REQ, { decision: "APPROVED", reviewNote: NOTE }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringMatching(/already decided/i),
    });
    expect(store.requests[0]?.status).toBe(StatementVoidRequestStatus.PENDING);
    expect(store.audits).toHaveLength(0);
    expect(store.statementUpdates).toBe(0);
    expect(
      store.statements.find((row) => row.id === STMT)?.status,
    ).toBe(StatementStatus.PUBLISHED);
  });

  it("approves a pending request and writes a safe audit without voiding", async () => {
    const result = await decideStatementVoidRequest(REQ, {
      decision: "APPROVED",
      reviewNote: NOTE,
    });
    expect(result).toEqual({
      id: REQ,
      status: StatementVoidRequestStatus.APPROVED,
      statementId: STMT,
      statementStatus: StatementStatus.PUBLISHED,
      statementIdentifier: "IND-2026-ADAM",
    });
    expect(store.requests[0]?.status).toBe(StatementVoidRequestStatus.APPROVED);
    expect(store.requests[0]?.reviewNote).toBe(NOTE);
    expect(store.requests[0]?.reviewedByUserAccountId).toBe(REVIEWER_ID);
    expect(store.statementUpdates).toBe(0);
    expect(
      store.statements.find((row) => row.id === STMT)?.status,
    ).toBe(StatementStatus.PUBLISHED);
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      action: APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST,
      entityType: "StatementVoidRequest",
      entityId: REQ,
      organizationId: ORG_ID,
      actorUserAccountId: REVIEWER_ID,
    });
    const json = JSON.stringify(store.audits[0]);
    expect(json).not.toContain(REASON);
    expect(json).not.toContain(NOTE);
    expect(json).not.toMatch(/private\/statements|checksum|10 Oak|pi_secret/i);
    expect(store.audits[0]?.changeMetadata.changes).toEqual(
      expect.arrayContaining([
        {
          field: "contributionStatementId",
          oldValue: null,
          newValue: STMT,
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
          oldValue: StatementVoidRequestStatus.PENDING,
          newValue: StatementVoidRequestStatus.APPROVED,
        },
        {
          field: "requestedByUserAccountId",
          oldValue: null,
          newValue: REQUESTER_ID,
        },
        {
          field: "reviewedByUserAccountId",
          oldValue: null,
          newValue: REVIEWER_ID,
        },
      ]),
    );
  });

  it("rejects a pending request and leaves the statement published", async () => {
    const result = await decideStatementVoidRequest(REQ, {
      decision: "REJECTED",
      reviewNote: NOTE,
    });
    expect(result.status).toBe(StatementVoidRequestStatus.REJECTED);
    expect(store.requests[0]?.status).toBe(StatementVoidRequestStatus.REJECTED);
    expect(store.audits[0]?.action).toBe(
      REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST,
    );
    expect(
      store.statements.find((row) => row.id === STMT)?.status,
    ).toBe(StatementStatus.PUBLISHED);
    expect(store.statementUpdates).toBe(0);
    expect(JSON.stringify(store.audits[0])).not.toContain(NOTE);
  });
});
