import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isAllowedCheckoutRequestOrigin,
  memberStripeGivingSchema,
} from "@/lib/validation/member-stripe-giving";
import { isAllowedStripeDonationFund } from "@/lib/validation/stripe-donation";

type DonorRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  active: boolean;
};

type DonationRow = {
  id: string;
  organizationId: string;
  donorId: string | null;
  stripeCheckoutSessionId: string;
  isTest: boolean;
};

type OfferingTypeRow = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  active: boolean;
  onlineGivingEnabled: boolean;
};

const store = vi.hoisted(() => ({
  donors: [] as DonorRow[],
  donations: [] as DonationRow[],
  offeringTypes: [] as OfferingTypeRow[],
  lastDonorWhere: null as unknown,
  lastDonationCreate: null as unknown,
  lastOfferingTypeCreate: null as unknown,
  createdGuests: [] as Array<{ id: string; userAccountId: string | null; email: string | null }>,
  fetchBodies: [] as string[],
  attribution: null as null | {
    id: string;
    organizationId: string;
    kind: "MEMBER" | "UNVERIFIED_GUEST";
    donorId: string | null;
    contact: { email?: string; firstName?: string; lastName?: string };
    consumedAt: Date | null;
    stripeCheckoutSessionId: string | null;
  },
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getStripeTestSecret: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
  findMemberPortalOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/stripe/test-mode", () => ({
  getStripeTestSecret: mocks.getStripeTestSecret,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    donor: {
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          organizationId: string;
          userAccountId?: string;
          email?: { equals: string; mode: string };
          active: boolean;
        };
      }) => {
        store.lastDonorWhere = where;
        return (
          store.donors.find((donor) => {
            if (donor.organizationId !== where.organizationId) return false;
            if (donor.active !== where.active) return false;
            if (where.id && donor.id !== where.id) return false;
            if (where.userAccountId && typeof where.userAccountId === "object") {
              if (!donor.userAccountId) return false;
            } else if (
              where.userAccountId &&
              donor.userAccountId !== where.userAccountId
            ) {
              return false;
            }
            if (
              where.email &&
              donor.email?.toLowerCase() !== where.email.equals.toLowerCase()
            ) {
              return false;
            }
        return true;
      }) ?? null
        );
      },
      create: async ({
        data,
      }: {
        data: { userAccountId: string | null; email: string | null };
      }) => {
        const row = {
          id: `guest-${store.createdGuests.length + 1}`,
          userAccountId: data.userAccountId,
          email: data.email,
        };
        store.createdGuests.push(row);
        return { id: row.id };
      },
    },
    donation: {
      findUnique: async ({
        where,
      }: {
        where: { stripeCheckoutSessionId: string };
      }) =>
        store.donations.find(
          (row) => row.stripeCheckoutSessionId === where.stripeCheckoutSessionId,
        ) ?? null,
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          donorId: string | null;
          stripeCheckoutSessionId: string;
          isTest: boolean;
        };
      }) => {
        store.lastDonationCreate = data;
        const row = {
          id: `don-${store.donations.length + 1}`,
          organizationId: data.organizationId,
          donorId: data.donorId,
          stripeCheckoutSessionId: data.stripeCheckoutSessionId,
          isTest: data.isTest,
          allocations: [],
        };
        store.donations.push(row);
        return row;
      },
    },
    offeringType: {
      findFirst: async ({
        where,
      }: {
        where: { organizationId: string; code: string };
      }) =>
        store.offeringTypes.find(
          (row) =>
            row.organizationId === where.organizationId &&
            row.code === where.code,
        ) ?? null,
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          name: string;
          code: string;
          onlineGivingEnabled?: boolean;
          defaultTaxDeductible?: boolean;
        };
      }) => {
        const row = {
          id: `fund-${store.offeringTypes.length + 1}`,
          organizationId: data.organizationId,
          name: data.name,
          code: data.code,
          active: true,
          onlineGivingEnabled: data.onlineGivingEnabled ?? true,
        };
        store.offeringTypes.push(row);
        store.lastOfferingTypeCreate = data;
        return row;
      },
      update: async () => {
        throw new Error("existing offering types must not be overwritten");
      },
    },
    checkoutAttribution: {
      create: async () => ({ id: "00000000-0000-4000-8000-00000000e001" }),
      findFirst: async () => store.attribution,
      update: async () => store.attribution,
    },
    $executeRaw: async () => 0,
  },
}));

