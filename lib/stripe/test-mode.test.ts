import { afterEach, describe, expect, it } from "vitest";

import { getStripeTestSecret, getStripeWebhookSecret } from "./test-mode";

const originalSecret = process.env.STRIPE_SECRET_KEY;
const originalWebhook = process.env.STRIPE_WEBHOOK_SECRET;

afterEach(() => {
  process.env.STRIPE_SECRET_KEY = originalSecret;
  process.env.STRIPE_WEBHOOK_SECRET = originalWebhook;
});

describe("Stripe test-mode configuration", () => {
  it("rejects live and placeholder secret keys", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_example";
    expect(getStripeTestSecret()).toBeNull();
    process.env.STRIPE_SECRET_KEY = "sk_test_...";
    expect(getStripeTestSecret()).toBeNull();
  });

  it("accepts only a non-placeholder whsec_ webhook secret", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "";
    expect(getStripeWebhookSecret()).toBeNull();
    process.env.STRIPE_WEBHOOK_SECRET = "not-a-secret";
    expect(getStripeWebhookSecret()).toBeNull();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_placeholder";
    expect(getStripeWebhookSecret()).toBeNull();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_...";
    expect(getStripeWebhookSecret()).toBeNull();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_bits_local_webhook_secret";
    expect(getStripeWebhookSecret()).toBe(
      "whsec_test_bits_local_webhook_secret",
    );
  });
});
