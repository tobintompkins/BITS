import { beforeEach, describe, expect, it, vi } from "vitest";

import { OfferingBatchStatus, RoleCode } from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

type BatchRow = {
  id: string;
  organizationId: string;
  name: string;
  offeringDate: Date;
  serviceDescription: string | null;
  status: OfferingBatchStatus;
  expectedTotal: { toString(): string } | null;
  recordedTotal: { toString(): string };
  depositDate: Date | null;
  depositReference: string | null;
  notes: string | null;
  createdByUserAccountId: string;
  createdAt: Date;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  batches: new Map<string, BatchRow>(),
  audits: [] as Array<Record<string, unknown>>,
  persistShouldFail: false,
  flipStatusAfterRead: null as OfferingBatchStatus | null,
  txChain: Promise.resolve(),
  id: 0,
}));

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  getGivingAccess: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  countOfferingBatches: vi.fn(),
  findOfferingBatches: vi.fn(),
  countOfferingBatchesByStatus: vi.fn(),
  sumRecordedTotalForOfferingDateRange: vi.fn(),
  findOfferingBatchById: vi.fn(),
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
      if (!access.canViewBatches) {
        throw new Error("denied");
      }
      return access;
    },
    requireBatchManageAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canManageBatches) {
        throw new Error("denied");
      }
      return access;
    },
  };
});

vi.mock("@/server/repositories/offering-batch.repository", () => ({
  countOfferingBatches: mocks.countOfferingBatches,
  findOfferingBatches: mocks.findOfferingBatches,
  countOfferingBatchesByStatus: mocks.countOfferingBatchesByStatus,
  sumRecordedTotalForOfferingDateRange:
    mocks.sumRecordedTotalForOfferingDateRange,
  findOfferingBatchById: mocks.findOfferingBatchById,
}));

function money(value: string | null) {
  return value == null ? null : { toString: () => value };
}

