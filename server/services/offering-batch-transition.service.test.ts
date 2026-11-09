import { beforeEach, describe, expect, it, vi } from "vitest";

import { OfferingBatchStatus, RoleCode } from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";
import { BATCH_INTEGRITY_MESSAGES } from "@/lib/batches/integrity";
import { batchNextStep } from "@/lib/batches/next-step";

type BatchRow = {
  id: string;
  organizationId: string;
  status: OfferingBatchStatus;
  expectedTotal: { toString(): string } | null;
  recordedTotal: { toString(): string };
  reviewVersion: number;
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
          $queryRaw: async (
            strings: TemplateStringsArray,
            ...values: unknown[]
          ) => {
            const sql = strings.join("?");
            if (sql.includes("FROM organizations")) {
              return [{ id: String(values[0]) }];
            }
            if (sql.includes("FROM offering_batches")) {
              const row = store.batches.get(String(values[0]));
              if (!row || row.organizationId !== String(values[1])) return [];
              return [
                {
                  id: row.id,
                  status: row.status,
                  expectedTotal: row.expectedTotal?.toString() ?? null,
                  recordedTotal: row.recordedTotal.toString(),
                  offeringDate: new Date("2026-09-06T00:00:00.000Z"),
                  depositDate: null,
                  depositReference: null,
                },
              ];
            }
            return [];
          },
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
                reviewVersion?: number;
              };
              data: {
                status: OfferingBatchStatus;
                reviewVersion?: { increment: number };
              };
            }) => {
              const row = store.batches.get(where.id);
              if (store.pendingRecordedTotal && row) {
                row.recordedTotal = money(store.pendingRecordedTotal);
              }
              if (
                !row ||
                row.organizationId !== where.organizationId ||
                row.status !== where.status ||
                row.recordedTotal.toString() !== where.recordedTotal ||
                (where.reviewVersion != null &&
                  row.reviewVersion !== where.reviewVersion)
              ) {
                return { count: 0 };
              }
              row.status = data.status;
              if (data.reviewVersion?.increment) {
                row.reviewVersion += data.reviewVersion.increment;
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
  COMPLETE_OFFERING_BATCH_ENTRY,
  OfferingBatchTransitionError,
  RECONCILE_OFFERING_BATCH,
  completeOfferingBatchEntry,
  getOfferingBatchReview,
  reconcileOfferingBatch,
} from "./offering-batch-transition.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const BATCH_ID = "00000000-0000-4000-8000-00000000b001";

function snapshot(
  overrides: {
    recordedTotal?: string;
    expectedTotal?: string | null;
    donationCount?: number;
    reviewVersion?: number;
  } = {},
) {
  return {
    confirmed: true as const,
    recordedTotal: overrides.recordedTotal ?? "25.00",
    expectedTotal:
      overrides.expectedTotal === undefined ? "25.00" : overrides.expectedTotal,
    donationCount: overrides.donationCount ?? 1,
    reviewVersion: overrides.reviewVersion ?? 1,
  };
}

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
    reviewVersion: overrides.reviewVersion ?? 1,
    offeringDate: overrides.offeringDate ?? new Date("2026-09-06T00:00:00.000Z"),
    depositDate: overrides.depositDate === undefined ? null : overrides.depositDate,
    depositReference:
      overrides.depositReference === undefined ? null : overrides.depositReference,
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
      const result = await completeOfferingBatchEntry(BATCH_ID, snapshot());
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
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.DONOR),
    );
    await expect(
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
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
      reconcileOfferingBatch(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
    await expect(
      reconcileOfferingBatch(BATCH_ID, snapshot()),
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
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.audits).toHaveLength(0);
  });

  it("rejects empty batches and allocation problems", async () => {
    store.donations = [];
    await expect(
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
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
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
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
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "ALLOCATION_TOTAL_MISMATCH" });

    seedBalancedDonation();
    store.batches.get(BATCH_ID)!.recordedTotal = money("40.00");
    await expect(
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "BATCH_RECORDED_TOTAL_MISMATCH" });
    expect(store.audits).toHaveLength(0);
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.DRAFT);
  });

  it("rejects reconciliation without a matching expected total", async () => {
    seedBatch({ status: OfferingBatchStatus.ENTERED, expected: null });
    await expect(
      reconcileOfferingBatch(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "EXPECTED_TOTAL_REQUIRED" });

    seedBatch({
      status: OfferingBatchStatus.ENTERED,
      expected: "30.00",
      recorded: "25.00",
    });
    await expect(
      reconcileOfferingBatch(BATCH_ID, snapshot()),
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
    await reconcileOfferingBatch(BATCH_ID, snapshot());
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
      reconcileOfferingBatch(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });

    seedBatch({ status: OfferingBatchStatus.RECONCILED });
    await expect(
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    await expect(
      reconcileOfferingBatch(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });

    seedBatch({ status: OfferingBatchStatus.LOCKED });
    await expect(
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
    expect(store.audits).toHaveLength(0);
  });

  it("allows only one concurrent completion", async () => {
    const [first, second] = await Promise.allSettled([
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
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
      reconcileOfferingBatch(BATCH_ID, snapshot()),
    ).rejects.toMatchObject({ code: "CONCURRENT_CHANGE" });
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.ENTERED);
    expect(store.audits).toHaveLength(0);
  });

  it("rolls back a successful-looking transition when audit creation fails", async () => {
    store.persistShouldFail = true;
    await expect(
      completeOfferingBatchEntry(BATCH_ID, snapshot()),
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

  it("rejects a stale confirmation that does not match the current snapshot", async () => {
    await expect(
      completeOfferingBatchEntry(
        BATCH_ID,
        snapshot({ recordedTotal: "10.00", donationCount: 0 }),
      ),
    ).rejects.toMatchObject({ code: "CONCURRENT_CHANGE" });
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.DRAFT);
    expect(store.audits).toHaveLength(0);
  });

  it("rejects a same-total confirmation bound to an older review version", async () => {
    store.batches.get(BATCH_ID)!.reviewVersion = 3;
    await expect(
      completeOfferingBatchEntry(BATCH_ID, snapshot({ reviewVersion: 2 })),
    ).rejects.toMatchObject({ code: "STALE_REVIEW" });
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.DRAFT);
    expect(store.audits).toHaveLength(0);
  });

  it("rejects complete-entry after a same-total delete-and-replace", async () => {
    const opened = snapshot();
    store.batches.get(BATCH_ID)!.reviewVersion = 4;
    await expect(
      completeOfferingBatchEntry(BATCH_ID, opened),
    ).rejects.toMatchObject({ code: "STALE_REVIEW" });
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.DRAFT);
    expect(store.batches.get(BATCH_ID)?.recordedTotal.toString()).toBe("25.00");
    expect(store.donations).toHaveLength(1);
    expect(store.audits).toHaveLength(0);
  });
});

