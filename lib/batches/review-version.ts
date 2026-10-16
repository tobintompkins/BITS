export const STALE_BATCH_REVIEW_MESSAGE =
  "This batch changed since you opened it. Refresh and review again.";

export function reviewVersionIncrement() {
  return { increment: 1 } as const;
}

export function parseExpectedReviewVersion(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 1) return parsed;
  }
  return null;
}

export function reviewVersionMatches(
  current: number,
  expected: number | null | undefined,
) {
  return Number.isInteger(expected) && current === expected;
}
