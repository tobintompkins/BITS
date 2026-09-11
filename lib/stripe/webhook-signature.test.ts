import { afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

import { verifyStripeWebhookSignature } from "./webhook-signature";

const WEBHOOK_SECRET = "whsec_test_bits_local_webhook_secret";
const originalWebhook = process.env.STRIPE_WEBHOOK_SECRET;

function paidSessionEvent() {
  return {
    id: "evt_test_signature_1",
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
        metadata: { environment: "BITS_TEST", fund: "Tithes" },
      },
    },
  };
}

afterEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = originalWebhook;
  vi.restoreAllMocks();
});

describe("verifyStripeWebhookSignature", () => {
  it("fails safely when the webhook secret is missing or invalid", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "";
    expect(
      verifyStripeWebhookSignature("{}", "t=1,v1=abc"),
    ).toEqual({ ok: false, errorCode: "WEBHOOK_SECRET_MISSING" });
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_placeholder";
    expect(
      verifyStripeWebhookSignature("{}", "t=1,v1=abc"),
    ).toEqual({ ok: false, errorCode: "WEBHOOK_SECRET_MISSING" });
  });

  it("uses stripe.webhooks.constructEvent with the unmodified raw body", () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const payload = JSON.stringify(paidSessionEvent());
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    const constructEvent = vi.spyOn(Stripe.webhooks, "constructEvent");

    const result = verifyStripeWebhookSignature(payload, signature);
    expect(result.ok).toBe(true);
    expect(constructEvent).toHaveBeenCalledWith(
      payload,
      signature,
      WEBHOOK_SECRET,
    );
  });

  it("rejects a modified payload after a valid signature was generated", () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const payload = JSON.stringify(paidSessionEvent());
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    const result = verifyStripeWebhookSignature(`${payload} `, signature);
    expect(result).toEqual({ ok: false, errorCode: "INVALID_SIGNATURE" });
  });

  it("accepts a valid signed checkout.session.completed event", () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const event = paidSessionEvent();
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    const result = verifyStripeWebhookSignature(payload, signature);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.id).toBe(event.id);
      expect(result.event.type).toBe("checkout.session.completed");
    }
  });
});
