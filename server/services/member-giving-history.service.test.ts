import { beforeEach, describe, expect, it, vi } from "vitest";

type AllocationRow = {
  organizationId: string;
  offeringTypeId: string;
  amount: string;
  fundName: string;
  offeringTypeOrganizationId: string;
};

type DonationRow = {
  id: string;
  organizationId: string;
  donorId: string;
  offeringDate: Date;
  totalAmount: string;
  deductibleAmount: string;
  isTest: boolean;
  paymentMethod?: string;
  checkNumber?: string;
  note?: string;
  batchId?: string;
  stripePaymentIntentId?: string;
  allocations: AllocationRow[];
};

type DonorRow = {
  id: string;
  organizationId: string;
  userAccountId: string;
  active: boolean;
  email?: string;
};

type OfferingTypeRow = {
  id: string;
  organizationId: string;
  name: string;
};

const store = vi.hoisted(() => ({
  donors: [] as DonorRow[],
  donations: [] as DonationRow[],
  offeringTypes: [] as OfferingTypeRow[],
  lastDonorWhere: null as unknown,
  lastGiftWhere: null as unknown,
  lastFundWhere: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/db/prisma", () => {
  function matchesGiftWhere(row: DonationRow, where: Record<string, unknown>) {
    if (row.organizationId !== where.organizationId) return false;
    if (row.donorId !== where.donorId) return false;
    const offeringDate = where.offeringDate as { gte: Date; lt: Date };
    if (row.offeringDate < offeringDate.gte || row.offeringDate >= offeringDate.lt) {
      return false;
    }
    if (typeof where.isTest === "boolean" && row.isTest !== where.isTest) {
      return false;
    }
    const allocations = where.allocations as
      | {
          some: {
            organizationId: string;
            offeringTypeId: string;
            offeringType: { organizationId: string };
          };
        }
      | undefined;
    if (allocations?.some) {
      const needed = allocations.some;
      return row.allocations.some(
        (allocation) =>
          allocation.organizationId === needed.organizationId &&
          allocation.offeringTypeId === needed.offeringTypeId &&
          allocation.offeringTypeOrganizationId ===
            needed.offeringType.organizationId,
      );
    }
    return true;
  }

  return {
    prisma: {
      donor: {
        findFirst: async ({
          where,
        }: {
          where: {
            organizationId: string;
            userAccountId: string;
            active: boolean;
          };
        }) => {
          store.lastDonorWhere = where;
          return (
            store.donors.find(
              (donor) =>
                donor.organizationId === where.organizationId &&
                donor.userAccountId === where.userAccountId &&
                donor.active === where.active,
            ) ?? null
          );
        },
      },
      offeringType: {
        findMany: async ({
          where,
        }: {
          where: {
            organizationId: string;
            allocations: {
              some: {
                organizationId: string;
                donation: {
                  organizationId: string;
                  donorId: string;
                  offeringDate: { gte: Date; lt: Date };
                };
              };
            };
          };
        }) => {
          store.lastFundWhere = where;
          const donationWhere = where.allocations.some.donation;
          const used = new Set<string>();
          for (const donation of store.donations) {
            if (!matchesGiftWhere(donation, donationWhere)) continue;
            for (const allocation of donation.allocations) {
              if (allocation.organizationId !== where.organizationId) continue;
              if (allocation.offeringTypeOrganizationId !== where.organizationId) {
                continue;
              }
              used.add(allocation.offeringTypeId);
            }
          }
          return store.offeringTypes
            .filter(
              (row) =>
                row.organizationId === where.organizationId && used.has(row.id),
            )
            .sort((left, right) => {
              const byName = left.name.localeCompare(right.name);
              return byName !== 0 ? byName : left.id.localeCompare(right.id);
            })
            .map((row) => ({ id: row.id, name: row.name }));
        },
      },
      donation: {
        aggregate: async ({
          where,
        }: {
          where: Record<string, unknown>;
        }) => {
          const rows = store.donations.filter((row) =>
            matchesGiftWhere(row, where),
          );
          const total = rows.reduce((sum, row) => sum + Number(row.totalAmount), 0);
          const deductible = rows.reduce(
            (sum, row) => sum + Number(row.deductibleAmount),
            0,
          );
          return {
            _sum: {
              totalAmount: rows.length ? total.toFixed(2) : null,
              deductibleAmount: rows.length ? deductible.toFixed(2) : null,
            },
            _count: { _all: rows.length },
          };
        },
        count: async ({ where }: { where: Record<string, unknown> }) =>
          store.donations.filter((row) => matchesGiftWhere(row, where)).length,
        findMany: async ({
          where,
          skip,
          take,
        }: {
          where: Record<string, unknown>;
          skip: number;
          take: number;
          select: Record<string, unknown>;
        }) => {
          store.lastGiftWhere = where;
          return store.donations
            .filter((row) => matchesGiftWhere(row, where))
            .sort((left, right) => {
              const byDate =
                right.offeringDate.getTime() - left.offeringDate.getTime();
              if (byDate !== 0) return byDate;
              return right.id.localeCompare(left.id);
            })
            .slice(skip, skip + take)
            .map((row) => ({
              id: row.id,
              offeringDate: row.offeringDate,
              totalAmount: { toString: () => row.totalAmount },
              deductibleAmount: { toString: () => row.deductibleAmount },
              isTest: row.isTest,
              allocations: row.allocations
                .filter(
                  (allocation) =>
                    allocation.organizationId === where.organizationId &&
                    allocation.offeringTypeOrganizationId ===
                      where.organizationId,
                )
                .map((allocation) => ({
                  amount: { toString: () => allocation.amount },
                  offeringType: { name: allocation.fundName },
                })),
            }));
        },
      },
    },
  };
});

import { MEMBER_GIVING_HISTORY_PAGE_SIZE } from "@/lib/validation/member-giving-history";

import { getMemberGivingHistory } from "./member-giving-history.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_DONOR = "00000000-0000-4000-8000-00000000d002";
const TITHE_ID = "00000000-0000-4000-8000-00000000f001";
const MISSIONS_ID = "00000000-0000-4000-8000-00000000f002";
const OTHER_FUND = "00000000-0000-4000-8000-00000000f003";
const UNUSED_FUND = "00000000-0000-4000-8000-00000000f099";
const NOW = new Date("2026-09-18T16:00:00.000Z");

function seed() {
  store.donors = [
    {
      id: DONOR_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      active: true,
      email: "ann@church.test",
    },
    {
      id: OTHER_DONOR,
      organizationId: ORG_ID,
      userAccountId: "00000000-0000-4000-8000-00000000c099",
      active: true,
      email: "other@church.test",
    },
  ];
  store.offeringTypes = [
    { id: TITHE_ID, organizationId: ORG_ID, name: "Tithe" },
    { id: MISSIONS_ID, organizationId: ORG_ID, name: "Missions" },
    { id: OTHER_FUND, organizationId: OTHER_ORG, name: "Other Tithe" },
  ];
  store.donations = [
    {
      id: "gift-official",
      organizationId: ORG_ID,
      donorId: DONOR_ID,
      offeringDate: new Date("2026-02-01T00:00:00.000Z"),
      totalAmount: "100.00",
      deductibleAmount: "90.00",
      isTest: false,
      paymentMethod: "CHECK",
      checkNumber: "1234",
      note: "internal memo",
      batchId: "00000000-0000-4000-8000-00000000bb01",
      stripePaymentIntentId: "pi_secret",
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeId: TITHE_ID,
          amount: "60.00",
          fundName: "Tithe",
          offeringTypeOrganizationId: ORG_ID,
        },
        {
          organizationId: ORG_ID,
          offeringTypeId: MISSIONS_ID,
          amount: "40.00",
          fundName: "Missions",
          offeringTypeOrganizationId: ORG_ID,
        },
      ],
    },
    {
      id: "gift-test",
      organizationId: ORG_ID,
      donorId: DONOR_ID,
      offeringDate: new Date("2026-03-01T00:00:00.000Z"),
      totalAmount: "25.00",
      deductibleAmount: "25.00",
      isTest: true,
      stripePaymentIntentId: "pi_test",
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeId: TITHE_ID,
          amount: "25.00",
          fundName: "Tithe",
          offeringTypeOrganizationId: ORG_ID,
        },
      ],
    },
    {
      id: "gift-other-donor",
      organizationId: ORG_ID,
      donorId: OTHER_DONOR,
      offeringDate: new Date("2026-02-15T00:00:00.000Z"),
      totalAmount: "500.00",
      deductibleAmount: "500.00",
      isTest: false,
      note: "other donor memo",
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeId: TITHE_ID,
          amount: "500.00",
          fundName: "Tithe",
          offeringTypeOrganizationId: ORG_ID,
        },
      ],
    },
    {
      id: "gift-other-org",
      organizationId: OTHER_ORG,
      donorId: DONOR_ID,
      offeringDate: new Date("2026-04-01T00:00:00.000Z"),
      totalAmount: "80.00",
      deductibleAmount: "80.00",
      isTest: false,
      allocations: [
        {
          organizationId: OTHER_ORG,
          offeringTypeId: OTHER_FUND,
          amount: "80.00",
          fundName: "Other Tithe",
          offeringTypeOrganizationId: OTHER_ORG,
        },
      ],
    },
    {
      id: "gift-prior-year",
      organizationId: ORG_ID,
      donorId: DONOR_ID,
      offeringDate: new Date("2025-06-01T00:00:00.000Z"),
      totalAmount: "15.00",
      deductibleAmount: "15.00",
      isTest: false,
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeId: MISSIONS_ID,
          amount: "15.00",
          fundName: "Missions",
          offeringTypeOrganizationId: ORG_ID,
        },
      ],
    },
  ];
  store.lastDonorWhere = null;
  store.lastGiftWhere = null;
  store.lastFundWhere = null;
}

