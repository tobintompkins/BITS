import { describe, expect, it } from "vitest";

import {
  DUPLICATE_SCAN_MEMBER_CAP,
  runDuplicateScanJob,
} from "@/lib/members/duplicate-scan-runner";
import type { DuplicateScoreInput } from "@/lib/members/duplicate-scoring";

function member(
  id: string,
  overrides: Partial<DuplicateScoreInput> = {},
): DuplicateScoreInput {
  return {
    id,
    firstName: "Alex",
    lastName: "Rivera",
    preferredName: null,
    email: null,
    phone: null,
    alternatePhone: null,
    dateOfBirth: null,
    addressLine1: null,
    city: null,
    state: null,
    postalCode: null,
    recordStatus: "ACTIVE",
    householdIds: [],
    ...overrides,
  };
}

describe("runDuplicateScanJob", () => {
  it("scores shared-bucket pairs and skips existing", () => {
    const result = runDuplicateScanJob({
      members: [
        member("a", { email: "same@example.com" }),
        member("b", { email: "same@example.com", firstName: "Other" }),
      ],
      existingPairKeys: new Set(["a|b"]),
    });

    expect(result.created).toBe(0);
    expect(result.skippedExisting).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it("reports truncation when over member cap", () => {
    const members = Array.from({ length: 5 }, (_, i) =>
      member(String(i), { email: `u${i}@example.com` }),
    );
    const result = runDuplicateScanJob({
      members,
      existingPairKeys: new Set(),
      memberCap: 3,
    });

    expect(result.truncated).toBe(true);
    expect(result.membersScanned).toBe(3);
    expect(result.membersTotal).toBe(5);
    expect(result.message).toMatch(/limited/i);
    expect(DUPLICATE_SCAN_MEMBER_CAP).toBeGreaterThan(0);
  });
});
