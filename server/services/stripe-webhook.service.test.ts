import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

type WebhookRow = {
  id: string;
  organizationId: string;
  stripeEventId: string;
  eventType: string;
  stripeObjectId: string | null;
  livemode: boolean;
  status: "RECEIVED" | "PROCESSING" | "PROCESSED" | "IGNORED" | "FAILED";
  attemptCount: number;
  lastErrorCode: string | null;
  processedAt: Date | null;
};

type WebhookUpdate = {
  status?: WebhookRow["status"];
  lastErrorCode?: string | null;
  processedAt?: Date | null;
  attemptCount?: { increment: number };
};

const store = vi.hoisted(() => ({
  events: new Map<string, WebhookRow>(),
  donations: new Map<string, { id: string; isTest: boolean }>(),
  persistShouldFail: false,
}));

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  persistStripeTestDonation: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/server/services/stripe-test-giving.service", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/services/stripe-test-giving.service")
  >("@/server/services/stripe-test-giving.service");
  return {
    ...actual,
    persistStripeTestDonation: mocks.persistStripeTestDonation,
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    stripeWebhookEvent: {
      create: vi.fn(async ({ data }: { data: Omit<WebhookRow, "id" | "processedAt" | "lastErrorCode"> & { lastErrorCode?: string | null } }) => {
        if (store.events.has(data.stripeEventId)) {
          throw { code: "P2002" };
        }
        const row: WebhookRow = {
          id: `wh-${store.events.size + 1}`,
          lastErrorCode: data.lastErrorCode ?? null,
          processedAt: null,
          ...data,
        };
        store.events.set(data.stripeEventId, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { stripeEventId: string } }) => {
        return store.events.get(where.stripeEventId) ?? null;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { stripeEventId: string } }) => {
        const row = store.events.get(where.stripeEventId);
        if (!row) throw new Error("missing");
        return row;
      }),
      update: vi.fn(async ({
        where,
        data,
      }: {
        where: { stripeEventId: string };
        data: WebhookUpdate;
      }) => {
        const row = store.events.get(where.stripeEventId);
        if (!row) throw new Error("missing");
        if (data.attemptCount) {
          row.attemptCount += data.attemptCount.increment;
        }
        if (data.status) row.status = data.status;
        if ("lastErrorCode" in data) row.lastErrorCode = data.lastErrorCode ?? null;
        if ("processedAt" in data) row.processedAt = data.processedAt ?? null;
        store.events.set(where.stripeEventId, row);
        return row;
      }),
      updateMany: vi.fn(async ({
        where,
        data,
      }: {
        where: { stripeEventId: string; status: { in: WebhookRow["status"][] } };
        data: WebhookUpdate;
      }) => {
        const row = store.events.get(where.stripeEventId);
        if (!row || !where.status.in.includes(row.status)) {
          return { count: 0 };
        }
        if (data.attemptCount) {
          row.attemptCount += data.attemptCount.increment;
        }
        if (data.status) row.status = data.status;
        if ("lastErrorCode" in data) row.lastErrorCode = data.lastErrorCode ?? null;
        store.events.set(where.stripeEventId, row);
        return { count: 1 };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        stripeWebhookEvent: {
          update: async ({
            where,
            data,
          }: {
            where: { stripeEventId: string };
            data: Partial<WebhookRow>;
          }) => {
            const row = store.events.get(where.stripeEventId);
            if (!row) throw new Error("missing");
            Object.assign(row, data);
            store.events.set(where.stripeEventId, row);
            return row;
          },
        },
      });
    }),
  },
}));

import {
  claimStripeWebhookEvent,
  processVerifiedStripeWebhookEvent,
} from "./stripe-webhook.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";

function checkoutEvent(overrides: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: "evt_test_1",
    object: "event",
    api_version: "2026-02-25.acacia",
    created: 1_700_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_abc123",
        object: "checkout.session",
        livemode: false,
        amount_total: 2500,
        currency: "usd",
        payment_status: "paid",
        payment_intent: "pi_test_1",
        customer_details: { email: "donor@example.com" },
        metadata: { environment: "BITS_TEST", fund: "Tithes" },
      },
    },
    ...overrides,
  } as Stripe.Event;
}

