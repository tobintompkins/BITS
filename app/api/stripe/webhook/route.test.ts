import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const mocks = vi.hoisted(() => ({
  processVerifiedStripeWebhookEvent: vi.fn(),
}));

vi.mock("@/server/services/stripe-webhook.service", () => ({
  processVerifiedStripeWebhookEvent: mocks.processVerifiedStripeWebhookEvent,
}));

import { POST } from "@/app/api/stripe/webhook/route";

const WEBHOOK_SECRET = "whsec_test_bits_local_webhook_secret";
const originalWebhook = process.env.STRIPE_WEBHOOK_SECRET;

function paidEvent() {
  return {
    id: "evt_test_route",
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
        payment_status: "paid",
        amount_total: 2500,
        currency: "usd",
        metadata: { environment: "BITS_TEST", fund: "Tithes" },
      },
    },
  };
}

function signedRequest(payload: string, signature?: string) {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body: payload,
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    mocks.processVerifiedStripeWebhookEvent.mockResolvedValue({
      httpStatus: 200,
      received: true,
    });
  });

  afterEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = originalWebhook;
  });

  it("returns 400 when Stripe-Signature is missing", async () => {
    const response = await POST(signedRequest(JSON.stringify(paidEvent())));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid signature." });
    expect(mocks.processVerifiedStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when the webhook secret is missing", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "";
    const payload = JSON.stringify(paidEvent());
    const response = await POST(
      signedRequest(payload, "t=1,v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    );
    expect(response.status).toBe(400);
    expect(mocks.processVerifiedStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 400 for a modified payload", async () => {
    const payload = JSON.stringify(paidEvent());
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    const response = await POST(signedRequest(`${payload} `, signature));
    expect(response.status).toBe(400);
    expect(mocks.processVerifiedStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("processes a valid signed checkout.session.completed event", async () => {
    const payload = JSON.stringify(paidEvent());
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    const response = await POST(signedRequest(payload, signature));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.processVerifiedStripeWebhookEvent).toHaveBeenCalledTimes(1);
    const event = mocks.processVerifiedStripeWebhookEvent.mock.calls[0]?.[0];
    expect(event.id).toBe("evt_test_route");
    expect(event.type).toBe("checkout.session.completed");
  });
});
