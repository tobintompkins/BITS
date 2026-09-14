import { beforeEach, describe, expect, it, vi } from "vitest";

import { OfferingBatchStatus, RoleCode } from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

type BatchRow = {
  id: string;
  organizationId: string;
  status: OfferingBatchStatus;
  expectedTotal: { toString(): string } | null;
  recordedTotal: { toString(): string };
};

type DonationRow = {
  organizationId: string;
  batchId: string;
  totalAmount: { toString(): string };
  allocations: Array<{ amount: { toString(): string } }>;
};

const store = vi.hoisted(() => ({
  batches: new Map<string, BatchRow>(),
  donations: [] as DonationRow[],
  audits: [] as Array<Record<string, unknown>>,
  persistShouldFail: false,
  pendingRecordedTotal: null as string | null,
  txChain: Promise.resolve(),
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
    requireBatchViewAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canViewBatches) throw new Error("denied");
      return access;
    },
    requireBatchCompleteEntryAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canCompleteBatchEntry) throw new Error("denied");
      return access;
    },
    requireBatchReconcileAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canReconcileBatches) throw new Error("denied");
      return access;
    },
  };
});

function money(value: string) {
  return { toString: () => value };
}

vi.mock("@/server/repositories/offering-batch.repository", () => ({
  findBatchIntegrityRows: async (organizationId: string, batchId: string) =>
    store.donations
      .filter(
        (row) =>
          row.organizationId === organizationId && row.batchId === batchId,
      )
      .map((row) => ({
        totalAmount: row.totalAmount,
        allocations: row.allocations,
      })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    offeringBatch: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => {
        const row = store.batches.get(where.id);
        if (!row || row.organizationId !== where.organizationId) return null;
        return { ...row };
      },
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
      const run = store.txChain.then(async () => {
        const batchSnapshot = [...store.batches.entries()].map(([id, row]) => [
          id,
          {
            ...row,
            recordedTotal: money(row.recordedTotal.toString()),
            expectedTotal: row.expectedTotal
              ? money(row.expectedTotal.toString())
              : null,
          },
        ]) as Array<[string, BatchRow]>;
        const donationSnapshot = store.donations.map((row) => ({
          ...row,
          allocations: [...row.allocations],
        }));
        const auditSnapshot = [...store.audits];
        const tx = {
          offeringBatch: {
            findFirst: async ({
              where,
            }: {
              where: { id: string; organizationId: string };
            }) => {
              const row = store.batches.get(where.id);
              if (!row || row.organizationId !== where.organizationId) {
                return null;
              }
              return { ...row };
            },
            updateMany: async ({
              where,
              data,
            }: {
              where: {
                id: string;
                organizationId: string;
                status: OfferingBatchStatus;
                recordedTotal: string;
              };
              data: { status: OfferingBatchStatus };
            }) => {
              const row = store.batches.get(where.id);
              if (store.pendingRecordedTotal && row) {
                row.recordedTotal = money(store.pendingRecordedTotal);
              }
              if (
                !row ||
                row.organizationId !== where.organizationId ||
                row.status !== where.status ||
                row.recordedTotal.toString() !== where.recordedTotal
              ) {
                return { count: 0 };
              }
              row.status = data.status;
              return { count: 1 };
            },
          },
          auditEvent: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              if (store.persistShouldFail) {
                throw new Error("audit write failed");
              }
              store.audits.push(data);
              return { id: `audit-${store.audits.length}` };
            },
          },
        };
        try {
          return await fn(tx);
        } catch (error) {
          store.batches = new Map(batchSnapshot);
          store.donations = donationSnapshot;
          store.audits = auditSnapshot;
          throw error;
        }
      });
      store.txChain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    }),
  },
}));

import {
  COMPLETE_OFFERING_BATCH_ENTRY,
  OfferingBatchTransitionError,
  RECONCILE_OFFERING_BATCH,
  completeOfferingBatchEntry,
  reconcileOfferingBatch,
} from "./offering-batch-transition.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const BATCH_ID = "00000000-0000-4000-8000-00000000b001";

function seedBatch(
  overrides: Partial<BatchRow> & { expected?: string | null; recorded?: string } = {},
) {
  store.batches.set(BATCH_ID, {
    id: BATCH_ID,
    organizationId: ORG_ID,
    status: overrides.status ?? OfferingBatchStatus.DRAFT,
    expectedTotal:
      overrides.expected === undefined
        ? money("25.00")
        : overrides.expected == null
          ? null
          : money(overrides.expected),
    recordedTotal: money(overrides.recorded ?? "25.00"),
  });
}

function seedBalancedDonation() {
  store.donations = [
    {
      organizationId: ORG_ID,
      batchId: BATCH_ID,
      totalAmount: money("25.00"),
      allocations: [{ amount: money("10.00") }, { amount: money("15.00") }],
    },
  ];
}