describe("Stripe webhook processing", () => {
  beforeEach(() => {
    store.events.clear();
    store.donations.clear();
    store.persistShouldFail = false;
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
    mocks.persistStripeTestDonation.mockImplementation(async (checkout: { id: string }) => {
      if (store.persistShouldFail) {
        throw new Error("persist failed");
      }
      const existing = store.donations.get(checkout.id);
      if (existing) {
        return { donation: existing, alreadyRecorded: true };
      }
      const donation = { id: `don-${store.donations.size + 1}`, isTest: true };
      store.donations.set(checkout.id, donation);
      return { donation, alreadyRecorded: false };
    });
  });

  it("processes a paid test checkout once", async () => {
    const result = await processVerifiedStripeWebhookEvent(checkoutEvent());
    expect(result).toEqual({ httpStatus: 200, received: true });
    expect(store.donations.size).toBe(1);
    expect(store.events.get("evt_test_1")?.status).toBe("PROCESSED");
    expect(store.events.get("evt_test_1")?.lastErrorCode).toBeNull();
  });

  it("returns 200 without repeating side effects for an already processed event", async () => {
    await processVerifiedStripeWebhookEvent(checkoutEvent());
    const again = await processVerifiedStripeWebhookEvent(checkoutEvent());
    expect(again).toEqual({ httpStatus: 200, received: true });
    expect(store.donations.size).toBe(1);
    expect(mocks.persistStripeTestDonation).toHaveBeenCalledTimes(1);
  });

  it("creates one donation for sequential duplicate deliveries", async () => {
    await processVerifiedStripeWebhookEvent(checkoutEvent());
    await processVerifiedStripeWebhookEvent(checkoutEvent());
    expect(store.donations.size).toBe(1);
  });

  it("creates one donation for concurrent duplicate deliveries", async () => {
    const event = checkoutEvent();
    const [first, second] = await Promise.all([
      processVerifiedStripeWebhookEvent(event),
      processVerifiedStripeWebhookEvent(event),
    ]);
    expect(first.httpStatus).toBe(200);
    expect(second.httpStatus).toBe(200);
    expect(store.donations.size).toBe(1);
  });

  it("can retry after a processing failure", async () => {
    store.persistShouldFail = true;
    const failed = await processVerifiedStripeWebhookEvent(checkoutEvent());
    expect(failed.httpStatus).toBe(500);
    expect(store.events.get("evt_test_1")?.status).toBe("FAILED");
    expect(store.events.get("evt_test_1")?.lastErrorCode).toBe(
      "DONATION_PERSISTENCE_FAILED",
    );
    expect(store.donations.size).toBe(0);

    store.persistShouldFail = false;
    const retried = await processVerifiedStripeWebhookEvent(checkoutEvent());
    expect(retried).toEqual({ httpStatus: 200, received: true });
    expect(store.donations.size).toBe(1);
    expect(store.events.get("evt_test_1")?.status).toBe("PROCESSED");
    expect(store.events.get("evt_test_1")?.attemptCount).toBe(2);
  });

  it("marks unsupported signed event types IGNORED", async () => {
    const result = await processVerifiedStripeWebhookEvent(
      checkoutEvent({ type: "charge.succeeded" }),
    );
    expect(result).toEqual({ httpStatus: 200, received: true });
    expect(store.events.get("evt_test_1")?.status).toBe("IGNORED");
    expect(store.events.get("evt_test_1")?.lastErrorCode).toBe("UNSUPPORTED_EVENT");
    expect(store.donations.size).toBe(0);
  });

  it("ignores unpaid, non-USD, invalid amount, live, and non-test events", async () => {
    const cases = [
      {
        id: "evt_unpaid",
        object: { payment_status: "unpaid" },
        error: "UNPAID_SESSION",
      },
      {
        id: "evt_eur",
        object: { currency: "eur" },
        error: "INVALID_CURRENCY",
      },
      {
        id: "evt_zero",
        object: { amount_total: 0 },
        error: "INVALID_AMOUNT",
      },
      {
        id: "evt_live",
        livemode: true,
        object: { livemode: true },
        error: "LIVE_MODE_REJECTED",
      },
      {
        id: "evt_env",
        object: { metadata: { fund: "Tithes" } },
        error: "MISSING_TEST_ENVIRONMENT",
      },
    ];

    for (const testCase of cases) {
      const base = checkoutEvent({ id: testCase.id, livemode: testCase.livemode ?? false });
      const object = {
        ...(base.data.object as unknown as Record<string, unknown>),
        ...testCase.object,
      };
      await processVerifiedStripeWebhookEvent({
        ...base,
        data: { object },
      } as Stripe.Event);
      expect(store.events.get(testCase.id)?.status).toBe("IGNORED");
      expect(store.events.get(testCase.id)?.lastErrorCode).toBe(testCase.error);
    }
    expect(store.donations.size).toBe(0);
  });

  it("does not store raw payloads, secrets, card data, or sensitive errors", async () => {
    store.persistShouldFail = true;
    await processVerifiedStripeWebhookEvent(checkoutEvent());
    const row = store.events.get("evt_test_1");
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toMatch(
      /whsec_|sk_test_|card number|raw payload|persist failed/i,
    );
    expect(row?.lastErrorCode).toBe("DONATION_PERSISTENCE_FAILED");
  });

  it("claims an event ID with the unique constraint", async () => {
    const first = await claimStripeWebhookEvent({
      organizationId: ORG_ID,
      stripeEventId: "evt_claim",
      eventType: "checkout.session.completed",
      stripeObjectId: "cs_test_abc123",
      livemode: false,
    });
    const second = await claimStripeWebhookEvent({
      organizationId: ORG_ID,
      stripeEventId: "evt_claim",
      eventType: "checkout.session.completed",
      stripeObjectId: "cs_test_abc123",
      livemode: false,
    });
    expect(first.outcome).toBe("CLAIMED");
    expect(second.outcome).toBe("IN_FLIGHT");
    expect(store.events.size).toBe(1);
  });
});
