import { describe, expect, it } from "vitest";

import {
  offeringBatchTransitionSchema,
  transitionSnapshotMatches,
} from "./offering-batch-transition";

const snapshot = {
  confirmed: true as const,
  recordedTotal: "25.00",
  expectedTotal: "25.00",
  donationCount: 1,
};

describe("offering batch transition validation", () => {
  it("requires explicit confirmation and the reviewed snapshot", () => {
    expect(offeringBatchTransitionSchema.safeParse(snapshot).success).toBe(true);
    expect(
      offeringBatchTransitionSchema.safeParse({ confirmed: true }).success,
    ).toBe(false);
    expect(
      offeringBatchTransitionSchema.safeParse({ confirmed: false }).success,
    ).toBe(false);
    expect(offeringBatchTransitionSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a confirmation that no longer matches the current totals", () => {
    expect(
      transitionSnapshotMatches(snapshot, {
        recordedTotal: "30.00",
        expectedTotal: "25.00",
        donationCount: 1,
      }),
    ).toBe(false);
    expect(
      transitionSnapshotMatches(snapshot, {
        recordedTotal: "25.00",
        expectedTotal: "25.00",
        donationCount: 2,
      }),
    ).toBe(false);
    expect(
      transitionSnapshotMatches(
        { ...snapshot, expectedTotal: null },
        { recordedTotal: "25.00", expectedTotal: null, donationCount: 1 },
      ),
    ).toBe(true);
  });
});
