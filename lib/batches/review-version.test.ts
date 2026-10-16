import { describe, expect, it } from "vitest";

import {
  parseExpectedReviewVersion,
  reviewVersionMatches,
} from "./review-version";

describe("review version helpers", () => {
  it("accepts integer versions of 1 or higher", () => {
    expect(parseExpectedReviewVersion(1)).toBe(1);
    expect(parseExpectedReviewVersion("3")).toBe(3);
    expect(parseExpectedReviewVersion(0)).toBeNull();
    expect(parseExpectedReviewVersion("1.5")).toBeNull();
    expect(parseExpectedReviewVersion("")).toBeNull();
  });

  it("matches only the exact current revision", () => {
    expect(reviewVersionMatches(2, 2)).toBe(true);
    expect(reviewVersionMatches(2, 1)).toBe(false);
    expect(reviewVersionMatches(2, null)).toBe(false);
  });
});
