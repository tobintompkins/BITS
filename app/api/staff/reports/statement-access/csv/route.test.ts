import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  exportCsv: vi.fn(),
}));

vi.mock("@/server/services/statement-access-report.service", () => ({
  StatementAccessReportError: class StatementAccessReportError extends Error {},
  exportStatementAccessReportCsv: m.exportCsv,
}));

import { GET } from "./route";
import { StatementAccessReportError } from "@/server/services/statement-access-report.service";

describe("statement access CSV route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a private CSV with a safe filename", async () => {
    m.exportCsv.mockResolvedValue({
      csv: "Statement identifier,Action\nSTMT-100,Downloaded",
      filename: "statement-access-2026-03-08-to-2026-03-08.csv",
    });
    const response = await GET(
      new Request("http://localhost/api/staff/reports/statement-access/csv"),
    );
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="statement-access-2026-03-08-to-2026-03-08.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("denies report viewers and audit failures", async () => {
    m.exportCsv.mockRejectedValue(
      new StatementAccessReportError(
        "You do not have permission to view the statement access report.",
      ),
    );
    const denied = await GET(
      new Request("http://localhost/api/staff/reports/statement-access/csv"),
    );
    expect(denied.status).toBe(403);
    m.exportCsv.mockRejectedValue(
      new StatementAccessReportError(
        "The export could not be audited, so it was not released.",
      ),
    );
    const audited = await GET(
      new Request("http://localhost/api/staff/reports/statement-access/csv"),
    );
    expect(audited.status).toBe(400);
  });
});
