import { beforeEach, describe, expect, it, vi } from "vitest";

import { OfferingBatchStatus, RoleCode } from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

type BatchRow = {
  id: string;
  organizationId: string;
  status: OfferingBatchStatus;
  expectedTotal: { toString(): string } | null;
  recordedTotal: { toString(): string };
  offeringDate: Date;
  depositDate: Date | null;
  depositReference: string | null;
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
  pendingStatus: null as OfferingBatchStatus | null,
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
    requireBatchDepositAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canRecordBatchDeposits) throw new Error("denied");
      return access;
    },
    requireBatchLockAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canLockBatches) throw new Error("denied");
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
              data: {
                status?: OfferingBatchStatus;
                depositDate?: Date;
                depositReference?: string;
              };
            }) => {
              const row = store.batches.get(where.id);
              if (store.pendingRecordedTotal && row) {
                row.recordedTotal = money(store.pendingRecordedTotal);
              }
              if (store.pendingStatus && row) {
                row.status = store.pendingStatus;
              }
              if (
                !row ||
                row.organizationId !== where.organizationId ||
                row.status !== where.status ||
                row.recordedTotal.toString() !== where.recordedTotal
              ) {
                return { count: 0 };
              }
              if (data.status !== undefined) row.status = data.status;
              if (data.depositDate !== undefined) {
                row.depositDate = data.depositDate;
              }
              if (data.depositReference !== undefined) {
                row.depositReference = data.depositReference;
              }
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
  LOCK_OFFERING_BATCH,
  OfferingBatchDepositError,
  RECORD_BATCH_DEPOSIT,
  UPDATE_BATCH_DEPOSIT,
  lockOfferingBatch,
  recordOfferingBatchDeposit,
} from "./offering-batch-deposit.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const BATCH_ID = "00000000-0000-4000-8000-00000000b001";
const OFFERING_DATE = new Date("2026-09-06T00:00:00.000Z");
const DEPOSIT_DATE = new Date("2026-09-10T00:00:00.000Z");

const validDeposit = {
  depositDate: "2026-09-10",
  depositReference: "SLIP-1001",
  organizationId: OTHER_ORG,
  status: OfferingBatchStatus.LOCKED,
  recordedTotal: "9999.00",
  expectedTotal: "9999.00",
  depositedAmount: "9999.00",
};

