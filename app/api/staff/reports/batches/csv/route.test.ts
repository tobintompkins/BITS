import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  exportCsv: vi.fn(),
}));

vi.mock("@/server/services/batch-reconciliation-report.service", () => ({
  BatchReconciliationReportError: class BatchReconciliationReportError extends Error {},
  exportBatchReconciliationReportCsv: m.exportCsv,
}));

import { GET } from "./route";
import { BatchReconciliationReportError } from "@/server/services/batch-reconciliation-report.service";

describe("batch reconciliation CSV route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a private CSV with a safe filename", async () => {
    m.exportCsv.mockResolvedValue({
      csv: "Batch name,Calculated gift total\nSunday,20.00",
      filename: "batch-reconciliation-2026-01-01-to-2026-12-31.csv",
    });
    const response = await GET(
      new Request("http://localhost/api/staff/reports/batches/csv"),
    );
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="batch-reconciliation-2026-01-01-to-2026-12-31.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toContain("20.00");
  });

  it("denies export when the service rejects authorization or audit", async () => {
    m.exportCsv.mockRejectedValue(
      new BatchReconciliationReportError(
        "You do not have permission to view the batch reconciliation report.",
      ),
    );
    const denied = await GET(
      new Request("http://localhost/api/staff/reports/batches/csv"),
    );
    expect(denied.status).toBe(403);
    m.exportCsv.mockRejectedValue(
      new BatchReconciliationReportError(
        "The export could not be audited, so it was not released.",
      ),
    );
    const audited = await GET(
      new Request("http://localhost/api/staff/reports/batches/csv"),
    );
    expect(audited.status).toBe(400);
  });
});
