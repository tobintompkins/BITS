import { describe, expect, it } from "vitest";

import {
  parseStatementAccessAction,
  parseStatementAccessFilters,
  statementAccessFilename,
} from "./statement-access-report";

describe("statement access filters", () => {
  it("rejects an unsupported action and builds a safe filename", () => {
    expect(() => parseStatementAccessAction("READ")).toThrow("action");
    expect(parseStatementAccessAction("DOWNLOADED")).toBe("DOWNLOADED");
    expect(
      statementAccessFilename({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    ).toBe("statement-access-2026-01-01-to-2026-12-31.csv");
  });

  it("uses church-timezone timestamp boundaries, not UTC date-only midnight", () => {
    const filters = parseStatementAccessFilters(
      { startDate: "2026-03-08", endDate: "2026-03-08" },
      "America/New_York",
    );
    expect(filters.startUtc.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(filters.endExclusiveUtc.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(filters.timeZone).toBe("America/New_York");
  });
});
