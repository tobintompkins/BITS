import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  actor: vi.fn(),
  memberships: vi.fn(),
  countBatches: vi.fn(),
  listBatches: vi.fn(),
  countDonations: vi.fn(),
  listDonations: vi.fn(),
  target: vi.fn(),
  picker: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  batchUpdate: vi.fn(),
  donationUpdate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userAccount: { findUnique: m.actor },
    organizationMembership: { findMany: m.memberships },
    offeringBatch: { update: m.batchUpdate, updateMany: m.batchUpdate },
    donation: { update: m.donationUpdate, updateMany: m.donationUpdate },
    $transaction: m.transaction,
  },
}));
vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: m.audit,
}));
vi.mock("@/server/repositories/batch-reconciliation-report.repository", () => ({
  countReconciliationBatches: m.countBatches,
  listReconciliationBatches: m.listBatches,
  countReconciliationDonations: m.countDonations,
  listReconciliationDonations: m.listDonations,
  findReconciliationBatchTarget: m.target,
  listReconciliationBatchPicker: m.picker,
}));

import {
  exportBatchReconciliationReportCsv,
  getBatchReconciliationReport,
} from "./batch-reconciliation-report.service";

const org = {
  id: "org-a",
  active: true,
  name: "Church A",
  displayName: "Church A",
  timeZone: "America/New_York",
};
const BATCH_A = "00000000-0000-4000-8000-0000000000b1";
const BATCH_EMPTY = "00000000-0000-4000-8000-0000000000b2";
const BATCH_MIXED = "00000000-0000-4000-8000-0000000000b3";

function role(code: string) {
  m.memberships.mockResolvedValue([
    { organizationId: org.id, organization: org, roleType: { code } },
  ]);
}

function batchRow(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name: "Sunday",
    reference: "B-1",
    offeringDate: new Date("2026-06-15T00:00:00.000Z"),
    status: "ENTERED",
    expectedTotal: "20.00",
    recordedTotal: "20.00",
    depositDate: new Date("2026-06-16T00:00:00.000Z"),
    depositReference: "DEP-1",
    ...overrides,
  };
}

const filters = {
  startDate: "2026-01-01",
  endDate: "2026-12-31",
};

