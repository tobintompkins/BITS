import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  exportCsv: vi.fn(),
}));

vi.mock("@/server/services/contribution-report.service", () => ({
  ContributionReportError: class ContributionReportError extends Error {},
  exportContributionReportCsv: m.exportCsv,
}));

import { GET } from "./route";
import { ContributionReportError } from "@/server/services/contribution-report.service";

describe("contribution report CSV route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a private CSV with a safe filename", async () => {
    m.exportCsv.mockResolvedValue({
      csv: "Donor,Gift total\nAdams,10.00",
      filename: "contribution-detail-2026-01-01-to-2026-12-31.csv",
    });
    const response = await GET(
      new Request("http://localhost/api/staff/reports/contributions/csv?view=detail"),
    );
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="contribution-detail-2026-01-01-to-2026-12-31.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toContain("10.00");
  });

  it("denies export when the service rejects authorization or audit", async () => {
    m.exportCsv.mockRejectedValue(
      new ContributionReportError("You do not have permission to view church-wide contribution reports."),
    );
    const denied = await GET(
      new Request("http://localhost/api/staff/reports/contributions/csv"),
    );
    expect(denied.status).toBe(403);
    m.exportCsv.mockRejectedValue(
      new ContributionReportError("The export could not be audited, so it was not released."),
    );
    const audited = await GET(
      new Request("http://localhost/api/staff/reports/contributions/csv"),
    );
    expect(audited.status).toBe(400);
    expect(await audited.json()).toMatchObject({
      error: "The export could not be audited, so it was not released.",
    });
  });
});
