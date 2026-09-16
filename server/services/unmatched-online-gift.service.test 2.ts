import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";

type DonationRow = {
  id: string;
  organizationId: string;
  donorId: string | null;
  isTest: boolean;
  stripeCheckoutSessionId: string | null;
};

const store = vi.hoisted(() => ({
  donations: new Map<string, DonationRow>(),
  audits: [] as Array<Record<string, unknown>>,
  persistShouldFail: false,
  txChain: Promise.resolve(),
}));

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  getGivingAccess: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  donorFindMany: vi.fn(),
  donationCount: vi.fn(),
  donationFindMany: vi.fn(),
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
    requireUnmatchedGiftViewAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canViewStatements) {
        throw new Error("denied");
      }
      return access;
    },
    requireUnmatchedGiftMatchAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canManageStatements) {
        throw new Error("denied");
      }
      return access;
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    donation: {
      count: mocks.donationCount,
      findMany: mocks.donationFindMany,
      findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) => {
        const row = store.donations.get(where.id);
        if (!row || row.organizationId !== where.organizationId) return null;
        if (!row.stripeCheckoutSessionId) return null;
        return row;
      }),
      updateMany: vi.fn(async ({
        where,
        data,
      }: {
        where: { id: string; organizationId: string; donorId: null };
        data: { donorId: string };
      }) => {
        const row = store.donations.get(where.id);
        if (
          !row ||
          row.organizationId !== where.organizationId ||
          row.donorId !== null ||
          !row.stripeCheckoutSessionId
        ) {
          return { count: 0 };
        }
        row.donorId = data.donorId;
        return { count: 1 };
      }),
    },
    donor: {
      findMany: mocks.donorFindMany,
      findFirst: vi.fn(async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => {
        const donors = (mocks.donorFindMany.mock.results[0]?.value ??
          mocks.donorFindMany.getMockImplementation()?.({ where: {} }) ??
          []) as Array<{
          id: string;
          organizationId?: string;
          active: boolean;
        }>;
        void donors;
        return storeDonorLookup(where.id, where.organizationId);
      }),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
      const run = store.txChain.then(async () => {
      const snapshot = [...store.donations.entries()].map(([id, row]) => [
        id,
        { ...row },
      ]) as Array<[string, DonationRow]>;
      const auditSnapshot = [...store.audits];
      const tx = {
        donation: {
          findFirst: async ({
            where,
          }: {
            where: { id: string; organizationId: string };
          }) => {
            const row = store.donations.get(where.id);
            if (!row || row.organizationId !== where.organizationId) return null;
            if (!row.stripeCheckoutSessionId) return null;
            return row;
          },
          updateMany: async ({
            where,
            data,
          }: {
            where: { id: string; organizationId: string; donorId: null };
            data: { donorId: string };
          }) => {
            const row = store.donations.get(where.id);
            if (
              !row ||
              row.organizationId !== where.organizationId ||
              row.donorId !== null ||
              !row.stripeCheckoutSessionId
            ) {
              return { count: 0 };
            }
            row.donorId = data.donorId;
            return { count: 1 };
          },
        },
        donor: {
          findFirst: async ({
            where,
          }: {
            where: { id: string; organizationId: string };
          }) => storeDonorLookup(where.id, where.organizationId),
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
        store.donations = new Map(snapshot);
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

const donorStore = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    organizationId: string;
    active: boolean;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    householdMemberships: Array<{ household: { displayName: string } }>;
  }>,
}));

function storeDonorLookup(id: string, organizationId: string) {
  const donor = donorStore.rows.find((row) => row.id === id);
  if (!donor || donor.organizationId !== organizationId) return null;
  return { id: donor.id, active: donor.active, organizationId: donor.organizationId };
}

import {
  MATCH_ONLINE_GIFT_TO_DONOR,
  UnmatchedGiftError,
  getUnmatchedOnlineGiftQueue,
  matchUnmatchedOnlineGift,
  searchDonorsForOnlineGiftMatch,
} from "./unmatched-online-gift.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const DONATION_ID = "00000000-0000-4000-8000-00000000b001";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_DONOR = "00000000-0000-4000-8000-00000000d002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";

function accessFor(role: RoleCode | null) {
  return {
    canViewGiving: role === RoleCode.ORG_ADMIN || role === RoleCode.TREASURER || role === RoleCode.REPORT_VIEWER || role === RoleCode.DATA_ENTRY,
    canViewStatements: role === RoleCode.ORG_ADMIN || role === RoleCode.TREASURER || role === RoleCode.REPORT_VIEWER,
    canManageStatements: role === RoleCode.ORG_ADMIN || role === RoleCode.TREASURER,
    canExportGiving: role === RoleCode.ORG_ADMIN || role === RoleCode.TREASURER || role === RoleCode.REPORT_VIEWER,
    roleCode: role,
    isSuperAdmin: false,
  };
}

function seedUnmatchedGift() {
  store.donations.set(DONATION_ID, {
    id: DONATION_ID,
    organizationId: ORG_ID,
    donorId: null,
    isTest: true,
    stripeCheckoutSessionId: "cs_test_abc123",
  });
}

function seedLocalDonor(overrides: Partial<(typeof donorStore.rows)[number]> = {}) {
  donorStore.rows = [
    {
      id: DONOR_ID,
      organizationId: ORG_ID,
      active: true,
      firstName: "Pat",
      lastName: "Donor",
      email: "pat@example.com",
      phone: "2075551234",
      householdMemberships: [{ household: { displayName: "Donor Household" } }],
      ...overrides,
    },
  ];
}

const defaultQuery = {
  environment: "all" as const,
  page: 1,
  pageSize: 20,
  sort: "offeringDate" as const,
  order: "desc" as const,
};

describe("unmatched online gift review", () => {
  beforeEach(() => {
    store.donations.clear();
    store.audits = [];
    store.persistShouldFail = false;
    store.txChain = Promise.resolve();
    donorStore.rows = [];
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First UPC",
      displayName: null,
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(accessFor(RoleCode.ORG_ADMIN));
    mocks.donationCount.mockResolvedValue(0);
    mocks.donationFindMany.mockResolvedValue([]);
    mocks.donorFindMany.mockImplementation(async ({ where }: { where: { organizationId: string } }) => {
      return donorStore.rows.filter((row) => row.organizationId === where.organizationId && row.active);
    });
  });

  it("lets ORG_ADMIN match an unmatched gift and write one audit event", async () => {
    seedUnmatchedGift();
    seedLocalDonor();
    const result = await matchUnmatchedOnlineGift({
      donationId: DONATION_ID,
      donorId: DONOR_ID,
      confirmed: true,
    });
    expect(result).toEqual({ donationId: DONATION_ID, donorId: DONOR_ID });
    expect(store.donations.get(DONATION_ID)?.donorId).toBe(DONOR_ID);
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      action: MATCH_ONLINE_GIFT_TO_DONOR,
      entityType: "Donation",
      entityId: DONATION_ID,
      actorUserAccountId: USER_ID,
      organizationId: ORG_ID,
    });
    expect(JSON.stringify(store.audits[0])).not.toMatch(
      /pat@example.com|cs_test_abc123|whsec_|card number/i,
    );
  });

  it("lets TREASURER match an unmatched gift", async () => {
    mocks.getGivingAccess.mockResolvedValue(accessFor(RoleCode.TREASURER));
    seedUnmatchedGift();
    seedLocalDonor();
    await expect(
      matchUnmatchedOnlineGift({
        donationId: DONATION_ID,
        donorId: DONOR_ID,
        confirmed: true,
      }),
    ).resolves.toMatchObject({ donationId: DONATION_ID });
  });

  it("lets REPORT_VIEWER view but not match", async () => {
    mocks.getGivingAccess.mockResolvedValue(accessFor(RoleCode.REPORT_VIEWER));
    mocks.donationFindMany.mockResolvedValue([]);
    const queue = await getUnmatchedOnlineGiftQueue(defaultQuery);
    expect(queue.canMatch).toBe(false);
    seedUnmatchedGift();
    seedLocalDonor();
    await expect(
      matchUnmatchedOnlineGift({
        donationId: DONATION_ID,
        donorId: DONOR_ID,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.donations.get(DONATION_ID)?.donorId).toBeNull();
    expect(store.audits).toHaveLength(0);
  });

  it("blocks DATA_ENTRY and DONOR from viewing or matching", async () => {
    for (const role of [RoleCode.DATA_ENTRY, RoleCode.DONOR]) {
      mocks.getGivingAccess.mockResolvedValue(accessFor(role));
      await expect(getUnmatchedOnlineGiftQueue(defaultQuery)).rejects.toBeInstanceOf(
        UnmatchedGiftError,
      );
      await expect(
        matchUnmatchedOnlineGift({
          donationId: DONATION_ID,
          donorId: DONOR_ID,
          confirmed: true,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("blocks signed-out users", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    seedUnmatchedGift();
    seedLocalDonor();
    await expect(
      matchUnmatchedOnlineGift({
        donationId: DONATION_ID,
        donorId: DONOR_ID,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "SIGNED_OUT" });
    expect(store.audits).toHaveLength(0);
  });

  it("cannot view or match a cross-organization donation", async () => {
    store.donations.set(DONATION_ID, {
      id: DONATION_ID,
      organizationId: OTHER_ORG,
      donorId: null,
      isTest: true,
      stripeCheckoutSessionId: "cs_test_abc123",
    });
    seedLocalDonor();
    await expect(
      matchUnmatchedOnlineGift({
        donationId: DONATION_ID,
        donorId: DONOR_ID,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.donations.get(DONATION_ID)?.donorId).toBeNull();
  });

  it("cannot select a cross-organization or inactive donor", async () => {
    seedUnmatchedGift();
    donorStore.rows = [
      {
        id: OTHER_DONOR,
        organizationId: OTHER_ORG,
        active: true,
        firstName: "Other",
        lastName: "Church",
        email: "other@example.com",
        phone: null,
        householdMemberships: [],
      },
    ];
    await expect(
      matchUnmatchedOnlineGift({
        donationId: DONATION_ID,
        donorId: OTHER_DONOR,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    seedLocalDonor({ active: false });
    await expect(
      matchUnmatchedOnlineGift({
        donationId: DONATION_ID,
        donorId: DONOR_ID,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "INACTIVE_DONOR" });
    expect(store.donations.get(DONATION_ID)?.donorId).toBeNull();
  });

  it("rejects non-Stripe donations", async () => {
    store.donations.set(DONATION_ID, {
      id: DONATION_ID,
      organizationId: ORG_ID,
      donorId: null,
      isTest: false,
      stripeCheckoutSessionId: null,
    });
    seedLocalDonor();
    await expect(
      matchUnmatchedOnlineGift({
        donationId: DONATION_ID,
        donorId: DONOR_ID,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not overwrite an already matched donation", async () => {
    store.donations.set(DONATION_ID, {
      id: DONATION_ID,
      organizationId: ORG_ID,
      donorId: "00000000-0000-4000-8000-00000000d099",
      isTest: true,
      stripeCheckoutSessionId: "cs_test_abc123",
    });
    seedLocalDonor();
    await expect(
      matchUnmatchedOnlineGift({
        donationId: DONATION_ID,
        donorId: DONOR_ID,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "ALREADY_MATCHED" });
    expect(store.donations.get(DONATION_ID)?.donorId).toBe(
      "00000000-0000-4000-8000-00000000d099",
    );
    expect(store.audits).toHaveLength(0);
  });

  it("allows only one concurrent match and one audit event", async () => {
    seedUnmatchedGift();
    seedLocalDonor();
    const [first, second] = await Promise.allSettled([
      matchUnmatchedOnlineGift({
        donationId: DONATION_ID,
        donorId: DONOR_ID,
        confirmed: true,
      }),
      matchUnmatchedOnlineGift({
        donationId: DONATION_ID,
        donorId: DONOR_ID,
        confirmed: true,
      }),
    ]);
    const successes = [first, second].filter((result) => result.status === "fulfilled");
    const failures = [first, second].filter((result) => result.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(store.donations.get(DONATION_ID)?.donorId).toBe(DONOR_ID);
    expect(store.audits).toHaveLength(1);
  });

  it("rolls back the donor assignment when the audit write fails", async () => {
    seedUnmatchedGift();
    seedLocalDonor();
    store.persistShouldFail = true;
    await expect(
      matchUnmatchedOnlineGift({
        donationId: DONATION_ID,
        donorId: DONOR_ID,
        confirmed: true,
      }),
    ).rejects.toBeInstanceOf(UnmatchedGiftError);
    expect(store.donations.get(DONATION_ID)?.donorId).toBeNull();
    expect(store.audits).toHaveLength(0);
  });

  it("never returns donors from another organization", async () => {
    donorStore.rows = [
      {
        id: OTHER_DONOR,
        organizationId: OTHER_ORG,
        active: true,
        firstName: "Other",
        lastName: "Church",
        email: "same@example.com",
        phone: null,
        householdMemberships: [],
      },
      {
        id: DONOR_ID,
        organizationId: ORG_ID,
        active: true,
        firstName: "Pat",
        lastName: "Donor",
        email: "same@example.com",
        phone: null,
        householdMemberships: [],
      },
    ];
    const results = await searchDonorsForOnlineGiftMatch("same@example.com");
    expect(results.map((row) => row.id)).toEqual([DONOR_ID]);
    expect(results[0]?.recommended).toBe(true);
    expect(JSON.stringify(results)).not.toContain("same@example.com");
    expect(mocks.donorFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID, active: true }),
      }),
    );
  });

  it("scopes the unmatched queue to the current organization and Stripe gifts", async () => {
    mocks.donationFindMany.mockResolvedValue([]);
    await getUnmatchedOnlineGiftQueue(defaultQuery);
    expect(mocks.donationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG_ID,
          stripeCheckoutSessionId: { not: null },
          donorId: null,
        },
      }),
    );
  });
});
