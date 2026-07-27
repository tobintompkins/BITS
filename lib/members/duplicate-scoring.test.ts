import { describe, expect, it } from "vitest";

import {
  collectBucketedPairIds,
  emailBucketKey,
  lastNameBucketKey,
  nameInitialBucketKey,
  normalizeEmail,
  normalizePhone,
  orderMemberPairIds,
  phoneBucketKey,
  scoreMemberPair,
  type DuplicateScoreInput,
} from "@/lib/members/duplicate-scoring";

function member(overrides: Partial<DuplicateScoreInput> = {}): DuplicateScoreInput {
  return {
    id: "a",
    firstName: "Alex",
    lastName: "Rivera",
    preferredName: null,
    email: "alex@example.com",
    phone: "(615) 555-0101",
    alternatePhone: null,
    dateOfBirth: new Date("1990-01-15"),
    addressLine1: "100 Main St",
    city: "Nashville",
    state: "TN",
    postalCode: "37203",
    recordStatus: "ACTIVE",
    householdIds: [],
    ...overrides,
  };
}

describe("duplicate scoring", () => {
  it("scores exact email matches very high", () => {
    const result = scoreMemberPair(
      member({ id: "1" }),
      member({ id: "2", firstName: "Different", lastName: "Person" }),
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.reasons).toContain("Exact email match");
  });

  it("does not over-score name-only matches", () => {
    const result = scoreMemberPair(
      member({
        id: "1",
        email: "one@example.com",
        phone: "111",
        dateOfBirth: null,
        addressLine1: null,
      }),
      member({
        id: "2",
        email: "two@example.com",
        phone: "222",
        dateOfBirth: null,
        addressLine1: null,
      }),
    );
    expect(result.score).toBeLessThan(50);
    expect(result.reasons).toContain("Exact first and last name match");
  });

  it("normalizes email and phone", () => {
    expect(normalizeEmail("  Alex@Example.COM ")).toBe("alex@example.com");
    expect(normalizePhone("(615) 555-0101")).toBe("6155550101");
  });

  it("orders member pair ids deterministically", () => {
    expect(orderMemberPairIds("b", "a")).toEqual(["a", "b"]);
  });

  it("builds email, phone, and name bucket keys", () => {
    expect(emailBucketKey("  Alex@Example.COM ")).toBe("email:alex@example.com");
    expect(phoneBucketKey("(615) 555-0101")).toBe("phone:6155550101");
    expect(nameInitialBucketKey("Alex", "Rivera")).toBe("name:rivera|a");
    expect(lastNameBucketKey("Rivera")).toBe("lastname:rivera");
    expect(emailBucketKey(null)).toBeNull();
    expect(phoneBucketKey("")).toBeNull();
  });

  it("collects pairs only from shared buckets", () => {
    const pairs = collectBucketedPairIds([
      {
        id: "1",
        firstName: "Alex",
        lastName: "Rivera",
        email: "shared@example.com",
        phone: null,
        alternatePhone: null,
      },
      {
        id: "2",
        firstName: "Sam",
        lastName: "Other",
        email: "shared@example.com",
        phone: null,
        alternatePhone: null,
      },
      {
        id: "3",
        firstName: "Pat",
        lastName: "Unrelated",
        email: "other@example.com",
        phone: "999",
        alternatePhone: null,
      },
    ]);

    expect(pairs).toEqual([["1", "2"]]);
  });
});
