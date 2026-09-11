import { describe, expect, it } from "vitest";

import {
  isAllowedStripeDonationAmountCents,
  isAllowedStripeDonationFund,
  stripeDonationSchema,
} from "./stripe-donation";

const valid = {
  firstName: "Test",
  lastName: "Donor",
  email: "test@example.com",
  fund: "Tithes",
  amount: "25.50",
};

describe("Stripe test donation validation", () => {
  it("converts dollars to cents", () => {
    expect(stripeDonationSchema.parse(valid).amount).toBe(2550);
  });

  it("rejects invalid funds", () => {
    expect(
      stripeDonationSchema.safeParse({ ...valid, fund: "Unknown" }).success,
    ).toBe(false);
  });

  it("exports the same fund and amount limits used by webhook processing", () => {
    expect(isAllowedStripeDonationFund("Tithes")).toBe(true);
    expect(isAllowedStripeDonationFund("Unknown")).toBe(false);
    expect(isAllowedStripeDonationAmountCents(100)).toBe(true);
    expect(isAllowedStripeDonationAmountCents(0)).toBe(false);
    expect(isAllowedStripeDonationAmountCents(5_000_001)).toBe(false);
  });

  it("enforces the minimum and maximum amount", () => {
    expect(
      stripeDonationSchema.safeParse({ ...valid, amount: "0.50" }).success,
    ).toBe(false);
    expect(
      stripeDonationSchema.safeParse({ ...valid, amount: "50001" }).success,
    ).toBe(false);
  });
});