describe("member giving history", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: "ann@church.test",
      displayName: "Ann Adams",
    });
  });

  it("returns signed out without querying church records", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberGivingHistory({}, NOW)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastDonorWhere).toBeNull();
    expect(store.lastGiftWhere).toBeNull();
  });

  it("shows a safe pending state when no donor is linked", async () => {
    store.donors = [];
    const result = await getMemberGivingHistory({}, NOW);
    expect(result).toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: "ann@church.test",
    });
    expect(store.lastDonorWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      active: true,
    });
    expect(store.lastGiftWhere).toBeNull();
  });

  it("scopes gifts to the current organization and linked donor", async () => {
    const result = await getMemberGivingHistory({ year: "2026" }, NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastGiftWhere).toMatchObject({
      organizationId: ORG_ID,
      donorId: DONOR_ID,
    });
    expect(JSON.stringify(result.gifts)).not.toContain(OTHER_DONOR);
    expect(JSON.stringify(result.gifts)).not.toContain("500.00");
    expect(JSON.stringify(result.gifts)).not.toContain("80.00");
    expect(JSON.stringify(result.gifts)).not.toContain("15.00");
    expect(result.gifts).toHaveLength(2);
  });

  it("excludes Stripe test gifts from official totals", async () => {
    const result = await getMemberGivingHistory({ year: "2026" }, NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.official).toEqual({
      giftCount: 1,
      totalAmount: "100.00",
      deductibleAmount: "90.00",
    });
    expect(result.test).toEqual({
      giftCount: 1,
      totalAmount: "25.00",
    });
    expect(result.gifts.some((gift) => gift.isTest)).toBe(true);
  });

  it("filters to the selected year and defaults invalid years", async () => {
    const selected = await getMemberGivingHistory({ year: "2025" }, NOW);
    expect(selected.status).toBe("READY");
    if (selected.status !== "READY") return;
    expect(selected.year).toBe(2025);
    expect(selected.official).toEqual({
      giftCount: 1,
      totalAmount: "15.00",
      deductibleAmount: "15.00",
    });
    expect(selected.gifts).toHaveLength(1);
    expect(selected.gifts[0]?.totalAmount).toBe("15.00");

    const invalid = await getMemberGivingHistory({ year: "1999" }, NOW);
    expect(invalid.status).toBe("READY");
    if (invalid.status !== "READY") return;
    expect(invalid.year).toBe(2026);
  });

  it("ignores an invalid or unused fund filter", async () => {
    const result = await getMemberGivingHistory(
      { year: "2026", fund: "not-a-uuid" },
      NOW,
    );
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.fund).toBe("all");
    expect(result.gifts).toHaveLength(2);

    const unused = await getMemberGivingHistory(
      { year: "2026", fund: UNUSED_FUND },
      NOW,
    );
    expect(unused.status).toBe("READY");
    if (unused.status !== "READY") return;
    expect(unused.fund).toBe("all");
    expect(unused.funds.map((fund) => fund.id)).toEqual([MISSIONS_ID, TITHE_ID]);
  });

  it("filters gifts to a valid current-organization fund", async () => {
    const result = await getMemberGivingHistory(
      { year: "2026", fund: MISSIONS_ID },
      NOW,
    );
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.fund).toBe(MISSIONS_ID);
    expect(result.gifts).toHaveLength(1);
    expect(result.gifts[0]?.totalAmount).toBe("100.00");
    expect(result.official.giftCount).toBe(1);
    expect(result.test).toBeNull();
  });

  it("paginates gifts without changing official totals", async () => {
    store.donations = Array.from({ length: 26 }, (_, index) => ({
      id: `gift-${String(index).padStart(2, "0")}`,
      organizationId: ORG_ID,
      donorId: DONOR_ID,
      offeringDate: new Date(Date.UTC(2026, 0, index + 1)),
      totalAmount: "10.00",
      deductibleAmount: "10.00",
      isTest: false,
      allocations: [
        {
          organizationId: ORG_ID,
          offeringTypeId: TITHE_ID,
          amount: "10.00",
          fundName: "Tithe",
          offeringTypeOrganizationId: ORG_ID,
        },
      ],
    }));
    const pageOne = await getMemberGivingHistory({ year: "2026" }, NOW);
    expect(pageOne.status).toBe("READY");
    if (pageOne.status !== "READY") return;
    expect(pageOne.page).toBe(1);
    expect(pageOne.pageSize).toBe(MEMBER_GIVING_HISTORY_PAGE_SIZE);
    expect(pageOne.pageCount).toBe(2);
    expect(pageOne.gifts).toHaveLength(25);
    expect(pageOne.official.giftCount).toBe(26);
    expect(pageOne.official.totalAmount).toBe("260.00");

    const pageTwo = await getMemberGivingHistory(
      { year: "2026", page: "2" },
      NOW,
    );
    expect(pageTwo.status).toBe("READY");
    if (pageTwo.status !== "READY") return;
    expect(pageTwo.page).toBe(2);
    expect(pageTwo.gifts).toHaveLength(1);
    expect(pageTwo.official.giftCount).toBe(26);
  });

  it("does not leak sensitive payment, staff, or other-donor fields", async () => {
    const result = await getMemberGivingHistory({ year: "2026" }, NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const json = JSON.stringify(result);
    expect(json).not.toMatch(
      /CHECK|1234|internal memo|pi_secret|pi_test|ann@church.test|other donor|batchId|paymentMethod|checkNumber/i,
    );
    expect(json).not.toContain(DONOR_ID);
    expect(json).not.toContain(OTHER_DONOR);
    expect(json).not.toContain(USER_ID);
    expect(result.gifts[0]).toEqual({
      id: "gift-test",
      offeringDate: new Date("2026-03-01T00:00:00.000Z"),
      totalAmount: "25.00",
      deductibleAmount: "25.00",
      isTest: true,
      allocations: [{ fund: "Tithe", amount: "25.00" }],
    });
    expect(result.gifts[1]?.allocations).toEqual([
      { fund: "Tithe", amount: "60.00" },
      { fund: "Missions", amount: "40.00" },
    ]);
  });
});
