import { describe, expect, it } from "vitest";

import { offeringBatchTransitionSchema } from "./offering-batch-transition";

describe("offering batch transition validation", () => {
  it("requires explicit confirmation", () => {
    expect(offeringBatchTransitionSchema.safeParse({ confirmed: true }).success).toBe(
      true,
    );
    expect(offeringBatchTransitionSchema.safeParse({ confirmed: false }).success).toBe(
      false,
    );
    expect(offeringBatchTransitionSchema.safeParse({}).success).toBe(false);
  });
});
