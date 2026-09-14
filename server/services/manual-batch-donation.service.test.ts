import { beforeEach, describe, expect, it, vi } from "vitest";

import { OfferingBatchStatus, RoleCode } from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";
import Decimal from "decimal.js";

type BatchRow = {
  id: string;
  organizationId: string;
  status: OfferingBatchStatus;
  offeringDate: Date;
  recordedTotal: { toString(): string };
};

type DonorRow = {
  id: string;
  organizationId: string;
  active: boolean;
};

type FundRow = {
  id: string;
  organizationId: string;
  active: boolean;
};

type DonationRow = {
  id: string;
  organizationId: string;
  donorId: string | null;
  batchId: string | null;
  paymentMethod: string;
  totalAmount: { toString(): string };
  deductibleAmount: { toString(): string };
  anonymous: boolean;
  isTest: boolean;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  checkNumber: string | null;
  note: string | null;
};

const store = vi.hoisted(() => ({
  batches: new Map<string, BatchRow>(),
  donors: new Map<string, DonorRow>(),
  funds: new Map<string, FundRow>(),
  donations: new Map<string, DonationRow>(),
  allocations: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
  persistShouldFail: false,
  allocationShouldFail: false,
  flipStatusAfterRead: null as OfferingBatchStatus | null,
  txChain: Promise.resolve(),
  ids: 0,
}));

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  getGivingAccess: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  findActiveDonorsForBatchEntry: vi.fn(),
  findActiveOfferingTypes: vi.fn(),
  findBatchDonations: vi.fn(),
  countBatchDonations: vi.fn(),
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
      if (!access.canViewBatches) throw new Error("denied");
      return access;
    },
    requireBatchDonationEntryAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canAddBatchDonations) throw new Error("denied");
      return access;
    },
  };
});

vi.mock("@/server/repositories/manual-batch-donation.repository", () => ({
  findActiveDonorsForBatchEntry: mocks.findActiveDonorsForBatchEntry,
  findActiveOfferingTypes: mocks.findActiveOfferingTypes,
  findBatchDonations: mocks.findBatchDonations,
  countBatchDonations: mocks.countBatchDonations,
}));

vi.mock("@/server/repositories/offering-batch.repository", () => ({
  findOfferingBatchById: mocks.findOfferingBatchById,
}));

function money(value: string) {
  return { toString: () => value };
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
      const run = store.txChain.then(async () => {
        const batchSnapshot = [...store.batches.entries()].map(([id, row]) => [
          id,
          { ...row, recordedTotal: money(row.recordedTotal.toString()) },
        ]) as Array<[string, BatchRow]>;
        const donationSnapshot = [...store.donations.entries()].map(
          ([id, row]) => [id, { ...row }],
        ) as Array<[string, DonationRow]>;
        const allocationSnapshot = [...store.allocations];
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
              const copy = {
                ...row,
                recordedTotal: money(row.recordedTotal.toString()),
              };
              if (store.flipStatusAfterRead) {
                row.status = store.flipStatusAfterRead;
              }
              return copy;
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
              data: { recordedTotal?: { increment: string } };
            }) => {
              const row = store.batches.get(where.id);
              if (
                !row ||
                row.organizationId !== where.organizationId ||
                row.status !== where.status
              ) {
                return { count: 0 };
              }
              if (data.recordedTotal?.increment) {
                row.recordedTotal = money(
                  new Decimal(row.recordedTotal.toString())
                    .plus(data.recordedTotal.increment)
                    .toFixed(2),
                );
              }
              return { count: 1 };
            },
          },
          donor: {
            findFirst: async ({
              where,
            }: {
              where: { id: string; organizationId: string };
            }) => {
              const row = store.donors.get(where.id);
              if (!row || row.organizationId !== where.organizationId) {
                return null;
              }
              return { id: row.id, active: row.active };
            },
          },
          offeringType: {
            findMany: async ({
              where,
            }: {
              where: { id: { in: string[] }; organizationId: string };
            }) =>
              [...store.funds.values()].filter(
                (row) =>
                  row.organizationId === where.organizationId &&
                  where.id.in.includes(row.id),
              ),
          },
          donation: {
            create: async ({
              data,
            }: {
              data: Omit<DonationRow, "id"> & { totalAmount: string; deductibleAmount: string };
            }) => {
              const id = `donation-${++store.ids}`;
              const row: DonationRow = {
                id,
                organizationId: data.organizationId,
                donorId: data.donorId,
                batchId: data.batchId,
                paymentMethod: data.paymentMethod,
                totalAmount: money(data.totalAmount),
                deductibleAmount: money(data.deductibleAmount),
                anonymous: data.anonymous,
                isTest: data.isTest,
                stripeCheckoutSessionId: data.stripeCheckoutSessionId,
                stripePaymentIntentId: data.stripePaymentIntentId,
                checkNumber: data.checkNumber,
                note: data.note,
              };
              store.donations.set(id, row);
              return {
                id,
                totalAmount: row.totalAmount,
                donorId: row.donorId,
                anonymous: row.anonymous,
              };
            },
          },
          donationAllocation: {
            createMany: async ({
              data,
            }: {
              data: Array<Record<string, unknown>>;
            }) => {
              if (store.allocationShouldFail) {
                throw new Error("allocation write failed");
              }
              store.allocations.push(...data);
              return { count: data.length };
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
          store.donations = new Map(donationSnapshot);
          store.allocations = allocationSnapshot;
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
  CREATE_MANUAL_BATCH_DONATION,
  ManualBatchDonationError,
  createManualBatchDonation,
  getOfferingBatchDonations,
  searchDonorsForBatchDonation,
} from "./manual-batch-donation.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const BATCH_ID = "00000000-0000-4000-8000-00000000b001";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_DONOR = "00000000-0000-4000-8000-00000000d002";
const FUND_ID = "00000000-0000-4000-8000-00000000f001";
const OTHER_FUND = "00000000-0000-4000-8000-00000000f002";
const STRIPE_DONATION = "00000000-0000-4000-8000-00000000e001";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    donorId: DONOR_ID,
    anonymous: false,
    offeringDate: "2026-09-06",
    receivedDate: "2026-09-06",
    confirmOfferingDateOverride: false,
    paymentMethod: "CASH",
    checkNumber: "",
    reference: "",
    note: "Counted after service",
    isTaxDeductible: true,
    deductibleAmount: "25.00",
    goodsOrServicesProvided: false,
    goodsOrServicesDescription: "",
    goodsOrServicesEstimatedValue: "",
    intangibleReligiousBenefitsOnly: false,
    allocations: [{ offeringTypeId: FUND_ID, amount: "25.00" }],
    ...overrides,
  };
}

