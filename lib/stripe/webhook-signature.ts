import Stripe from "stripe";

import { getStripeTestSecret, getStripeWebhookSecret } from "@/lib/stripe/test-mode";

/**
 * Official Stripe SDK verification. The API key is unused for constructEvent
 * and remains test-only so this helper cannot talk to live Stripe.
 */
export function createStripeSdk() {
  return new Stripe(getStripeTestSecret() ?? "sk_test_unused_for_webhook_verification");
}

export function verifyStripeWebhookSignature(rawBody: string, signature: string) {
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    return { ok: false as const, errorCode: "WEBHOOK_SECRET_MISSING" };
  }
  if (!signature.trim()) {
    return { ok: false as const, errorCode: "INVALID_SIGNATURE" };
  }

  try {
    const stripe = createStripeSdk();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    return { ok: true as const, event };
  } catch {
    return { ok: false as const, errorCode: "INVALID_SIGNATURE" };
  }
}