describe("offering batch entry completion and reconciliation", () => {
  beforeEach(() => {
    store.batches.clear();
    store.donations = [];
    store.audits = [];
    store.persistShouldFail = false;
    store.pendingRecordedTotal = null;
    store.txChain = Promise.resolve();
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID, name: "First UPC" });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN),
    );
    seedBatch();
    seedBalancedDonation();
  });

  it.each([RoleCode.ORG_ADMIN, RoleCode.TREASURER, RoleCode.DATA_ENTRY])(
    "lets %s complete draft entry",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(role));
      const result = await completeOfferingBatchEntry(BATCH_ID, { confirmed: true });
      expect(result.status).toBe(OfferingBatchStatus.ENTERED);
      expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.ENTERED);
      expect(store.batches.get(BATCH_ID)?.recordedTotal.toString()).toBe("25.00");
      expect(store.batches.get(BATCH_ID)?.expectedTotal?.toString()).toBe("25.00");
      expect(store.donations[0]?.totalAmount.toString()).toBe("25.00");
      expect(store.audits).toHaveLength(1);
      expect(store.audits[0]).toMatchObject({
        action: COMPLETE_OFFERING_BATCH_ENTRY,
        entityType: "OfferingBatch",
        entityId: BATCH_ID,
        organizationId: ORG_ID,
        actorUserAccountId: USER_ID,
      });
      expect(JSON.stringify(store.audits[0])).not.toMatch(
        /@|check number|stripe|whsec_|donor/i,
      );
    },
  );

  it("blocks REPORT_VIEWER, DONOR, and signed-out users from transitions", async () => {
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER),
    );
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.DONOR),
    );
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.DRAFT);
    expect(store.audits).toHaveLength(0);
  });

  it("lets only ORG_ADMIN and TREASURER reconcile, not DATA_ENTRY", async () => {
    seedBatch({ status: OfferingBatchStatus.ENTERED });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.DATA_ENTRY),
    );
    await expect(
      reconcileOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
    await expect(
      reconcileOfferingBatch(BATCH_ID, { confirmed: true }),
    ).resolves.toMatchObject({ status: OfferingBatchStatus.RECONCILED });
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      action: RECONCILE_OFFERING_BATCH,
      entityType: "OfferingBatch",
    });
  });

  it("rejects a cross-organization batch", async () => {
    store.batches.get(BATCH_ID)!.organizationId = OTHER_ORG;
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.audits).toHaveLength(0);
  });

  it("rejects empty batches and allocation problems", async () => {
    store.donations = [];
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "NO_DONATIONS" });

    store.donations = [
      {
        organizationId: ORG_ID,
        batchId: BATCH_ID,
        totalAmount: money("25.00"),
        allocations: [],
      },
    ];
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "DONATION_WITHOUT_ALLOCATIONS" });

    store.donations = [
      {
        organizationId: ORG_ID,
        batchId: BATCH_ID,
        totalAmount: money("25.00"),
        allocations: [{ amount: money("20.00") }],
      },
    ];
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "ALLOCATION_TOTAL_MISMATCH" });

    seedBalancedDonation();
    store.batches.get(BATCH_ID)!.recordedTotal = money("40.00");
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "BATCH_RECORDED_TOTAL_MISMATCH" });
    expect(store.audits).toHaveLength(0);
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.DRAFT);
  });

  it("rejects reconciliation without a matching expected total", async () => {
    seedBatch({ status: OfferingBatchStatus.ENTERED, expected: null });
    await expect(
      reconcileOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "EXPECTED_TOTAL_REQUIRED" });

    seedBatch({
      status: OfferingBatchStatus.ENTERED,
      expected: "30.00",
      recorded: "25.00",
    });
    await expect(
      reconcileOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "BATCH_NOT_BALANCED" });
    expect(store.audits).toHaveLength(0);
  });

  it("reconciles a balanced ENTERED batch without changing totals", async () => {
    seedBatch({ status: OfferingBatchStatus.ENTERED });
    const before = structuredClone({
      expected: store.batches.get(BATCH_ID)?.expectedTotal?.toString(),
      recorded: store.batches.get(BATCH_ID)?.recordedTotal.toString(),
      donation: store.donations[0]?.totalAmount.toString(),
      allocation: store.donations[0]?.allocations[0]?.amount.toString(),
    });
    await reconcileOfferingBatch(BATCH_ID, { confirmed: true });
    expect(store.batches.get(BATCH_ID)?.status).toBe(
      OfferingBatchStatus.RECONCILED,
    );
    expect(store.batches.get(BATCH_ID)?.expectedTotal?.toString()).toBe(
      before.expected,
    );
    expect(store.batches.get(BATCH_ID)?.recordedTotal.toString()).toBe(
      before.recorded,
    );
    expect(store.donations[0]?.totalAmount.toString()).toBe(before.donation);
    expect(store.donations[0]?.allocations[0]?.amount.toString()).toBe(
      before.allocation,
    );
  });

  it("does not jump from DRAFT to RECONCILED or change finished batches", async () => {
    await expect(
      reconcileOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });

    seedBatch({ status: OfferingBatchStatus.RECONCILED });
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    await expect(
      reconcileOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });

    seedBatch({ status: OfferingBatchStatus.LOCKED });
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    expect(store.audits).toHaveLength(0);
  });

  it("allows only one concurrent completion", async () => {
    const [first, second] = await Promise.allSettled([
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ]);
    const successes = [first, second].filter((row) => row.status === "fulfilled");
    const failures = [first, second].filter((row) => row.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.ENTERED);
    expect(store.audits).toHaveLength(1);
  });

  it("does not reconcile when recordedTotal changes concurrently", async () => {
    seedBatch({ status: OfferingBatchStatus.ENTERED });
    store.pendingRecordedTotal = "40.00";
    await expect(
      reconcileOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "CONCURRENT_CHANGE" });
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.ENTERED);
    expect(store.audits).toHaveLength(0);
  });

  it("rolls back a successful-looking transition when audit creation fails", async () => {
    store.persistShouldFail = true;
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: true }),
    ).rejects.toBeInstanceOf(OfferingBatchTransitionError);
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.DRAFT);
    expect(store.audits).toHaveLength(0);
  });

  it("requires explicit confirmation", async () => {
    await expect(
      completeOfferingBatchEntry(BATCH_ID, { confirmed: false }),
    ).rejects.toMatchObject({ code: "NOT_CONFIRMED" });
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.DRAFT);
  });
});
