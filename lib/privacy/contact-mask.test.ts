import { describe, expect, it } from "vitest";

import {
  maskEmail,
  maskPhone,
  parseStripeGiftAttribution,
  shortenStripeCheckoutSessionId,
} from "./contact-mask";

describe("contact masking", () => {
  it("masks email and phone without exposing full values", () => {
    expect(maskEmail("donor@example.com")).toBe("d***@example.com");
    expect(maskPhone("(207) 555-1234")).toBe("***-***-1234");
  });

  it("shortens Stripe checkout session IDs", () => {
    expect(shortenStripeCheckoutSessionId("cs_test_abcdefghijklmnopqrstuvwxyz")).toBe(
      "cs_test_…wxyz",
    );
  });

  it("parses Stripe gift attribution from the stored note", () => {
    expect(
      parseStripeGiftAttribution(
        "Stripe sandbox test gift · Test Donor · donor@example.com",
      ),
    ).toEqual({
      donorName: "Test Donor",
      donorEmail: "donor@example.com",
    });
  });
});
