import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FinancialCorrectionStatus,
  FinancialCorrectionType,
  RoleCode,
} from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

type QueueRow = {
  id: string;
  organizationId: string;
  requestedByUserAccountId: string;
  type: FinancialCorrectionType;
  status: FinancialCorrectionStatus;
  reason: string;
  requestedChange: string;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  offeringBatch: { id: string; name: string };
  requestedBy: { displayName: string | null; primaryEmail: string };
  reviewedBy: { displayName: string | null; primaryEmail: string } | null;
};

const store = vi.hoisted(() => ({
  rows: [] as QueueRow[],
  audits: [] as Array<Record<string, unknown>>,
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
    requireFinancialCorrectionReviewAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canReviewFinancialCorrections) throw new Error("denied");
      return access;
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    financialCorrectionRequest: {
      count: async ({
        where,
      }: {
        where: {
          organizationId: string;
          status: FinancialCorrectionStatus | { not: FinancialCorrectionStatus };
        };
      }) =>
        store.rows.filter((row) => {
          if (row.organizationId !== where.organizationId) return false;
          if (
            typeof where.status === "object" &&
            where.status &&
            "not" in where.status
          ) {
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
          status: FinancialCorrectionStatus | { not: FinancialCorrectionStatus };
        };
        orderBy: { createdAt: "asc" | "desc" };
        take: number;
      }) => {
        const rows = store.rows.filter((row) => {
          if (row.organizationId !== where.organizationId) return false;
          if (
            typeof where.status === "object" &&
            where.status &&
            "not" in where.status
          ) {
            return row.status !== where.status.not;
          }
          return row.status === where.status;
        });
        rows.sort((left, right) => {
          const delta = left.createdAt.getTime() - right.createdAt.getTime();
          return orderBy.createdAt === "asc" ? delta : -delta;
        });
        return rows.slice(0, take).map((row) => ({ ...row }));
      },
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const rowSnapshot = store.rows.map((row) => ({ ...row }));
      const auditSnapshot = [...store.audits];
      const tx = {
        financialCorrectionRequest: {
          findFirst: async ({
            where,
          }: {
            where: { id: string; organizationId: string };
          }) => {
            const row = store.rows.find(
              (item) =>
                item.id === where.id &&
                item.organizationId === where.organizationId,
            );
            return row
              ? {
                  id: row.id,
                  offeringBatchId: row.offeringBatch.id,
                  status: row.status,
                  requestedByUserAccountId: row.requestedByUserAccountId,
                }
              : null;
          },
          updateMany: async ({
            where,
            data,
          }: {
            where: {
              id: string;
              organizationId: string;
              requestedByUserAccountId: string;
              status: FinancialCorrectionStatus;
            };
            data: { status: FinancialCorrectionStatus };
          }) => {
            const row = store.rows.find(
              (item) =>
                item.id === where.id &&
                item.organizationId === where.organizationId &&
                item.requestedByUserAccountId ===
                  where.requestedByUserAccountId &&
                item.status === where.status,
            );
            if (!row) return { count: 0 };
            row.status = data.status;
            return { count: 1 };
          },
        },
        auditEvent: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            store.audits.push(data);
            return { id: `audit-${store.audits.length}` };
          },
        },
      };
      try {
        return await fn(tx);
      } catch (error) {
        store.rows = rowSnapshot;
        store.audits = auditSnapshot;
        throw error;
      }
    }),
  },
}));

import {
  FinancialCorrectionError,
  cancelFinancialCorrection,
  getFinancialCorrectionReviewQueue,
} from "./financial-correction.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";

function seedRow(overrides: Partial<QueueRow> & { id: string; createdAt: Date }) {
  store.rows.push({
    organizationId: ORG_ID,
    requestedByUserAccountId: USER_ID,
    type: FinancialCorrectionType.AMOUNT,
    status: FinancialCorrectionStatus.PENDING,
    reason: "The recorded amount was mistyped.",
    requestedChange: "Change the recorded amount to 25.00.",
    reviewNote: null,
    reviewedAt: null,
    offeringBatch: { id: "batch-1", name: "Sunday AM" },
    requestedBy: {
      displayName: "Pat Treasurer",
      primaryEmail: "pat@example.com",
    },
    reviewedBy: null,
    ...overrides,
  });
}