describe("batch reconciliation report", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ userId: "clerk-user", orgId: "clerk-org-a" });
    m.actor.mockResolvedValue({ id: "staff-a", active: true });
    role("TREASURER");
    m.target.mockResolvedValue(true);
    m.countBatches.mockResolvedValue(1);
    m.listBatches.mockResolvedValue([batchRow(BATCH_A)]);
    m.countDonations.mockResolvedValue(2);
    m.listDonations.mockResolvedValue([
      {
        id: "g1",
        batchId: BATCH_A,
        totalAmount: "15.00",
        anonymous: true,
        isTest: false,
        allocations: [
          { id: "a1", amount: "10.00" },
          { id: "a2", amount: "5.00" },
        ],
      },
      {
        id: "g2",
        batchId: BATCH_A,
        totalAmount: "5.00",
        anonymous: false,
        isTest: false,
        allocations: [{ id: "a3", amount: "5.00" }],
      },
    ]);
    m.picker.mockResolvedValue([]);
    m.audit.mockResolvedValue({ id: "audit-1" });
    m.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
  });

  it("rejects signed-out, data-entry, donor and inactive accounts", async () => {
    m.auth.mockResolvedValue({ userId: null });
    await expect(getBatchReconciliationReport(filters)).rejects.toThrow("Sign in");
    m.auth.mockResolvedValue({ userId: "clerk-user", orgId: "clerk-org-a" });
    m.actor.mockResolvedValue({ id: "staff-a", active: false });
    await expect(getBatchReconciliationReport(filters)).rejects.toThrow("active staff");
    m.actor.mockResolvedValue({ id: "staff-a", active: true });
    role("DATA_ENTRY");
    await expect(getBatchReconciliationReport(filters)).rejects.toThrow("permission");
    role("DONOR");
    await expect(getBatchReconciliationReport(filters)).rejects.toThrow("permission");
  });

  it("lets a report viewer read and export the batch report", async () => {
    role("REPORT_VIEWER");
    const report = await getBatchReconciliationReport(filters);
    expect(report.rows[0]?.calculatedGiftTotal).toBe("20.00");
    const exported = await exportBatchReconciliationReportCsv(filters);
    expect(exported.csv).toContain("20.00");
    expect(exported.filename).toContain("batch-reconciliation-");
  });

  it("rejects a foreign batch id instead of broadening the report", async () => {
    m.target.mockResolvedValue(false);
    await expect(
      getBatchReconciliationReport({
        ...filters,
        batchId: "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow("not part of this church");
  });

  it("rejects a stale church and an invalid status", async () => {
    await expect(
      getBatchReconciliationReport({
        ...filters,
        organizationId: "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow("church selection changed");
    await expect(
      getBatchReconciliationReport({ ...filters, status: "OPEN" }),
    ).rejects.toThrow("status");
  });

  it("includes empty batches and keeps an unset expected total blank", async () => {
    m.countBatches.mockResolvedValue(2);
    m.listBatches.mockResolvedValue([
      batchRow(BATCH_A),
      batchRow(BATCH_EMPTY, {
        name: "Empty",
        expectedTotal: null,
        recordedTotal: "0.00",
        depositDate: null,
        depositReference: null,
      }),
    ]);
    m.countDonations.mockResolvedValue(2);
    const report = await getBatchReconciliationReport(filters);
    const empty = report.allRows.find((row) => row.id === BATCH_EMPTY);
    expect(empty?.giftCount).toBe(0);
    expect(empty?.expectedTotal).toBeNull();
    expect(empty?.variance).toBeNull();
    expect(empty?.calculatedGiftTotal).toBe("0.00");
    expect(report.totals.emptyBatchCount).toBe(1);
  });

  it("counts split allocations once and keeps exact decimals and anonymous gifts", async () => {
    const report = await getBatchReconciliationReport(filters);
    expect(report.rows[0]?.giftCount).toBe(2);
    expect(report.rows[0]?.anonymousGiftCount).toBe(1);
    expect(report.rows[0]?.calculatedGiftTotal).toBe("20.00");
    expect(report.rows[0]?.allocationTotal).toBe("20.00");
    expect(report.rows[0]?.variance).toBe("0.00");
    expect(report.rows[0]?.recordedMinusCalculated).toBe("0.00");
  });

  it("uses calculated minus expected and recorded minus calculated", async () => {
    m.listBatches.mockResolvedValue([
      batchRow(BATCH_A, { expectedTotal: "25.00", recordedTotal: "21.00" }),
    ]);
    const report = await getBatchReconciliationReport(filters);
    expect(report.rows[0]?.variance).toBe("-5.00");
    expect(report.rows[0]?.recordedMinusCalculated).toBe("1.00");
  });

  it("flags mixed real/test batches and excludes them from aggregate variance", async () => {
    m.countBatches.mockResolvedValue(2);
    m.listBatches.mockResolvedValue([
      batchRow(BATCH_A),
      batchRow(BATCH_MIXED, { name: "Mixed", expectedTotal: "10.00", recordedTotal: "12.00" }),
    ]);
    m.listDonations.mockResolvedValue([
      {
        id: "g1",
        batchId: BATCH_A,
        totalAmount: "20.00",
        anonymous: false,
        isTest: false,
        allocations: [{ id: "a1", amount: "20.00" }],
      },
      {
        id: "g2",
        batchId: BATCH_MIXED,
        totalAmount: "10.00",
        anonymous: false,
        isTest: false,
        allocations: [{ id: "a2", amount: "10.00" }],
      },
      {
        id: "g3",
        batchId: BATCH_MIXED,
        totalAmount: "2.00",
        anonymous: false,
        isTest: true,
        allocations: [{ id: "a3", amount: "2.00" }],
      },
    ]);
    const report = await getBatchReconciliationReport(filters);
    const mixed = report.allRows.find((row) => row.id === BATCH_MIXED);
    expect(mixed?.mixed).toBe(true);
    expect(mixed?.calculatedGiftTotal).toBe("12.00");
    expect(report.totals.mixedBatchCount).toBe(1);
    expect(report.totals.comparableVarianceTotal).toBe("0.00");
  });

  it("rejects an oversized export instead of truncating and does not audit", async () => {
    m.countBatches.mockResolvedValue(501);
    await expect(exportBatchReconciliationReportCsv(filters)).rejects.toThrow(
      "was not truncated",
    );
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("does not release a CSV when audit fails and does not mutate batches or gifts", async () => {
    m.audit.mockRejectedValue(new Error("audit down"));
    await expect(exportBatchReconciliationReportCsv(filters)).rejects.toThrow(
      "could not be audited",
    );
    expect(m.batchUpdate).not.toHaveBeenCalled();
    expect(m.donationUpdate).not.toHaveBeenCalled();
  });

  it("uses the same rows for screen totals, print and CSV", async () => {
    const report = await getBatchReconciliationReport(filters);
    const printed = await getBatchReconciliationReport({ ...filters, print: "1" });
    const exported = await exportBatchReconciliationReportCsv(filters);
    expect(printed.allRows).toHaveLength(report.allRows.length);
    expect(exported.csv).toContain(report.totals.calculatedGiftTotal);
    expect(exported.csv).toContain("Variance (calculated minus expected)");
  });
});