import {
  persistStripeTestDonation,
  validateStripeTestCheckoutSession,
} from "./stripe-test-giving.service";
import {
  createMemberStripeCheckout,
  getMemberStripeGiving,
} from "./member-stripe-giving.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_DONOR = "00000000-0000-4000-8000-00000000d002";
const OWN_EMAIL = "ann@church.test";

function seed() {
  store.donors = [
    {
      id: DONOR_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      firstName: "Ann",
      lastName: "Adams",
      email: OWN_EMAIL,
      active: true,
    },
    {
      id: OTHER_DONOR,
      organizationId: ORG_ID,
      userAccountId: "00000000-0000-4000-8000-00000000c002",
      firstName: "Other",
      lastName: "Donor",
      email: "other@church.test",
      active: true,
    },
  ];
  store.donations = [];
  store.offeringTypes = [];
  store.lastDonorWhere = null;
  store.lastDonationCreate = null;
  store.lastOfferingTypeCreate = null;
  store.createdGuests = [];
  store.fetchBodies = [];
  store.attribution = null;
}

function sameOriginRequest() {
  return new Request("http://localhost:3001/api/portal/stripe/checkout", {
    method: "POST",
    headers: { origin: "http://localhost:3001" },
  });
}

function paidCheckout(
  metadata: Record<string, string>,
  extras?: Partial<{
    id: string;
    email: string;
  }>,
) {
  return {
    id: extras?.id ?? "cs_test_member123",
    livemode: false,
    created: 1_700_000_000,
    amount_total: 2500,
    currency: "usd",
    payment_status: "paid",
    payment_intent: "pi_test_1",
    customer_details: {
      email: extras?.email ?? OWN_EMAIL,
      name: "Ann Adams",
    },
    metadata,
  };
}

