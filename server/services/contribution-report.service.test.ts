import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  actor: vi.fn(),
  memberships: vi.fn(),
  count: vi.fn(),
  list: vi.fn(),
  sum: vi.fn(),
  matching: vi.fn(),
  groups: vi.fn(),
  membershipsForDonors: vi.fn(),
  householdDonors: vi.fn(),
  targets: vi.fn(),
  pickers: vi.fn(),
  offeringTypes: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  donationUpdate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userAccount: { findUnique: m.actor },
    organizationMembership: { findMany: m.memberships },
    offeringType: { findMany: m.offeringTypes },
    donation: { update: m.donationUpdate, updateMany: m.donationUpdate },
    $transaction: m.transaction,
  },
}));
vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: m.audit,
}));
vi.mock("@/server/repositories/contribution-report.repository", () => ({
  countContributionDonations: m.count,
  listContributionDonations: m.list,
  sumContributionDonations: m.sum,
  sumMatchingFundAllocations: m.matching,
  groupContributionAllocations: m.groups,
  listHouseholdMembershipsForDonors: m.membershipsForDonors,
  listHouseholdDonorIdsInRange: m.householdDonors,
  findContributionFilterTargets: m.targets,
  listContributionReportPickers: m.pickers,
}));

import {
  exportContributionReportCsv,
  getContributionReport,
} from "./contribution-report.service";

const org = {
  id: "org-a",
  active: true,
  name: "Church A",
  timeZone: "America/New_York",
};
const FUND_A = "00000000-0000-4000-8000-0000000000f1";
const FUND_B = "00000000-0000-4000-8000-0000000000f2";
const DONOR_A = "00000000-0000-4000-8000-0000000000d1";
const HH_A = "00000000-0000-4000-8000-0000000000a1";
const HH_B = "00000000-0000-4000-8000-0000000000b1";

function role(code: string) {
  m.memberships.mockResolvedValue([
    { organizationId: org.id, organization: org, roleType: { code } },
  ]);
}

function splitGift(overrides: Record<string, unknown> = {}) {
  return {
    id: "gift-1",
    offeringDate: new Date("2026-06-15T00:00:00.000Z"),
    paymentMethod: "CHECK",
    totalAmount: "15.00",
    deductibleAmount: "10.00",
    anonymous: false,
    isTest: false,
    donorId: DONOR_A,
    batchId: null,
    donor: { id: DONOR_A, firstName: "Ada", lastName: "Young", active: true },
    batch: null,
    allocations: [
      {
        offeringTypeId: FUND_A,
        amount: "10.00",
        offeringType: { id: FUND_A, name: "General", active: true },
      },
      {
        offeringTypeId: FUND_B,
        amount: "5.00",
        offeringType: { id: FUND_B, name: "Missions", active: false },
      },
    ],
    ...overrides,
  };
}

const filters = {
  view: "detail",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
};

