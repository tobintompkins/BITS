import { describe, expect, it } from "vitest";

import {
  batchReconciliationFilename,
  parseBatchReconciliationFilters,
  parseBatchReconciliationStatus,
} from "./batch-reconciliation-report";

describe("batch reconciliation filters", () => {
  it("rejects an invalid status and builds a safe filename", () => {
    expect(() => parseBatchReconciliationStatus("OPEN")).toThrow("status");
    expect(parseBatchReconciliationStatus("LOCKED")).toBe("LOCKED");
    expect(
      batchReconciliationFilename({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    ).toBe("batch-reconciliation-2026-01-01-to-2026-12-31.csv");
  });

  it("uses an exclusive next-day offering-date boundary", () => {
    const filters = parseBatchReconciliationFilters(
      { startDate: "2026-01-01", endDate: "2026-01-31" },
      "America/New_York",
    );
    expect(filters.endExclusive.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });
});
