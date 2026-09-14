import { describe, expect, it } from "vitest";

import { offeringBatchDepositWriteSchema } from "./offering-batch-deposit";

describe("offering batch deposit validation", () => {
  it("accepts a safe deposit-slip reference and date", () => {
    const parsed = offeringBatchDepositWriteSchema.safeParse({
      depositDate: "2026-09-10",
      depositReference: "  SLIP-1001  ",
      recordedTotal: "9999.00",
      organizationId: "client-org",
      status: "LOCKED",
      depositedAmount: "9999.00",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        depositDate: "2026-09-10",
        depositReference: "SLIP-1001",
      });
    }
  });

  it("normalizes a blank reference to null and then rejects it", () => {
    const parsed = offeringBatchDepositWriteSchema.safeParse({
      depositDate: "2026-09-10",
      depositReference: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects bank-account language and invalid references", () => {
    expect(
      offeringBatchDepositWriteSchema.safeParse({
        depositDate: "2026-09-10",
        depositReference: "routing 021000021",
      }).success,
    ).toBe(false);
    expect(
      offeringBatchDepositWriteSchema.safeParse({
        depositDate: "2026-09-10",
        depositReference: "account 123456789012",
      }).success,
    ).toBe(false);
    expect(
      offeringBatchDepositWriteSchema.safeParse({
        depositDate: "09/10/2026",
        depositReference: "SLIP-1001",
      }).success,
    ).toBe(false);
  });
});