function matchesDraftUpdate(where: {
  id: string;
  organizationId: string;
  status: OfferingBatchStatus;
}) {
  const row = store.batches.get(where.id);
  return (
    row &&
    row.organizationId === where.organizationId &&
    row.status === where.status &&
    row.status === OfferingBatchStatus.DRAFT
  );
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
      const run = store.txChain.then(async () => {
        const snapshot = [...store.batches.entries()].map(([id, row]) => [
          id,
          { ...row },
        ]) as Array<[string, BatchRow]>;
        const auditSnapshot = [...store.audits];
        const tx = {
          offeringBatch: {
            create: async ({
              data,
            }: {
              data: {
                organizationId: string;
                name: string;
                offeringDate: Date;
                serviceDescription: string | null;
                expectedTotal: string | null;
                notes: string | null;
                status: OfferingBatchStatus;
                recordedTotal: string;
                createdByUserAccountId: string;
              };
            }) => {
              const id = `batch-${++store.id}`;
              const row: BatchRow = {
                id,
                organizationId: data.organizationId,
                name: data.name,
                offeringDate: data.offeringDate,
                serviceDescription: data.serviceDescription,
                status: data.status,
                expectedTotal: money(data.expectedTotal),
                recordedTotal: money(data.recordedTotal) ?? {
                  toString: () => "0.00",
                },
                depositDate: null,
                depositReference: null,
                notes: data.notes,
                createdByUserAccountId: data.createdByUserAccountId,
                createdAt: new Date("2026-09-10T12:00:00.000Z"),
                updatedAt: new Date("2026-09-10T12:00:00.000Z"),
              };
              store.batches.set(id, row);
              return {
                id: row.id,
                status: row.status,
                recordedTotal: row.recordedTotal,
                organizationId: row.organizationId,
                name: row.name,
                offeringDate: row.offeringDate,
                serviceDescription: row.serviceDescription,
                expectedTotal: row.expectedTotal,
              };
            },
            findFirst: async ({
              where,
            }: {
              where: { id: string; organizationId: string };
            }) => {
              const row = store.batches.get(where.id);
              if (!row || row.organizationId !== where.organizationId) {
                return null;
              }
              const copy = { ...row };
              if (store.flipStatusAfterRead) {
                row.status = store.flipStatusAfterRead;
              }
              return copy;
            },
            findFirstOrThrow: async ({
              where,
            }: {
              where: { id: string; organizationId: string };
            }) => {
              const row = store.batches.get(where.id);
              if (!row || row.organizationId !== where.organizationId) {
                throw new Error("not found");
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
              };
              data: {
                name: string;
                offeringDate: Date;
                serviceDescription: string | null;
                expectedTotal: string | null;
                notes: string | null;
              };
            }) => {
              if (!matchesDraftUpdate(where)) return { count: 0 };
              const row = store.batches.get(where.id);
              if (!row) return { count: 0 };
              row.name = data.name;
              row.offeringDate = data.offeringDate;
              row.serviceDescription = data.serviceDescription;
              row.expectedTotal = money(data.expectedTotal);
              row.notes = data.notes;
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
          store.batches = new Map(snapshot);
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
  CREATE_OFFERING_BATCH,
  OfferingBatchError,
  UPDATE_OFFERING_BATCH,
  createOfferingBatch,
  getOfferingBatchDetail,
  getOfferingBatchDirectory,
  updateDraftOfferingBatch,
} from "./offering-batch.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const BATCH_ID = "00000000-0000-4000-8000-00000000b001";

const validInput = {
  name: "Sunday AM",
  offeringDate: "2026-09-06",
  serviceDescription: "Morning service",
  expectedTotal: "250.00",
  notes: "Counted after service",
};

const directoryQuery = {
  status: "all" as const,
  page: 1,
  pageSize: 20,
  sort: "offeringDate" as const,
  order: "desc" as const,
};

function seedBatch(overrides: Partial<BatchRow> = {}) {
  const row: BatchRow = {
    id: BATCH_ID,
    organizationId: ORG_ID,
    name: "Sunday AM",
    offeringDate: new Date("2026-09-06T00:00:00.000Z"),
    serviceDescription: "Morning service",
    status: OfferingBatchStatus.DRAFT,
    expectedTotal: money("250.00"),
    recordedTotal: money("0.00") ?? { toString: () => "0.00" },
    depositDate: null,
    depositReference: null,
    notes: "staff note",
    createdByUserAccountId: USER_ID,
    createdAt: new Date("2026-09-06T12:00:00.000Z"),
    updatedAt: new Date("2026-09-06T12:00:00.000Z"),
    ...overrides,
  };
  store.batches.set(row.id, row);
  return row;
}

describe("offering batch foundation", () => {
  beforeEach(() => {
    store.batches.clear();
    store.audits = [];
    store.persistShouldFail = false;
    store.flipStatusAfterRead = null;
    store.txChain = Promise.resolve();
    store.id = 0;
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First UPC",
      displayName: null,
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN),
    );
    mocks.countOfferingBatches.mockResolvedValue(0);
    mocks.findOfferingBatches.mockResolvedValue([]);
    mocks.countOfferingBatchesByStatus.mockResolvedValue(0);
    mocks.sumRecordedTotalForOfferingDateRange.mockResolvedValue({
      _sum: { recordedTotal: { toString: () => "0.00" } },
    });
    mocks.findOfferingBatchById.mockImplementation(
      async (organizationId: string, batchId: string) => {
        const row = store.batches.get(batchId);
        if (!row || row.organizationId !== organizationId) return null;
        return {
          ...row,
          createdBy: {
            id: USER_ID,
            displayName: "Pat Treasurer",
            primaryEmail: "pat@example.com",
          },
        };
      },
    );
  });

  it.each([RoleCode.ORG_ADMIN, RoleCode.TREASURER, RoleCode.DATA_ENTRY])(
    "lets %s create a draft batch with recordedTotal zero",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      const result = await createOfferingBatch(validInput);
      const created = [...store.batches.values()][0];
      expect(result.status).toBe(OfferingBatchStatus.DRAFT);
      expect(result.recordedTotal).toBe("0.00");
      expect(created?.status).toBe(OfferingBatchStatus.DRAFT);
      expect(created?.recordedTotal.toString()).toBe("0.00");
      expect(created?.organizationId).toBe(ORG_ID);
      expect(created?.createdByUserAccountId).toBe(USER_ID);
      expect(store.audits).toHaveLength(1);
      expect(store.audits[0]).toMatchObject({
        action: CREATE_OFFERING_BATCH,
        entityType: "OfferingBatch",
        entityId: created?.id,
        actorUserAccountId: USER_ID,
        organizationId: ORG_ID,
      });
      expect(JSON.stringify(store.audits[0])).not.toMatch(
        /Counted after service|stripe|whsec_/i,
      );
    },
  );

  it("lets REPORT_VIEWER view but not create or edit", async () => {
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER),
    );
    const directory = await getOfferingBatchDirectory(directoryQuery);
    expect(directory.canManage).toBe(false);
    await expect(createOfferingBatch(validInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    seedBatch();
    await expect(
      updateDraftOfferingBatch(BATCH_ID, validInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.audits).toHaveLength(0);
  });

  it("blocks DONOR and signed-out users from viewing or creating", async () => {
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.DONOR),
    );
    await expect(getOfferingBatchDirectory(directoryQuery)).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    await expect(createOfferingBatch(validInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    mocks.getGivingAccess.mockResolvedValue(getGivingCapabilitiesForRole(null));
    await expect(getOfferingBatchDirectory(directoryQuery)).rejects.toMatchObject(
      { code: "SIGNED_OUT" },
    );
    await expect(createOfferingBatch(validInput)).rejects.toMatchObject({
      code: "SIGNED_OUT",
    });
  });

  it("cannot view or edit a cross-organization batch", async () => {
    seedBatch({ organizationId: OTHER_ORG });
    await expect(getOfferingBatchDetail(BATCH_ID)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      updateDraftOfferingBatch(BATCH_ID, validInput),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.batches.get(BATCH_ID)?.name).toBe("Sunday AM");
  });

  it("ignores client-supplied organization, creator, status, and recorded total", async () => {
    const result = await createOfferingBatch({
      ...validInput,
      organizationId: OTHER_ORG,
      createdByUserAccountId: "attacker",
      status: OfferingBatchStatus.LOCKED,
      recordedTotal: "9999.00",
    });
    const created = store.batches.get(result.id);
    expect(created?.organizationId).toBe(ORG_ID);
    expect(created?.createdByUserAccountId).toBe(USER_ID);
    expect(created?.status).toBe(OfferingBatchStatus.DRAFT);
    expect(created?.recordedTotal.toString()).toBe("0.00");
  });

  it("updates a draft batch and writes a safe audit event", async () => {
    seedBatch();
    await updateDraftOfferingBatch(BATCH_ID, {
      name: "Sunday PM",
      offeringDate: "2026-09-06",
      serviceDescription: "Evening service",
      expectedTotal: "300.00",
      notes: "updated confidential note",
    });
    const updated = store.batches.get(BATCH_ID);
    expect(updated?.name).toBe("Sunday PM");
    expect(updated?.expectedTotal?.toString()).toBe("300.00");
    expect(updated?.notes).toBe("updated confidential note");
    expect(updated?.status).toBe(OfferingBatchStatus.DRAFT);
    expect(updated?.recordedTotal.toString()).toBe("0.00");
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      action: UPDATE_OFFERING_BATCH,
      entityType: "OfferingBatch",
      entityId: BATCH_ID,
      organizationId: ORG_ID,
      actorUserAccountId: USER_ID,
    });
    expect(JSON.stringify(store.audits[0])).not.toMatch(
      /confidential|stripe|card|whsec_/i,
    );
  });

  it.each([
    OfferingBatchStatus.ENTERED,
    OfferingBatchStatus.RECONCILED,
    OfferingBatchStatus.LOCKED,
  ])("rejects edits to %s batches", async (status) => {
    seedBatch({ status });
    await expect(
      updateDraftOfferingBatch(BATCH_ID, {
        ...validInput,
        name: "Changed",
      }),
    ).rejects.toMatchObject({ code: "NOT_EDITABLE" });
    expect(store.batches.get(BATCH_ID)?.name).toBe("Sunday AM");
    expect(store.audits).toHaveLength(0);
  });

  it("does not overwrite a batch when status changes concurrently", async () => {
    seedBatch();
    store.flipStatusAfterRead = OfferingBatchStatus.ENTERED;
    await expect(
      updateDraftOfferingBatch(BATCH_ID, {
        ...validInput,
        name: "Changed after lock",
      }),
    ).rejects.toMatchObject({
      code: "NOT_EDITABLE",
      message: "This batch is no longer a draft and cannot be edited.",
    });
    expect(store.batches.get(BATCH_ID)?.name).toBe("Sunday AM");
    expect(store.audits).toHaveLength(0);
  });

  it("rejects invalid money, dates, and text on create", async () => {
    await expect(
      createOfferingBatch({ ...validInput, expectedTotal: "-1.00" }),
    ).rejects.toBeInstanceOf(OfferingBatchError);
    await expect(
      createOfferingBatch({ ...validInput, offeringDate: "not-a-date" }),
    ).rejects.toBeInstanceOf(OfferingBatchError);
    await expect(
      createOfferingBatch({ ...validInput, name: "   " }),
    ).rejects.toBeInstanceOf(OfferingBatchError);
    expect(store.batches.size).toBe(0);
    expect(store.audits).toHaveLength(0);
  });

  it("scopes directory pagination and filters to the current organization", async () => {
    await getOfferingBatchDirectory({
      ...directoryQuery,
      q: "sunday",
      status: "DRAFT",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      page: 2,
      pageSize: 10,
    });
    expect(mocks.countOfferingBatches).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        status: OfferingBatchStatus.DRAFT,
      }),
    );
    expect(mocks.findOfferingBatches).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        status: OfferingBatchStatus.DRAFT,
      }),
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(mocks.countOfferingBatchesByStatus).toHaveBeenCalledWith(
      ORG_ID,
      OfferingBatchStatus.DRAFT,
    );
    expect(mocks.sumRecordedTotalForOfferingDateRange).toHaveBeenCalledWith(
      ORG_ID,
      expect.any(Date),
      expect.any(Date),
    );
  });

  it("rolls back the batch when the create audit write fails", async () => {
    store.persistShouldFail = true;
    await expect(createOfferingBatch(validInput)).rejects.toThrow();
    expect(store.batches.size).toBe(0);
    expect(store.audits).toHaveLength(0);
  });

  it("rolls back draft updates when the audit write fails", async () => {
    seedBatch();
    store.persistShouldFail = true;
    await expect(
      updateDraftOfferingBatch(BATCH_ID, {
        ...validInput,
        name: "Should roll back",
      }),
    ).rejects.toBeInstanceOf(OfferingBatchError);
    expect(store.batches.get(BATCH_ID)?.name).toBe("Sunday AM");
    expect(store.audits).toHaveLength(0);
  });
});
