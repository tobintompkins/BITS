import { describe, expect, it } from "vitest";

import {
  parseStatementReadinessYear,
  statementYearDateRange,
} from "./statement-readiness";

const NOW = new Date("2026-09-11T16:00:00.000Z");

describe("statement readiness year parsing", () => {
  it("defaults to the current calendar year", () => {
    expect(parseStatementReadinessYear(undefined, NOW)).toBe(2026);
    expect(parseStatementReadinessYear("", NOW)).toBe(2026);
    expect(parseStatementReadinessYear("abc", NOW)).toBe(2026);
    expect(parseStatementReadinessYear("2010", NOW)).toBe(2026);
    expect(parseStatementReadinessYear("2028", NOW)).toBe(2026);
  });

  it("accepts the allowed year range", () => {
    expect(parseStatementReadinessYear("2016", NOW)).toBe(2016);
    expect(parseStatementReadinessYear("2026", NOW)).toBe(2026);
    expect(parseStatementReadinessYear("2027", NOW)).toBe(2027);
    expect(parseStatementReadinessYear(["2025"], NOW)).toBe(2025);
  });

  it("uses January 1 inclusive through next January 1 exclusive", () => {
    expect(statementYearDateRange(2026)).toEqual({
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2027-01-01T00:00:00.000Z"),
    });
  });
});