function seedBatch(
  overrides: Partial<BatchRow> & { expected?: string | null; recorded?: string } = {},
) {
  store.batches.set(BATCH_ID, {
    id: BATCH_ID,
    organizationId: ORG_ID,
    status: overrides.status ?? OfferingBatchStatus.RECONCILED,
    expectedTotal:
      overrides.expected === undefined
        ? money("25.00")
        : overrides.expected == null
          ? null
          : money(overrides.expected),
    recordedTotal: money(overrides.recorded ?? "25.00"),
    offeringDate: overrides.offeringDate ?? OFFERING_DATE,
    depositDate: overrides.depositDate ?? null,
    depositReference: overrides.depositReference ?? null,
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

function seedDepositedBatch() {
  seedBatch({
    status: OfferingBatchStatus.RECONCILED,
    depositDate: DEPOSIT_DATE,
    depositReference: "SLIP-1001",
  });
}

describe("offering batch deposit tracking and locking", () => {
  beforeEach(() => {
    store.batches.clear();
    store.donations = [];
    store.audits = [];
    store.persistShouldFail = false;
    store.pendingStatus = null;
    store.pendingRecordedTotal = null;
    store.txChain = Promise.resolve();
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First UPC",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN),
    );
    seedBatch();
    seedBalancedDonation();
  });

  it.each([RoleCode.ORG_ADMIN, RoleCode.TREASURER])(
    "lets %s record deposit information",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(role));
      const result = await recordOfferingBatchDeposit(BATCH_ID, validDeposit);
      expect(result.unchanged).toBe(false);
      expect(store.batches.get(BATCH_ID)?.depositReference).toBe("SLIP-1001");
      expect(store.batches.get(BATCH_ID)?.depositDate?.toISOString()).toBe(
        "2026-09-10T00:00:00.000Z",
      );
      expect(store.batches.get(BATCH_ID)?.status).toBe(
        OfferingBatchStatus.RECONCILED,
      );
      expect(store.batches.get(BATCH_ID)?.recordedTotal.toString()).toBe("25.00");
      expect(store.audits).toHaveLength(1);
      expect(store.audits[0]).toMatchObject({
        action: RECORD_BATCH_DEPOSIT,
        entityType: "OfferingBatch",
        entityId: BATCH_ID,
        organizationId: ORG_ID,
        actorUserAccountId: USER_ID,
      });
      expect(JSON.stringify(store.audits[0])).not.toMatch(
        /@|check number|stripe|whsec_|donor|routing number|bank-account/i,
      );
    },
  );

  it("uses UPDATE_BATCH_DEPOSIT when deposit information changes", async () => {
    seedDepositedBatch();
    await recordOfferingBatchDeposit(BATCH_ID, {
      depositDate: "2026-09-11",
      depositReference: "SLIP-1002",
    });
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      action: UPDATE_BATCH_DEPOSIT,
      entityType: "OfferingBatch",
    });
    expect(store.batches.get(BATCH_ID)?.depositReference).toBe("SLIP-1002");
  });

  it("does not write an audit event when deposit values are unchanged", async () => {
    seedDepositedBatch();
    const result = await recordOfferingBatchDeposit(BATCH_ID, {
      depositDate: "2026-09-10",
      depositReference: "SLIP-1001",
    });
    expect(result.unchanged).toBe(true);
    expect(store.audits).toHaveLength(0);
  });

  it.each([RoleCode.DATA_ENTRY, RoleCode.REPORT_VIEWER])(
    "does not let %s modify deposit information or lock",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(role));
      await expect(
        recordOfferingBatchDeposit(BATCH_ID, validDeposit),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      seedDepositedBatch();
      await expect(
        lockOfferingBatch(BATCH_ID, { confirmed: true }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(store.batches.get(BATCH_ID)?.depositReference).toBe("SLIP-1001");
      expect(store.batches.get(BATCH_ID)?.status).toBe(
        OfferingBatchStatus.RECONCILED,
      );
      expect(store.audits).toHaveLength(0);
    },
  );

  it.each([RoleCode.ORG_ADMIN, RoleCode.TREASURER])(
    "lets %s lock a deposited reconciled batch",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(role));
      seedDepositedBatch();
      const before = structuredClone({
        expected: store.batches.get(BATCH_ID)?.expectedTotal?.toString(),
        recorded: store.batches.get(BATCH_ID)?.recordedTotal.toString(),
        donation: store.donations[0]?.totalAmount.toString(),
        allocation: store.donations[0]?.allocations[0]?.amount.toString(),
        deposit: store.batches.get(BATCH_ID)?.depositReference,
      });
      const result = await lockOfferingBatch(BATCH_ID, { confirmed: true });
      expect(result.status).toBe(OfferingBatchStatus.LOCKED);
      expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.LOCKED);
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
      expect(store.batches.get(BATCH_ID)?.depositReference).toBe(before.deposit);
      expect(store.audits).toHaveLength(1);
      expect(store.audits[0]).toMatchObject({
        action: LOCK_OFFERING_BATCH,
        entityType: "OfferingBatch",
        entityId: BATCH_ID,
      });
      expect(JSON.stringify(store.audits[0])).not.toMatch(
        /@|check number|stripe|whsec_|donor/i,
      );
    },
  );

  it("rejects DONOR and signed-out users", async () => {
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.DONOR),
    );
    await expect(
      recordOfferingBatchDeposit(BATCH_ID, validDeposit),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      recordOfferingBatchDeposit(BATCH_ID, validDeposit),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
    expect(store.audits).toHaveLength(0);
  });

  it("rejects a cross-organization batch for view-through mutation, update, and lock", async () => {
    store.batches.get(BATCH_ID)!.organizationId = OTHER_ORG;
    await expect(
      recordOfferingBatchDeposit(BATCH_ID, validDeposit),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.audits).toHaveLength(0);
  });

  it.each([OfferingBatchStatus.DRAFT, OfferingBatchStatus.ENTERED])(
    "rejects deposit information and locking on %s batches",
    async (status) => {
      seedBatch({ status });
      await expect(
        recordOfferingBatchDeposit(BATCH_ID, validDeposit),
      ).rejects.toMatchObject({ code: "INVALID_STATUS" });
      await expect(
        lockOfferingBatch(BATCH_ID, { confirmed: true }),
      ).rejects.toMatchObject({ code: "INVALID_STATUS" });
      expect(store.batches.get(BATCH_ID)?.depositReference).toBeNull();
      expect(store.batches.get(BATCH_ID)?.status).toBe(status);
      expect(store.audits).toHaveLength(0);
    },
  );

  it("cannot lock a reconciled batch without deposit information", async () => {
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "DEPOSIT_REQUIRED" });
    expect(store.batches.get(BATCH_ID)?.status).toBe(
      OfferingBatchStatus.RECONCILED,
    );
    expect(store.audits).toHaveLength(0);
  });

  it("rejects deposit dates before the offering date or in the future", async () => {
    await expect(
      recordOfferingBatchDeposit(BATCH_ID, {
        depositDate: "2026-09-01",
        depositReference: "SLIP-1001",
      }),
    ).rejects.toMatchObject({ code: "DEPOSIT_DATE_BEFORE_OFFERING" });

    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 2);
    await expect(
      recordOfferingBatchDeposit(BATCH_ID, {
        depositDate: future.toISOString().slice(0, 10),
        depositReference: "SLIP-1001",
      }),
    ).rejects.toMatchObject({ code: "DEPOSIT_DATE_IN_FUTURE" });
    expect(store.batches.get(BATCH_ID)?.depositDate).toBeNull();
    expect(store.audits).toHaveLength(0);
  });

  it("rejects a blank deposit reference", async () => {
    await expect(
      recordOfferingBatchDeposit(BATCH_ID, {
        depositDate: "2026-09-10",
        depositReference: "   ",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(store.audits).toHaveLength(0);
  });

  it("rejects unbalanced, empty, and inconsistent batches for deposit and lock", async () => {
    seedBatch({
      status: OfferingBatchStatus.RECONCILED,
      expected: "30.00",
      recorded: "25.00",
    });
    await expect(
      recordOfferingBatchDeposit(BATCH_ID, validDeposit),
    ).rejects.toMatchObject({ code: "BATCH_NOT_BALANCED" });
    seedDepositedBatch();
    store.batches.get(BATCH_ID)!.expectedTotal = money("30.00");
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "BATCH_NOT_BALANCED" });

    seedDepositedBatch();
    store.donations = [];
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "NO_DONATIONS" });

    seedDepositedBatch();
    store.donations = [
      {
        organizationId: ORG_ID,
        batchId: BATCH_ID,
        totalAmount: money("25.00"),
        allocations: [{ amount: money("20.00") }],
      },
    ];
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "ALLOCATION_TOTAL_MISMATCH" });

    seedDepositedBatch();
    store.donations = [
      {
        organizationId: ORG_ID,
        batchId: BATCH_ID,
        totalAmount: money("25.00"),
        allocations: [],
      },
    ];
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "DONATION_WITHOUT_ALLOCATIONS" });
    expect(store.audits).toHaveLength(0);
    expect(store.batches.get(BATCH_ID)?.status).toBe(
      OfferingBatchStatus.RECONCILED,
    );
  });

  it("rejects locking when recorded total is not positive", async () => {
    seedBatch({
      expected: "0.00",
      recorded: "0.00",
      depositDate: DEPOSIT_DATE,
      depositReference: "SLIP-1001",
    });
    store.donations = [
      {
        organizationId: ORG_ID,
        batchId: BATCH_ID,
        totalAmount: money("0.00"),
        allocations: [{ amount: money("0.00") }],
      },
    ];
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "RECORDED_TOTAL_NOT_POSITIVE" });
    await expect(
      recordOfferingBatchDeposit(BATCH_ID, validDeposit),
    ).rejects.toMatchObject({ code: "RECORDED_TOTAL_NOT_POSITIVE" });
  });

  it("does not overwrite a newly locked batch with a concurrent deposit update", async () => {
    seedDepositedBatch();
    store.pendingStatus = OfferingBatchStatus.LOCKED;
    await expect(
      recordOfferingBatchDeposit(BATCH_ID, {
        depositDate: "2026-09-11",
        depositReference: "SHOULD-NOT-SAVE",
      }),
    ).rejects.toMatchObject({ code: "CONCURRENT_CHANGE" });
    expect(store.batches.get(BATCH_ID)?.depositReference).toBe("SLIP-1001");
    expect(store.audits).toHaveLength(0);
  });

  it("allows only one concurrent lock to succeed", async () => {
    seedDepositedBatch();
    const [first, second] = await Promise.allSettled([
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ]);
    const successes = [first, second].filter((row) => row.status === "fulfilled");
    const failures = [first, second].filter((row) => row.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.LOCKED);
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({ action: LOCK_OFFERING_BATCH });
  });

  it("rolls back a deposit update when audit creation fails", async () => {
    store.persistShouldFail = true;
    await expect(
      recordOfferingBatchDeposit(BATCH_ID, validDeposit),
    ).rejects.toBeInstanceOf(OfferingBatchDepositError);
    expect(store.batches.get(BATCH_ID)?.depositReference).toBeNull();
    expect(store.audits).toHaveLength(0);
  });

  it("rolls back a lock transition when audit creation fails", async () => {
    seedDepositedBatch();
    store.persistShouldFail = true;
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toBeInstanceOf(OfferingBatchDepositError);
    expect(store.batches.get(BATCH_ID)?.status).toBe(
      OfferingBatchStatus.RECONCILED,
    );
    expect(store.audits).toHaveLength(0);
  });

  it("rejects every deposit and lock mutation on a locked batch", async () => {
    seedBatch({
      status: OfferingBatchStatus.LOCKED,
      depositDate: DEPOSIT_DATE,
      depositReference: "SLIP-1001",
    });
    await expect(
      recordOfferingBatchDeposit(BATCH_ID, {
        depositDate: "2026-09-11",
        depositReference: "CHANGED",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: true }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    expect(store.batches.get(BATCH_ID)?.depositReference).toBe("SLIP-1001");
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.LOCKED);
    expect(store.audits).toHaveLength(0);
  });

  it("requires explicit confirmation before locking", async () => {
    seedDepositedBatch();
    await expect(
      lockOfferingBatch(BATCH_ID, { confirmed: false }),
    ).rejects.toMatchObject({ code: "NOT_CONFIRMED" });
    expect(store.batches.get(BATCH_ID)?.status).toBe(
      OfferingBatchStatus.RECONCILED,
    );
  });
});