describe("contribution reports", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ userId: "clerk-user", orgId: "clerk-org-a" });
    m.actor.mockResolvedValue({ id: "staff-a", active: true });
    role("TREASURER");
    m.targets.mockResolvedValue({
      donor: true,
      household: true,
      offeringType: true,
      batch: true,
    });
    m.count.mockResolvedValue(1);
    m.list.mockResolvedValue([splitGift()]);
    m.sum.mockResolvedValue({
      _count: { _all: 1 },
      _sum: { totalAmount: "15.00", deductibleAmount: "10.00" },
    });
    m.matching.mockResolvedValue(null);
    m.groups.mockResolvedValue([
      { offeringTypeId: FUND_A, _sum: { amount: "10.00" }, _count: { _all: 1 } },
      { offeringTypeId: FUND_B, _sum: { amount: "5.00" }, _count: { _all: 1 } },
    ]);
    m.membershipsForDonors.mockResolvedValue([]);
    m.householdDonors.mockResolvedValue([DONOR_A]);
    m.pickers.mockResolvedValue({
      donors: [],
      households: [],
      offeringTypes: [],
      batches: [],
    });
    m.offeringTypes.mockResolvedValue([
      { id: FUND_A, name: "General", active: true },
      { id: FUND_B, name: "Missions", active: false },
    ]);
    m.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ offeringType: { findMany: m.offeringTypes } }),
    );
  });

  it("rejects signed-out, data-entry, donor and inactive accounts", async () => {
    m.auth.mockResolvedValue({ userId: null });
    await expect(getContributionReport(filters)).rejects.toThrow("Sign in");
    m.auth.mockResolvedValue({ userId: "clerk-user", orgId: "clerk-org-a" });
    m.actor.mockResolvedValue({ id: "staff-a", active: false });
    await expect(getContributionReport(filters)).rejects.toThrow("active staff");
    m.actor.mockResolvedValue({ id: "staff-a", active: true });
    role("DATA_ENTRY");
    await expect(getContributionReport(filters)).rejects.toThrow("permission");
    role("DONOR");
    await expect(getContributionReport(filters)).rejects.toThrow("permission");
  });

  it("lets a report viewer read and export", async () => {
    role("REPORT_VIEWER");
    const report = await getContributionReport(filters);
    expect(report.totals.giftTotal).toBe("15.00");
    const exported = await exportContributionReportCsv(filters);
    expect(exported.csv).toContain("15.00");
    expect(exported.filename).toContain("contribution-detail-");
  });

  it("rejects a foreign filter id instead of broadening the report", async () => {
    m.targets.mockResolvedValue({
      donor: null,
      household: true,
      offeringType: true,
      batch: true,
    });
    await expect(
      getContributionReport({
        ...filters,
        donorId: "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow("not part of this church");
  });

  it("rejects a stale church and an invalid date range", async () => {
    await expect(
      getContributionReport({ ...filters, organizationId: "org-b" }),
    ).rejects.toThrow("church selection changed");
    m.auth.mockResolvedValue({ userId: "clerk-user", orgId: "clerk-org-a" });
    await expect(
      getContributionReport({
        view: "detail",
        startDate: "2026-12-31",
        endDate: "2026-01-01",
      }),
    ).rejects.toThrow("start on or before");
  });

  it("counts a split gift once and keeps fund totals on allocations", async () => {
    const report = await getContributionReport({
      ...filters,
      view: "offering-type",
    });
    expect(report.detail.total).toBe(1);
    expect(report.totals.giftTotal).toBe("15.00");
    expect(report.offeringTypes.map((row) => row.allocationTotal).sort()).toEqual([
      "10.00",
      "5.00",
    ]);
    const filtered = await getContributionReport({
      ...filters,
      offeringTypeId: FUND_B,
    });
    m.matching.mockResolvedValue({ _sum: { amount: "5.00" } });
    const withFund = await getContributionReport({
      ...filters,
      offeringTypeId: FUND_B,
    });
    expect(filtered.detail.rows[0]?.giftTotal).toBe("15.00");
    expect(withFund.detail.rows[0]?.matchingFundAllocation).toBe("5.00");
  });

  it("keeps exact decimals, anonymous gifts and inactive historical funds", async () => {
    m.list.mockResolvedValue([
      splitGift({
        id: "anon",
        anonymous: true,
        donorId: null,
        donor: null,
        totalAmount: "0.10",
        deductibleAmount: "0.00",
      }),
      splitGift({
        id: "named",
        donor: { id: DONOR_A, firstName: "Ada", lastName: "Young", active: false },
      }),
    ]);
    m.count.mockResolvedValue(2);
    m.sum.mockResolvedValue({
      _count: { _all: 2 },
      _sum: { totalAmount: "15.10", deductibleAmount: "10.00" },
    });
    const report = await getContributionReport({ ...filters, view: "donor" });
    expect(report.totals.giftTotal).toBe("15.10");
    expect(report.donors.some((row) => row.label === "Anonymous")).toBe(true);
    expect(report.donors.some((row) => row.label.includes("inactive"))).toBe(true);
    expect(report.donors.find((row) => row.label === "Anonymous")?.giftTotal).toBe(
      "0.10",
    );
  });

  it("does not use current membership alone for a household move", async () => {
    m.list.mockResolvedValue([
      splitGift({
        id: "old",
        offeringDate: new Date("2026-06-14T00:00:00.000Z"),
        totalAmount: "8.00",
        deductibleAmount: "8.00",
        allocations: [],
      }),
      splitGift({
        id: "new",
        offeringDate: new Date("2026-06-15T00:00:00.000Z"),
        totalAmount: "7.00",
        deductibleAmount: "7.00",
        allocations: [],
      }),
    ]);
    m.count.mockResolvedValue(2);
    m.sum.mockResolvedValue({
      _count: { _all: 2 },
      _sum: { totalAmount: "15.00", deductibleAmount: "15.00" },
    });
    m.membershipsForDonors.mockResolvedValue([
      {
        donorId: DONOR_A,
        householdId: HH_A,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-06-14T00:00:00.000Z"),
        household: { id: HH_A, displayName: "Old House", active: true },
      },
      {
        donorId: DONOR_A,
        householdId: HH_B,
        startDate: new Date("2026-06-15T00:00:00.000Z"),
        endDate: null,
        household: { id: HH_B, displayName: "New House", active: true },
      },
    ]);
    const report = await getContributionReport({ ...filters, view: "household" });
    const oldHouse = report.households.find((row) => row.label === "Old House");
    const newHouse = report.households.find((row) => row.label === "New House");
    expect(oldHouse?.giftTotal).toBe("8.00");
    expect(newHouse?.giftTotal).toBe("7.00");
    expect(oldHouse?.giftCount).toBe(1);
    expect(newHouse?.giftCount).toBe(1);
  });

  it("rejects an oversized export instead of truncating", async () => {
    m.count.mockResolvedValue(5001);
    await expect(exportContributionReportCsv(filters)).rejects.toThrow(
      "more than 5000",
    );
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("does not release a CSV when audit fails and does not mutate gifts", async () => {
    m.audit.mockRejectedValue(new Error("audit down"));
    await expect(exportContributionReportCsv(filters)).rejects.toThrow(
      "could not be audited",
    );
    expect(m.donationUpdate).not.toHaveBeenCalled();
  });

  it("uses the same inclusion rules for CSV and screen totals", async () => {
    const report = await getContributionReport(filters);
    const exported = await exportContributionReportCsv(filters);
    expect(exported.csv).toContain(report.totals.giftTotal);
    expect(exported.csv).toContain("General 10.00; Missions 5.00");
    expect(m.donationUpdate).not.toHaveBeenCalled();
  });
});