const guidanceRoles = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
  RoleCode.DATA_ENTRY,
  RoleCode.REPORT_VIEWER,
] as const;

async function reviewedGuidance(role: RoleCode) {
  mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(role));
  const review = await getOfferingBatchReview(BATCH_ID);
  const access = getGivingCapabilitiesForRole(role);
  const batch = store.batches.get(BATCH_ID)!;
  return {
    review,
    step: batchNextStep({
      canAddDonations:
        access.canAddBatchDonations && batch.status === OfferingBatchStatus.DRAFT,
      showCompleteEntry: review.showCompleteEntry,
      canCompleteEntry: review.canCompleteEntry,
      showReconcile: review.showReconcile,
      canReconcile: review.canReconcile,
      showDepositForm: review.showDepositForm,
      canRecordDeposit: review.canRecordDeposit,
      showLock: review.showLock,
      canLock: review.canLock,
      depositRecorded: Boolean(batch.depositDate && batch.depositReference?.trim()),
      isLocked: review.isLocked,
      issues: review.issues,
    }),
  };
}

describe("offering batch review guidance", () => {
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
  });

  it("keeps Enter gifts ahead of a blocked complete on an empty draft", async () => {
    seedBatch({ expected: null, recorded: "0.00" });
    for (const role of [RoleCode.ORG_ADMIN, RoleCode.TREASURER, RoleCode.DATA_ENTRY]) {
      const { review, step } = await reviewedGuidance(role);
      expect(review.canCompleteEntry).toBe(false);
      expect(review.issues).toContain("NO_DONATIONS");
      expect(step).toMatchObject({ action: "add", label: "Enter gifts", tone: "action" });
    }
    const viewer = await reviewedGuidance(RoleCode.REPORT_VIEWER);
    expect(viewer.step.tone).toBe("readonly");
    expect(viewer.step.explanation).toMatch(/your role/i);
    expect(viewer.step.explanation).not.toContain(BATCH_INTEGRITY_MESSAGES.NO_DONATIONS);
  });

  it("lets an authorized role reconcile a balanced entered batch", async () => {
    seedBatch({ status: OfferingBatchStatus.ENTERED });
    seedBalancedDonation();
    for (const role of [RoleCode.ORG_ADMIN, RoleCode.TREASURER]) {
      const { review, step } = await reviewedGuidance(role);
      expect(review.canReconcile).toBe(true);
      expect(step).toMatchObject({ action: "reconcile", label: "Reconcile", tone: "action" });
    }
    for (const role of [RoleCode.DATA_ENTRY, RoleCode.REPORT_VIEWER]) {
      const { review, step } = await reviewedGuidance(role);
      expect(review.canReconcile).toBe(false);
      expect(step.tone).toBe("readonly");
      expect(step.action).not.toBe("reconcile");
      expect(step.explanation).not.toContain(BATCH_INTEGRITY_MESSAGES.NO_DONATIONS);
    }
  });

  it("describes an empty entered batch as an integrity block and still rejects reconcile", async () => {
    seedBatch({ status: OfferingBatchStatus.ENTERED, expected: "0.00", recorded: "0.00" });
    store.donations = [];
    const { review, step } = await reviewedGuidance(RoleCode.TREASURER);
    expect(review.canReconcile).toBe(false);
    expect(review.issues).toContain("NO_DONATIONS");
    expect(step.action).not.toBe("reconcile");
    expect(step.tone).toBe("blocked");
    expect(step.explanation).toContain(BATCH_INTEGRITY_MESSAGES.NO_DONATIONS);
    expect(step.explanation).not.toMatch(/your role/i);

    const entry = await reviewedGuidance(RoleCode.DATA_ENTRY);
    expect(entry.step.tone).toBe("readonly");
    expect(entry.step.explanation).toMatch(/your role/i);
    expect(entry.step.explanation).not.toContain(BATCH_INTEGRITY_MESSAGES.NO_DONATIONS);

    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
    await expect(
      reconcileOfferingBatch(BATCH_ID, snapshot({ recordedTotal: "0.00", expectedTotal: "0.00", donationCount: 0 })),
    ).rejects.toMatchObject({ code: "NO_DONATIONS" });
    expect(store.batches.get(BATCH_ID)?.status).toBe(OfferingBatchStatus.ENTERED);
  });

  it("describes mismatched and missing expected totals without offering reconcile", async () => {
    seedBatch({ status: OfferingBatchStatus.ENTERED, expected: "30.00", recorded: "25.00" });
    seedBalancedDonation();
    const mismatched = await reviewedGuidance(RoleCode.TREASURER);
    expect(mismatched.review.canReconcile).toBe(false);
    expect(mismatched.review.issues).toContain("BATCH_NOT_BALANCED");
    expect(mismatched.step.tone).toBe("blocked");
    expect(mismatched.step.explanation).toContain(BATCH_INTEGRITY_MESSAGES.BATCH_NOT_BALANCED);
    expect(mismatched.step.explanation).not.toMatch(/your role/i);
    expect(mismatched.step.explanation).not.toMatch(/enter gifts/i);

    seedBatch({ status: OfferingBatchStatus.ENTERED, expected: null, recorded: "25.00" });
    seedBalancedDonation();
    const missing = await reviewedGuidance(RoleCode.ORG_ADMIN);
    expect(missing.review.issues).toContain("EXPECTED_TOTAL_REQUIRED");
    expect(missing.step.action).not.toBe("reconcile");
    expect(missing.step.explanation).toContain(
      BATCH_INTEGRITY_MESSAGES.EXPECTED_TOTAL_REQUIRED,
    );
  });

  it("separates a missing deposit, an invalid deposit, a valid lock, and bad allocations", async () => {
    seedBatch({ status: OfferingBatchStatus.RECONCILED });
    seedBalancedDonation();
    const missing = await reviewedGuidance(RoleCode.TREASURER);
    expect(missing.review.canLock).toBe(false);
    expect(missing.review.issues).toContain("DEPOSIT_REQUIRED");
    expect(missing.step).toMatchObject({ action: "deposit", label: "Record deposit" });

    const entry = await reviewedGuidance(RoleCode.DATA_ENTRY);
    expect(entry.step.tone).toBe("readonly");
    expect(entry.step.action).not.toBe("deposit");
    expect(entry.step.explanation).not.toContain(BATCH_INTEGRITY_MESSAGES.DEPOSIT_REQUIRED);

    seedBatch({
      status: OfferingBatchStatus.RECONCILED,
      depositDate: new Date("2026-09-01T00:00:00.000Z"),
      depositReference: "SLIP-1",
    });
    seedBalancedDonation();
    const early = await reviewedGuidance(RoleCode.TREASURER);
    expect(early.review.canLock).toBe(false);
    expect(early.review.issues).toContain("DEPOSIT_DATE_BEFORE_OFFERING");
    expect(early.step).toMatchObject({
      action: "deposit",
      label: "Review deposit",
      tone: "blocked",
    });
    expect(early.step.explanation).toContain(
      BATCH_INTEGRITY_MESSAGES.DEPOSIT_DATE_BEFORE_OFFERING,
    );
    expect(early.step.explanation).not.toMatch(/your role/i);

    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 2);
    seedBatch({
      status: OfferingBatchStatus.RECONCILED,
      depositDate: future,
      depositReference: "SLIP-1",
    });
    seedBalancedDonation();
    const later = await reviewedGuidance(RoleCode.ORG_ADMIN);
    expect(later.review.issues).toContain("DEPOSIT_DATE_IN_FUTURE");
    expect(later.step.action).not.toBe("lock");
    expect(later.step.explanation).toContain(BATCH_INTEGRITY_MESSAGES.DEPOSIT_DATE_IN_FUTURE);

    seedBatch({
      status: OfferingBatchStatus.RECONCILED,
      depositDate: new Date("2026-09-06T00:00:00.000Z"),
      depositReference: "SLIP-1",
    });
    seedBalancedDonation();
    const ready = await reviewedGuidance(RoleCode.TREASURER);
    expect(ready.review.canLock).toBe(true);
    expect(ready.step).toMatchObject({ action: "lock", label: "Lock batch", tone: "action" });

    seedBatch({
      status: OfferingBatchStatus.RECONCILED,
      depositDate: new Date("2026-09-06T00:00:00.000Z"),
      depositReference: "SLIP-1",
    });
    store.donations = [
      {
        organizationId: ORG_ID,
        batchId: BATCH_ID,
        totalAmount: money("25.00"),
        allocations: [{ amount: money("10.00") }],
      },
    ];
    const allocations = await reviewedGuidance(RoleCode.TREASURER);
    expect(allocations.review.canLock).toBe(false);
    expect(allocations.review.issues).toContain("ALLOCATION_TOTAL_MISMATCH");
    expect(allocations.step.action).not.toBe("lock");
    expect(allocations.step.label).toBe("Lock unavailable");
    expect(allocations.step.explanation).toContain(
      BATCH_INTEGRITY_MESSAGES.ALLOCATION_TOTAL_MISMATCH,
    );
    expect(allocations.step.explanation).not.toMatch(/enter gifts/i);
    expect(allocations.step.explanation).not.toMatch(/your role/i);
  });

  it("uses locked-history guidance for every original staff role", async () => {
    seedBatch({
      status: OfferingBatchStatus.LOCKED,
      depositDate: new Date("2026-09-06T00:00:00.000Z"),
      depositReference: "SLIP-1",
    });
    seedBalancedDonation();
    for (const role of guidanceRoles) {
      const { review, step } = await reviewedGuidance(role);
      expect(review.isLocked).toBe(true);
      expect(review.canLock).toBe(false);
      expect(review.canReconcile).toBe(false);
      expect(step).toMatchObject({
        action: "view",
        label: "Locked history",
        tone: "locked",
      });
      expect(step.explanation).not.toMatch(/your role/i);
    }
  });
});