describe("member stripe giving", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: OWN_EMAIL,
      displayName: "Ann Adams",
    });
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First Community Church",
    });
    mocks.getStripeTestSecret.mockReturnValue("sk_test_12345678901234567890");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        store.fetchBodies.push(String(init?.body ?? ""));
        return {
          ok: true,
          json: async () => ({
            url: "https://checkout.stripe.com/c/pay/cs_test_checkout",
          }),
        };
      }),
    );
  });

  it("denies signed-out and pending-link access without creating checkout", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberStripeGiving()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    await expect(
      createMemberStripeCheckout(
        { fund: "Tithes", amount: "25.00" },
        sameOriginRequest(),
      ),
    ).resolves.toEqual({ status: "SIGNED_OUT" });
    expect(store.fetchBodies).toHaveLength(0);

    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: OWN_EMAIL,
    });
    store.donors[0] = { ...store.donors[0], userAccountId: null };
    await expect(getMemberStripeGiving()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    await expect(
      createMemberStripeCheckout(
        { fund: "Tithes", amount: "25.00" },
        sameOriginRequest(),
      ),
    ).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.fetchBodies).toHaveLength(0);
  });

  it("resolves the current organization and linked donor server-side without name or email", async () => {
    await getMemberStripeGiving();
    expect(store.lastDonorWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      active: true,
    });
    const where = JSON.stringify(store.lastDonorWhere);
    expect(where).not.toContain("email");
    expect(where).not.toContain(OWN_EMAIL);
    expect(where).not.toContain("Ann");
  });

  it("ignores client-supplied attribution and only validates fund and amount", async () => {
    const result = await createMemberStripeCheckout(
      {
        fund: "Home Building Fund",
        amount: "40.00",
        donorId: OTHER_DONOR,
        organizationId: OTHER_ORG,
        email: "spoof@example.com",
      },
      sameOriginRequest(),
    );
    expect(result.status).toBe("INVALID");

    const allowed = await createMemberStripeCheckout(
      { fund: "Home Building Fund", amount: "40.00" },
      sameOriginRequest(),
    );
    expect(allowed.status).toBe("READY");
    if (allowed.status !== "READY") return;
    expect(allowed.metadata).toEqual({
      environment: "BITS_TEST",
      fund: "Home Building Fund",
      bits_attribution_id: "00000000-0000-4000-8000-00000000e001",
    });
    const checkoutBody = decodeURIComponent(store.fetchBodies[0] ?? "");
    expect(checkoutBody).toContain("metadata[bits_attribution_id]=");
    expect(checkoutBody).toContain("payment_intent_data[receipt_email]=");
    expect(checkoutBody).not.toContain("metadata[bits_donor_id]");
    expect(checkoutBody).not.toContain(OTHER_DONOR);
    expect(checkoutBody).not.toContain(OTHER_ORG);
  });

  it("accepts allowed member funds and rejects invalid amounts", () => {
    expect(
      memberStripeGivingSchema.safeParse({
        fund: "Home Building Fund",
        amount: "25.00",
      }).success,
    ).toBe(true);
    expect(
      memberStripeGivingSchema.safeParse({
        fund: "Building Fund",
        amount: "25.00",
      }).success,
    ).toBe(false);
    expect(isAllowedStripeDonationFund("Home Building Fund")).toBe(false);
    expect(
      memberStripeGivingSchema.safeParse({ fund: "Tithes", amount: "0.50" })
        .success,
    ).toBe(false);
  });

  it("accepts the configured public origin when the request host is internal", () => {
    vi.stubEnv("APP_BASE_URL", "https://firstupcsaco.up.railway.app");
    const request = new Request("http://127.0.0.1:8080/api/portal/stripe/checkout", {
      method: "POST",
      headers: { origin: "https://firstupcsaco.up.railway.app" },
    });
    expect(isAllowedCheckoutRequestOrigin(request)).toBe(true);
    const foreign = new Request("http://127.0.0.1:8080/api/portal/stripe/checkout", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(isAllowedCheckoutRequestOrigin(foreign)).toBe(false);
    vi.unstubAllEnvs();
  });

  it("rejects a mismatched request origin", async () => {
    const request = new Request(
      "http://localhost:3001/api/portal/stripe/checkout",
      {
        method: "POST",
        headers: { origin: "https://evil.example" },
      },
    );
    expect(isAllowedCheckoutRequestOrigin(request)).toBe(false);
    await expect(
      createMemberStripeCheckout({ fund: "Tithes", amount: "25.00" }, request),
    ).resolves.toEqual({ status: "ORIGIN_REJECTED" });
    expect(store.fetchBodies).toHaveLength(0);
  });

  it("creates checkout metadata without PII or secrets", async () => {
    const result = await createMemberStripeCheckout(
      { fund: "Missions", amount: "15.00" },
      sameOriginRequest(),
    );
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const body = decodeURIComponent(store.fetchBodies[0] ?? "");
    const payload = JSON.stringify(result.metadata);
    expect(payload).not.toContain(OWN_EMAIL);
    expect(payload).not.toContain("Ann");
    expect(payload).not.toContain("sk_test_");
    expect(payload).not.toContain("4242");
    expect(body).not.toContain("Ann Adams");
    expect(body).not.toContain("donor_name");
    expect(body).toContain("metadata[bits_attribution_id]=");
    expect(body).toContain("payment_intent_data[receipt_email]=");
    expect(body).not.toContain("metadata[bits_donor_id]");
    expect(body).toContain("metadata[environment]=BITS_TEST");
  });

  it("persists an attributed donation to the linked donor", async () => {
    store.attribution = {
      id: "00000000-0000-4000-8000-00000000e001",
      organizationId: ORG_ID,
      kind: "MEMBER",
      donorId: DONOR_ID,
      contact: { email: OWN_EMAIL, firstName: "Ann", lastName: "Adams" },
      consumedAt: null,
      stripeCheckoutSessionId: null,
    };
    const validated = validateStripeTestCheckoutSession(
      paidCheckout({
        environment: "BITS_TEST",
        fund: "Home Building Fund",
        bits_attribution_id: "00000000-0000-4000-8000-00000000e001",
      }),
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const recorded = await persistStripeTestDonation(validated.checkout, ORG_ID);
    expect(recorded.alreadyRecorded).toBe(false);
    expect(store.lastDonationCreate).toMatchObject({
      organizationId: ORG_ID,
      donorId: DONOR_ID,
      stripeCheckoutSessionId: "cs_test_member123",
      isTest: true,
    });
    expect(store.lastDonorWhere).toEqual({
      id: DONOR_ID,
      organizationId: ORG_ID,
      active: true,
      userAccountId: { not: null },
    });
  });

  it("rejects organization mismatch and does not email-match invalid member attribution", async () => {
    const mismatch = validateStripeTestCheckoutSession(
      paidCheckout({
        environment: "BITS_TEST",
        fund: "Tithes",
        bits_source: "member",
        bits_organization_id: OTHER_ORG,
        bits_donor_id: DONOR_ID,
      }),
    );
    expect(mismatch.ok).toBe(true);
    if (!mismatch.ok) return;
    const mismatchResult = await persistStripeTestDonation(
      mismatch.checkout,
      ORG_ID,
    );
    expect(mismatchResult.donation.donorId).toBeNull();

    const invalid = validateStripeTestCheckoutSession(
      paidCheckout({
        environment: "BITS_TEST",
        fund: "Tithes",
        bits_source: "member",
        bits_organization_id: ORG_ID,
        bits_donor_id: "not-a-donor-id",
      }),
    );
    expect(invalid.ok).toBe(true);
    if (!invalid.ok) return;
    store.lastDonorWhere = null;
    const invalidResult = await persistStripeTestDonation(
      invalid.checkout,
      ORG_ID,
    );
    expect(invalidResult.donation.donorId).toBeNull();
    expect(JSON.stringify(store.lastDonorWhere)).not.toContain("email");
    expect(JSON.stringify(store.lastDonationCreate)).not.toContain(OTHER_DONOR);
  });

  it("creates a separate unlinked donor for a repeat guest email", async () => {
    store.attribution = {
      id: "00000000-0000-4000-8000-00000000e002",
      organizationId: ORG_ID,
      kind: "UNVERIFIED_GUEST",
      donorId: null,
      contact: { email: OWN_EMAIL, firstName: "Ann", lastName: "Guest" },
      consumedAt: null,
      stripeCheckoutSessionId: null,
    };
    const validated = validateStripeTestCheckoutSession(
      paidCheckout({
        environment: "BITS_TEST",
        fund: "Building Fund",
        bits_attribution_id: "00000000-0000-4000-8000-00000000e002",
      }),
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const recorded = await persistStripeTestDonation(validated.checkout, ORG_ID);
    expect(recorded.donation.donorId).toBe("guest-1");
    expect(recorded.donation.donorId).not.toBe(DONOR_ID);
    expect(store.createdGuests).toEqual([
      { id: "guest-1", userAccountId: null, email: OWN_EMAIL },
    ]);
    expect(JSON.stringify(store.lastDonorWhere ?? {})).not.toContain("email");
    expect(store.donors.map((donor) => donor.userAccountId)).not.toContain(null);

    const replay = await persistStripeTestDonation(validated.checkout, ORG_ID);
    expect(replay.alreadyRecorded).toBe(true);
    expect(store.createdGuests).toHaveLength(1);
    expect(store.donations).toHaveLength(1);
  });

  it("does not claim a guest gift by email when no server attribution is present", async () => {
    const guest = validateStripeTestCheckoutSession(
      paidCheckout({ environment: "BITS_TEST", fund: "Building Fund" }),
    );
    expect(guest.ok).toBe(true);
    if (!guest.ok) return;
    const recorded = await persistStripeTestDonation(guest.checkout, ORG_ID);
    expect(recorded.donation.donorId).toBeNull();
    expect(JSON.stringify(store.lastDonorWhere)).not.toContain("email");
  });

  it("does not create a second gift for the same checkout session", async () => {
    const validated = validateStripeTestCheckoutSession(
      paidCheckout({
        environment: "BITS_TEST",
        fund: "Tithes",
        bits_source: "member",
        bits_organization_id: ORG_ID,
        bits_donor_id: DONOR_ID,
      }),
    );
    if (!validated.ok) return;
    const first = await persistStripeTestDonation(validated.checkout, ORG_ID);
    const second = await persistStripeTestDonation(validated.checkout, ORG_ID);
    expect(first.alreadyRecorded).toBe(false);
    expect(second.alreadyRecorded).toBe(true);
    expect(store.donations).toHaveLength(1);
  });

  it("rejects new member checkout when the matching offering type is inactive", async () => {
    store.offeringTypes.push({
      id: "fund-1",
      organizationId: ORG_ID,
      name: "Tithes",
      code: "STRIPE_TITHES",
      active: false,
      onlineGivingEnabled: true,
    });
    await expect(
      createMemberStripeCheckout(
        { fund: "Tithes", amount: "25.00" },
        sameOriginRequest(),
      ),
    ).resolves.toEqual({ status: "FUND_UNAVAILABLE" });
    expect(store.fetchBodies).toHaveLength(0);
  });
});