function seedDraftBatch() {
  store.batches.set(BATCH_ID, {
    id: BATCH_ID,
    organizationId: ORG_ID,
    status: OfferingBatchStatus.DRAFT,
    offeringDate: new Date("2026-09-06T00:00:00.000Z"),
    recordedTotal: money("0.00"),
  });
}

function seedDonor(overrides: Partial<DonorRow> = {}) {
  const row = {
    id: DONOR_ID,
    organizationId: ORG_ID,
    active: true,
    ...overrides,
  };
  store.donors.set(row.id, row);
}

function seedFund(overrides: Partial<FundRow> = {}) {
  const row = {
    id: FUND_ID,
    organizationId: ORG_ID,
    active: true,
    ...overrides,
  };
  store.funds.set(row.id, row);
}

describe("manual batch donation entry", () => {
  beforeEach(() => {
    store.batches.clear();
    store.donors.clear();
    store.funds.clear();
    store.donations.clear();
    store.allocations = [];
    store.audits = [];
    store.persistShouldFail = false;
    store.allocationShouldFail = false;
    store.flipStatusAfterRead = null;
    store.txChain = Promise.resolve();
    store.ids = 0;
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First UPC",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN),
    );
    mocks.findOfferingBatchById.mockImplementation(
      async (organizationId: string, batchId: string) => {
        const row = store.batches.get(batchId);
        if (!row || row.organizationId !== organizationId) return null;
        return row;
      },
    );
    mocks.countBatchDonations.mockResolvedValue(0);
    mocks.findBatchDonations.mockResolvedValue([]);
    mocks.findActiveOfferingTypes.mockResolvedValue([]);
    mocks.findActiveDonorsForBatchEntry.mockResolvedValue([]);
    seedDraftBatch();
    seedDonor();
    seedFund();
  });

  it.each([RoleCode.ORG_ADMIN, RoleCode.TREASURER, RoleCode.DATA_ENTRY])(
    "lets %s add a manual donation and write one audit event",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      const result = await createManualBatchDonation(BATCH_ID, validInput());
      const donation = [...store.donations.values()][0];
      expect(result.totalAmount).toBe("25.00");
      expect(donation?.organizationId).toBe(ORG_ID);
      expect(donation?.batchId).toBe(BATCH_ID);
      expect(donation?.isTest).toBe(false);
      expect(donation?.stripeCheckoutSessionId).toBeNull();
      expect(donation?.stripePaymentIntentId).toBeNull();
      expect(store.batches.get(BATCH_ID)?.recordedTotal.toString()).toBe(
        "25.00",
      );
      expect(store.allocations).toHaveLength(1);
      expect(store.audits).toHaveLength(1);
      expect(store.audits[0]).toMatchObject({
        action: CREATE_MANUAL_BATCH_DONATION,
        entityType: "Donation",
        entityId: donation?.id,
        organizationId: ORG_ID,
        actorUserAccountId: USER_ID,
      });
      expect(JSON.stringify(store.audits[0])).not.toMatch(
        /Counted after service|@|555|check number|whsec_|card/i,
      );
    },
  );

  it("blocks REPORT_VIEWER, DONOR, and signed-out users from adding donations", async () => {
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER),
    );
    await expect(
      createManualBatchDonation(BATCH_ID, validInput()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.DONOR),
    );
    await expect(
      createManualBatchDonation(BATCH_ID, validInput()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(searchDonorsForBatchDonation("Pat")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      createManualBatchDonation(BATCH_ID, validInput()),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
    expect(store.donations.size).toBe(0);
    expect(store.audits).toHaveLength(0);
  });

  it("rejects cross-organization batches, donors, and funds", async () => {
    store.batches.set(BATCH_ID, {
      ...store.batches.get(BATCH_ID)!,
      organizationId: OTHER_ORG,
    });
    await expect(
      createManualBatchDonation(BATCH_ID, validInput()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    seedDraftBatch();
    store.donors.set(OTHER_DONOR, {
      id: OTHER_DONOR,
      organizationId: OTHER_ORG,
      active: true,
    });
    await expect(
      createManualBatchDonation(
        BATCH_ID,
        validInput({ donorId: OTHER_DONOR }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    store.funds.set(OTHER_FUND, {
      id: OTHER_FUND,
      organizationId: OTHER_ORG,
      active: true,
    });
    await expect(
      createManualBatchDonation(
        BATCH_ID,
        validInput({
          allocations: [{ offeringTypeId: OTHER_FUND, amount: "25.00" }],
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.donations.size).toBe(0);
  });

  it("rejects inactive donors and inactive funds", async () => {
    seedDonor({ active: false });
    await expect(
      createManualBatchDonation(BATCH_ID, validInput()),
    ).rejects.toMatchObject({ code: "INACTIVE_DONOR" });
    seedDonor({ active: true });
    seedFund({ active: false });
    await expect(
      createManualBatchDonation(BATCH_ID, validInput()),
    ).rejects.toMatchObject({ code: "INACTIVE_FUND" });
  });

  it("requires confirmation when the offering date differs from the batch", async () => {
    await expect(
      createManualBatchDonation(
        BATCH_ID,
        validInput({ offeringDate: "2026-09-13" }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      createManualBatchDonation(
        BATCH_ID,
        validInput({
          offeringDate: "2026-09-13",
          confirmOfferingDateOverride: true,
        }),
      ),
    ).resolves.toMatchObject({ totalAmount: "25.00" });
  });

  it("forces anonymous gifts to have a null donorId", async () => {
    const result = await createManualBatchDonation(
      BATCH_ID,
      validInput({ anonymous: true, donorId: "" }),
    );
    expect(store.donations.get(result.id)?.donorId).toBeNull();
    expect(store.donations.get(result.id)?.anonymous).toBe(true);
  });

  it("ignores client-supplied organization, Stripe, test, and batch-total fields", async () => {
    await createManualBatchDonation(BATCH_ID, {
      ...validInput(),
      organizationId: OTHER_ORG,
      stripeCheckoutSessionId: "cs_test_abc",
      stripePaymentIntentId: "pi_test_abc",
      isTest: true,
      recordedTotal: "999.00",
      totalAmount: "999.00",
    });
    const donation = [...store.donations.values()][0];
    expect(donation?.organizationId).toBe(ORG_ID);
    expect(donation?.stripeCheckoutSessionId).toBeNull();
    expect(donation?.stripePaymentIntentId).toBeNull();
    expect(donation?.isTest).toBe(false);
    expect(donation?.totalAmount.toString()).toBe("25.00");
    expect(store.batches.get(BATCH_ID)?.recordedTotal.toString()).toBe("25.00");
  });

  it.each([
    OfferingBatchStatus.ENTERED,
    OfferingBatchStatus.RECONCILED,
    OfferingBatchStatus.LOCKED,
  ])("rejects donations on %s batches", async (status) => {
    store.batches.get(BATCH_ID)!.status = status;
    await expect(
      createManualBatchDonation(BATCH_ID, validInput()),
    ).rejects.toMatchObject({ code: "NOT_EDITABLE" });
    expect(store.donations.size).toBe(0);
  });

  it("rolls back when the batch status changes concurrently", async () => {
    store.flipStatusAfterRead = OfferingBatchStatus.ENTERED;
    await expect(
      createManualBatchDonation(BATCH_ID, validInput()),
    ).rejects.toMatchObject({
      code: "NOT_EDITABLE",
      message: "This batch is no longer a draft and cannot accept donations.",
    });
    expect(store.donations.size).toBe(0);
    expect(store.batches.get(BATCH_ID)?.recordedTotal.toString()).toBe("0.00");
    expect(store.audits).toHaveLength(0);
  });

  it("adds concurrent valid donations without losing recordedTotal updates", async () => {
    const [first, second] = await Promise.allSettled([
      createManualBatchDonation(BATCH_ID, validInput()),
      createManualBatchDonation(
        BATCH_ID,
        validInput({
          allocations: [{ offeringTypeId: FUND_ID, amount: "10.00" }],
          deductibleAmount: "10.00",
        }),
      ),
    ]);
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("fulfilled");
    expect(store.donations.size).toBe(2);
    expect(store.batches.get(BATCH_ID)?.recordedTotal.toString()).toBe("35.00");
    expect(store.audits).toHaveLength(2);
  });

  it("rolls back the donation and batch total when allocation or audit writes fail", async () => {
    store.allocationShouldFail = true;
    await expect(
      createManualBatchDonation(BATCH_ID, validInput()),
    ).rejects.toBeInstanceOf(ManualBatchDonationError);
    expect(store.donations.size).toBe(0);
    expect(store.batches.get(BATCH_ID)?.recordedTotal.toString()).toBe("0.00");

    store.allocationShouldFail = false;
    store.persistShouldFail = true;
    await expect(
      createManualBatchDonation(BATCH_ID, validInput()),
    ).rejects.toBeInstanceOf(ManualBatchDonationError);
    expect(store.donations.size).toBe(0);
    expect(store.batches.get(BATCH_ID)?.recordedTotal.toString()).toBe("0.00");
    expect(store.audits).toHaveLength(0);
  });

  it("does not modify an existing Stripe gift on the same batch", async () => {
    const stripeGift: DonationRow = {
      id: STRIPE_DONATION,
      organizationId: ORG_ID,
      donorId: null,
      batchId: BATCH_ID,
      paymentMethod: "CARD",
      totalAmount: money("40.00"),
      deductibleAmount: money("40.00"),
      anonymous: false,
      isTest: true,
      stripeCheckoutSessionId: "cs_test_keep",
      stripePaymentIntentId: "pi_test_keep",
      checkNumber: null,
      note: "Stripe sandbox test gift",
    };
    store.donations.set(STRIPE_DONATION, stripeGift);
    store.batches.get(BATCH_ID)!.recordedTotal = money("40.00");
    await createManualBatchDonation(BATCH_ID, validInput());
    expect(store.donations.get(STRIPE_DONATION)).toEqual(stripeGift);
    expect(store.batches.get(BATCH_ID)?.recordedTotal.toString()).toBe("65.00");
  });

  it("scopes donation lists to the current organization", async () => {
    await getOfferingBatchDonations(BATCH_ID, { page: 1, pageSize: 20 });
    expect(mocks.findBatchDonations).toHaveBeenCalledWith(ORG_ID, BATCH_ID, {
      skip: 0,
      take: 20,
    });
    expect(mocks.countBatchDonations).toHaveBeenCalledWith(ORG_ID, BATCH_ID);
  });

  it("never returns donors from another organization", async () => {
    mocks.findActiveDonorsForBatchEntry.mockImplementation(
      async (organizationId: string) => {
        expect(organizationId).toBe(ORG_ID);
        return [
          {
            id: DONOR_ID,
            firstName: "Pat",
            lastName: "Donor",
            email: "pat@example.com",
            phone: "2075551234",
            householdMemberships: [],
          },
        ];
      },
    );
    const results = await searchDonorsForBatchDonation("pat@example.com");
    expect(results.map((row) => row.id)).toEqual([DONOR_ID]);
    expect(JSON.stringify(results)).not.toContain("pat@example.com");
    expect(JSON.stringify(results)).not.toContain("2075551234");
  });
});