describe("financial correction review queue", () => {
  beforeEach(() => {
    store.rows = [];
    store.audits = [];
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First UPC",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN),
    );
  });

  it.each([RoleCode.ORG_ADMIN, RoleCode.TREASURER])(
    "lets %s load the organization-scoped queue",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(role));
      seedRow({
        id: "req-1",
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
      });
      const queue = await getFinancialCorrectionReviewQueue();
      expect(queue.pendingCount).toBe(1);
      expect(queue.completedCount).toBe(0);
      expect(queue.requests).toHaveLength(1);
      expect(queue.requests[0]).toMatchObject({
        type: FinancialCorrectionType.AMOUNT,
        status: FinancialCorrectionStatus.PENDING,
        batch: { name: "Sunday AM" },
        requester: { name: "Pat Treasurer", email: "pat@example.com" },
        reviewer: null,
      });
      expect(JSON.stringify(queue.requests[0])).not.toMatch(OTHER_ORG);
    },
  );

  it.each([
    RoleCode.DATA_ENTRY,
    RoleCode.REPORT_VIEWER,
    RoleCode.DONOR,
  ])("rejects %s from the review queue", async (role) => {
    mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(role));
    await expect(getFinancialCorrectionReviewQueue()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects signed-out users and a missing organization", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getFinancialCorrectionReviewQueue()).rejects.toMatchObject({
      code: "SIGNED_OUT",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(getFinancialCorrectionReviewQueue()).rejects.toBeInstanceOf(
      FinancialCorrectionError,
    );
    await expect(getFinancialCorrectionReviewQueue()).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("orders pending requests oldest first, then completed newest first", async () => {
    seedRow({
      id: "completed-old",
      status: FinancialCorrectionStatus.APPROVED,
      createdAt: new Date("2026-09-02T12:00:00.000Z"),
      reviewNote: "Approved after review.",
      reviewedAt: new Date("2026-09-03T12:00:00.000Z"),
      reviewedBy: {
        displayName: "Lee Admin",
        primaryEmail: "lee@example.com",
      },
      offeringBatch: { id: "batch-2", name: "Sunday PM" },
    });
    seedRow({
      id: "completed-new",
      status: FinancialCorrectionStatus.REJECTED,
      createdAt: new Date("2026-09-08T12:00:00.000Z"),
      offeringBatch: { id: "batch-3", name: "Wednesday" },
    });
    seedRow({
      id: "pending-new",
      createdAt: new Date("2026-09-07T12:00:00.000Z"),
    });
    seedRow({
      id: "pending-old",
      createdAt: new Date("2026-09-04T12:00:00.000Z"),
    });
    seedRow({
      id: "other-org",
      organizationId: OTHER_ORG,
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
    });

    const queue = await getFinancialCorrectionReviewQueue();
    expect(queue.pendingCount).toBe(2);
    expect(queue.completedCount).toBe(2);
    expect(queue.requests.map((row) => row.id)).toEqual([
      "pending-old",
      "pending-new",
      "completed-new",
      "completed-old",
    ]);
    expect(queue.requests[3]?.reviewer).toMatchObject({
      name: "Lee Admin",
      email: "lee@example.com",
      reviewNote: "Approved after review.",
    });
  });

  it("limits the page to 100 requests while keeping pending first", async () => {
    for (let index = 0; index < 12; index += 1) {
      seedRow({
        id: `completed-${index}`,
        status: FinancialCorrectionStatus.APPROVED,
        createdAt: new Date(Date.UTC(2026, 7, index + 1)),
      });
    }
    for (let index = 0; index < 95; index += 1) {
      seedRow({
        id: `pending-${index}`,
        createdAt: new Date(Date.UTC(2026, 8, 1, index)),
      });
    }

    const queue = await getFinancialCorrectionReviewQueue();
    expect(queue.pendingCount).toBe(95);
    expect(queue.completedCount).toBe(12);
    expect(queue.requests).toHaveLength(100);
    expect(
      queue.requests.filter((row) => row.status === FinancialCorrectionStatus.PENDING),
    ).toHaveLength(95);
    expect(
      queue.requests.filter((row) => row.status !== FinancialCorrectionStatus.PENDING),
    ).toHaveLength(5);
    expect(queue.requests[0]?.id).toBe("pending-0");
    expect(queue.requests[94]?.id).toBe("pending-94");
    expect(queue.requests[95]?.id).toBe("completed-11");
  });
});

const OTHER_USER = "00000000-0000-4000-8000-00000000c002";

describe("financial correction cancellation", () => {
  beforeEach(() => {
    store.rows = [];
    store.audits = [];
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First UPC",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN),
    );
  });

  it("lets the original requester cancel a pending request and writes an audit event", async () => {
    seedRow({
      id: "req-1",
      createdAt: new Date("2026-09-10T12:00:00.000Z"),
    });

    const result = await cancelFinancialCorrection("req-1");
    expect(result.status).toBe(FinancialCorrectionStatus.CANCELLED);
    expect(store.rows[0]?.status).toBe(FinancialCorrectionStatus.CANCELLED);
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      action: "CANCEL_FINANCIAL_CORRECTION",
      entityType: "FinancialCorrectionRequest",
      entityId: "req-1",
      organizationId: ORG_ID,
      actorUserAccountId: USER_ID,
    });
    expect(JSON.stringify(store.audits[0])).toContain(
      FinancialCorrectionStatus.PENDING,
    );
    expect(JSON.stringify(store.audits[0])).toContain(
      FinancialCorrectionStatus.CANCELLED,
    );
  });

  it("does not let another user cancel the request, including an administrator", async () => {
    seedRow({
      id: "req-1",
      requestedByUserAccountId: OTHER_USER,
      createdAt: new Date("2026-09-10T12:00:00.000Z"),
    });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN),
    );

    await expect(cancelFinancialCorrection("req-1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(store.rows[0]?.status).toBe(FinancialCorrectionStatus.PENDING);
    expect(store.audits).toHaveLength(0);
  });

  it.each([
    FinancialCorrectionStatus.APPROVED,
    FinancialCorrectionStatus.REJECTED,
    FinancialCorrectionStatus.CANCELLED,
  ])("cannot cancel a %s request", async (status) => {
    seedRow({
      id: "req-1",
      status,
      createdAt: new Date("2026-09-10T12:00:00.000Z"),
    });

    await expect(cancelFinancialCorrection("req-1")).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(store.rows[0]?.status).toBe(status);
    expect(store.audits).toHaveLength(0);
  });

  it("does not cancel a request from another organization", async () => {
    seedRow({
      id: "req-1",
      organizationId: OTHER_ORG,
      createdAt: new Date("2026-09-10T12:00:00.000Z"),
    });

    await expect(cancelFinancialCorrection("req-1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(store.rows[0]?.status).toBe(FinancialCorrectionStatus.PENDING);
    expect(store.audits).toHaveLength(0);
  });
});
