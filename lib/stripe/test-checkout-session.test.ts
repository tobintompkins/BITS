import { describe, expect, it } from "vitest";

import { buildStripeTestCheckoutBody, hashCheckoutBinding } from "./test-checkout-session";

describe("Stripe test checkout body", () => {
  it("puts the receipt address on the payment intent and keeps donor identity out of metadata", () => {
    const body = buildStripeTestCheckoutBody({
      amountCents: 2500,
      fund: "Tithes",
      receiptEmail: "guest@example.com",
      attributionId: "00000000-0000-4000-8000-00000000e001",
      successUrl: "https://example.test/give/success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://example.test/give?cancelled=1",
      description: "Test gift",
    }).toString();
    const decoded = decodeURIComponent(body);
    expect(decoded).toContain("payment_intent_data[receipt_email]=guest@example.com");
    expect(decoded).not.toMatch(/(^|&)receipt_email=/);
    expect(decoded).toContain("metadata[bits_attribution_id]=00000000-0000-4000-8000-00000000e001");
    expect(decoded).not.toContain("metadata[bits_donor_id]");
    expect(decoded).not.toContain("metadata[donor_name]");
    expect(decoded).toContain("metadata[environment]=BITS_TEST");
    expect(hashCheckoutBinding("same")).toBe(hashCheckoutBinding("same"));
    expect(hashCheckoutBinding("same")).not.toBe("same");
  });
});
