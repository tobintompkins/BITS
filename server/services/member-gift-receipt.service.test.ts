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
  firstName: string;
  lastName: string;
  email?: string;
  mailingAddressLine1?: string;
};

const store = vi.hoisted(() => ({
  donors: [] as DonorRow[],
  donations: [] as DonationRow[],
  lastDonorWhere: null as unknown,
  lastGiftWhere: null as unknown,
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

vi.mock("@/lib/db/prisma", () => ({
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
        const donor = store.donors.find(
          (row) =>
            row.organizationId === where.organizationId &&
            row.userAccountId === where.userAccountId &&
            row.active === where.active,
        );
        if (!donor) return null;
        return {
          id: donor.id,
          firstName: donor.firstName,
          lastName: donor.lastName,
        };
      },
    },
    donation: {
      findFirst: async ({
        where,
      }: {
        where: {
          id: string;
          organizationId: string;
          donorId: string;
        };
      }) => {
        store.lastGiftWhere = where;
        const row = store.donations.find(
          (gift) =>
            gift.id === where.id &&
            gift.organizationId === where.organizationId &&
            gift.donorId === where.donorId,
        );
        if (!row) return null;
        return {
          offeringDate: row.offeringDate,
          totalAmount: { toString: () => row.totalAmount },
          deductibleAmount: { toString: () => row.deductibleAmount },
          isTest: row.isTest,
          allocations: row.allocations
            .filter(
              (allocation) =>
                allocation.organizationId === where.organizationId &&
                allocation.offeringTypeOrganizationId === where.organizationId,
            )
            .map((allocation) => ({
              amount: { toString: () => allocation.amount },
              offeringType: { name: allocation.fundName },
            })),
        };
      },
    },
  },
}));

import { getMemberGiftReceipt } from "./member-gift-receipt.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_DONOR = "00000000-0000-4000-8000-00000000d002";
const GIFT_ID = "00000000-0000-4000-8000-00000000e001";
const TEST_GIFT_ID = "00000000-0000-4000-8000-00000000e002";
const OTHER_DONOR_GIFT = "00000000-0000-4000-8000-00000000e003";
const OTHER_ORG_GIFT = "00000000-0000-4000-8000-00000000e004";
const TITHE_ID = "00000000-0000-4000-8000-00000000f001";
const MISSIONS_ID = "00000000-0000-4000-8000-00000000f002";

function seed() {
  store.donors = [
    {
      id: DONOR_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      active: true,
      firstName: "Ann",
      lastName: "Adams",
      email: "ann@church.test",
      mailingAddressLine1: "9 Secret Lane",
    },
    {
      id: OTHER_DONOR,
      organizationId: ORG_ID,
      userAccountId: "00000000-0000-4000-8000-00000000c099",
      active: true,
      firstName: "Other",
      lastName: "Donor",
      email: "other@church.test",
    },
  ];
  store.donations = [
    {
      id: GIFT_ID,
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
      id: TEST_GIFT_ID,
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
      id: OTHER_DONOR_GIFT,
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
      id: OTHER_ORG_GIFT,
      organizationId: OTHER_ORG,
      donorId: DONOR_ID,
      offeringDate: new Date("2026-04-01T00:00:00.000Z"),
      totalAmount: "80.00",
      deductibleAmount: "80.00",
      isTest: false,
      allocations: [
        {
          organizationId: OTHER_ORG,
          offeringTypeId: "00000000-0000-4000-8000-00000000f003",
          amount: "80.00",
          fundName: "Other Tithe",
          offeringTypeOrganizationId: OTHER_ORG,
        },
      ],
    },
  ];
  store.lastDonorWhere = null;
  store.lastGiftWhere = null;
}

