import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  donationFindUnique: vi.fn(),
  donationCreate: vi.fn(),
  donorFindFirst: vi.fn(),
  offeringTypeUpsert: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    donation: {
      findUnique: mocks.donationFindUnique,
      create: mocks.donationCreate,
    },
    donor: { findFirst: mocks.donorFindFirst },
    offeringType: { upsert: mocks.offeringTypeUpsert },
  },
}));

import {
  persistStripeTestDonation,
  validateStripeTestCheckoutSession,
} from "./stripe-test-giving.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";

function paidCheckout() {
  return {
    id: "cs_test_abc123",
    livemode: false,
    created: 1_700_000_000,
    amount_total: 2500,
    currency: "usd",
    payment_status: "paid",
    payment_intent: "pi_test_1",
    customer_details: { email: "Donor@Example.com", name: "Test Donor" },
    metadata: { environment: "BITS_TEST", fund: "Tithes" },
  };
}

describe("validateStripeTestCheckoutSession", () => {
  it("rejects unpaid, non-USD, zero, live, and non-test sessions", () => {
    expect(
      validateStripeTestCheckoutSession({
        ...paidCheckout(),
        payment_status: "unpaid",
      }).ok,
    ).toBe(false);
    expect(
      validateStripeTestCheckoutSession({
        ...paidCheckout(),
        currency: "eur",
      }),
    ).toEqual({ ok: false, errorCode: "INVALID_CURRENCY" });
    expect(
      validateStripeTestCheckoutSession({
        ...paidCheckout(),
        amount_total: 0,
      }),
    ).toEqual({ ok: false, errorCode: "INVALID_AMOUNT" });
    expect(
      validateStripeTestCheckoutSession({
        ...paidCheckout(),
        livemode: true,
      }),
    ).toEqual({ ok: false, errorCode: "LIVE_MODE_REJECTED" });
    expect(
      validateStripeTestCheckoutSession({
        ...paidCheckout(),
        metadata: { fund: "Tithes" },
      }),
    ).toEqual({ ok: false, errorCode: "MISSING_TEST_ENVIRONMENT" });
  });
});

describe("persistStripeTestDonation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.offeringTypeUpsert.mockResolvedValue({ id: "fund-1" });
    mocks.donorFindFirst.mockResolvedValue(null);
    mocks.donationFindUnique.mockResolvedValue(null);
    mocks.donationCreate.mockResolvedValue({
      id: "don-1",
      stripeCheckoutSessionId: "cs_test_abc123",
      isTest: true,
      allocations: [],
    });
  });

  it("stores a test donation once and matches donors only in the current organization", async () => {
    const validated = validateStripeTestCheckoutSession(paidCheckout());
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const first = await persistStripeTestDonation(validated.checkout, ORG_ID);
    expect(first.alreadyRecorded).toBe(false);
    expect(first.donation.isTest).toBe(true);
    expect(mocks.donorFindFirst).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_ID,
        email: { equals: "donor@example.com", mode: "insensitive" },
        active: true,
      },
      select: { id: true },
    });
    expect(mocks.donorFindFirst.mock.calls[0]?.[0].where.organizationId).not.toBe(
      OTHER_ORG,
    );
    expect(mocks.donationCreate.mock.calls[0]?.[0].data).toMatchObject({
      organizationId: ORG_ID,
      isTest: true,
      stripeCheckoutSessionId: "cs_test_abc123",
    });
    expect(JSON.stringify(mocks.donationCreate.mock.calls[0]?.[0])).not.toMatch(
      /whsec_|sk_test_|card number|raw payload|4242/i,
    );

    mocks.donationFindUnique.mockResolvedValue(first.donation);
    const second = await persistStripeTestDonation(validated.checkout, ORG_ID);
    expect(second.alreadyRecorded).toBe(true);
    expect(mocks.donationCreate).toHaveBeenCalledTimes(1);
  });

  it("uses the unique checkout session constraint when two writers race", async () => {
    const validated = validateStripeTestCheckoutSession(paidCheckout());
    if (!validated.ok) return;
    const existing = {
      id: "don-1",
      stripeCheckoutSessionId: "cs_test_abc123",
      isTest: true,
      allocations: [],
    };
    mocks.donationFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    mocks.donationCreate.mockRejectedValueOnce({ code: "P2002" });

    const result = await persistStripeTestDonation(validated.checkout, ORG_ID);
    expect(result).toEqual({ donation: existing, alreadyRecorded: true });
  });
});
