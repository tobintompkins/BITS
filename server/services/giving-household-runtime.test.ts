import { describe, expect, it } from "vitest";

import {
  consumeGivingHouseholdAuditFailure,
  givingHouseholdNow,
  runWithGivingHouseholdSeams,
} from "./giving-household-runtime";

describe("giving household runtime seams", () => {
  it("keeps audit failure and clock scoped to the async context", async () => {
    expect(consumeGivingHouseholdAuditFailure()).toBe(false);

    await runWithGivingHouseholdSeams({ failAudit: true, now: () => 1_700_000_000_000 }, async () => {
      expect(givingHouseholdNow()).toBe(1_700_000_000_000);
      expect(consumeGivingHouseholdAuditFailure()).toBe(true);
      expect(consumeGivingHouseholdAuditFailure()).toBe(false);
    });

    expect(consumeGivingHouseholdAuditFailure()).toBe(false);
    expect(givingHouseholdNow()).toBeGreaterThan(1_700_000_000_000);
  });
});