describe("member gift receipt", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
      displayName: "First UPC of Saco",
      mailingAddressLine1: "100 Church Street",
      mailingAddressLine2: null,
      city: "Saco",
      state: "ME",
      postalCode: "04072",
      country: "US",
      statementFooterText:
        "No goods or services were provided other than intangible religious benefits.",
      ein: "12-3456789",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: "ann@church.test",
      displayName: "Ann Adams",
    });
  });

  it("returns signed out without querying church records", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberGiftReceipt(GIFT_ID)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastDonorWhere).toBeNull();
    expect(store.lastGiftWhere).toBeNull();
  });

  it("shows a safe pending state when no donor is linked", async () => {
    store.donors = [];
    const result = await getMemberGiftReceipt(GIFT_ID);
    expect(result).toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: "ann@church.test",
    });
    expect(store.lastGiftWhere).toBeNull();
  });

  it("returns the same not-found status for malformed IDs", async () => {
    await expect(getMemberGiftReceipt("not-a-uuid")).resolves.toEqual({
      status: "NOT_FOUND",
    });
    expect(store.lastGiftWhere).toBeNull();
  });

  it("returns the same not-found status for another donor or organization gift", async () => {
    await expect(getMemberGiftReceipt(OTHER_DONOR_GIFT)).resolves.toEqual({
      status: "NOT_FOUND",
    });
    expect(store.lastGiftWhere).toEqual({
      id: OTHER_DONOR_GIFT,
      organizationId: ORG_ID,
      donorId: DONOR_ID,
    });

    store.lastGiftWhere = null;
    await expect(getMemberGiftReceipt(OTHER_ORG_GIFT)).resolves.toEqual({
      status: "NOT_FOUND",
    });
    expect(store.lastGiftWhere).toEqual({
      id: OTHER_ORG_GIFT,
      organizationId: ORG_ID,
      donorId: DONOR_ID,
    });
  });

  it("returns a safe official receipt display model", async () => {
    const result = await getMemberGiftReceipt(GIFT_ID);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.member.displayName).toBe("Ann Adams");
    expect(result.organization).toEqual({
      name: "First United Pentecostal Church of Saco",
      displayName: "First UPC of Saco",
      mailingAddressLine1: "100 Church Street",
      mailingAddressLine2: null,
      city: "Saco",
      state: "ME",
      postalCode: "04072",
      country: "US",
      statementFooterText:
        "No goods or services were provided other than intangible religious benefits.",
    });
    expect(result.gift).toEqual({
      offeringDate: new Date("2026-02-01T00:00:00.000Z"),
      isTest: false,
      totalAmount: "100.00",
      deductibleAmount: "90.00",
      allocations: [
        { fund: "Tithe", amount: "60.00" },
        { fund: "Missions", amount: "40.00" },
      ],
    });
  });

  it("labels Stripe test gifts separately from official gifts", async () => {
    const result = await getMemberGiftReceipt(TEST_GIFT_ID);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.gift.isTest).toBe(true);
    expect(result.gift.totalAmount).toBe("25.00");
    expect(result.gift.allocations).toEqual([
      { fund: "Tithe", amount: "25.00" },
    ]);
  });

  it("does not leak sensitive payment, staff, or identity fields", async () => {
    const result = await getMemberGiftReceipt(GIFT_ID);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const json = JSON.stringify(result);
    expect(json).not.toMatch(
      /CHECK|1234|internal memo|pi_secret|9 Secret Lane|ann@church.test|other donor|batchId|paymentMethod|checkNumber|ein|12-3456789/i,
    );
    expect(json).not.toContain(DONOR_ID);
    expect(json).not.toContain(OTHER_DONOR);
    expect(json).not.toContain(GIFT_ID);
    expect(json).not.toContain(USER_ID);
    expect(json).not.toContain(ORG_ID);
    expect(Object.keys(result)).toEqual([
      "status",
      "organization",
      "member",
      "gift",
    ]);
    expect(Object.keys(result.gift)).toEqual([
      "offeringDate",
      "isTest",
      "totalAmount",
      "deductibleAmount",
      "allocations",
    ]);
  });
});
