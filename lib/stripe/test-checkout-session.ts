import { createHash } from "node:crypto";

const STRIPE_CHECKOUT_HOST = "checkout.stripe.com";

export function isStripeHostedCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === STRIPE_CHECKOUT_HOST;
  } catch {
    return false;
  }
}

export function hashCheckoutBinding(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildStripeTestCheckoutBody(input: {
  amountCents: number;
  fund: string;
  receiptEmail: string;
  attributionId: string;
  successUrl: string;
  cancelUrl: string;
  description: string;
}) {
  return new URLSearchParams({
    mode: "payment",
    customer_email: input.receiptEmail,
    "payment_intent_data[receipt_email]": input.receiptEmail,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(input.amountCents),
    "line_items[0][price_data][product_data][name]": input.fund,
    "line_items[0][price_data][product_data][description]": input.description,
    "metadata[environment]": "BITS_TEST",
    "metadata[fund]": input.fund,
    "metadata[bits_attribution_id]": input.attributionId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}
