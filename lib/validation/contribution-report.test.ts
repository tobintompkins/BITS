import { describe, expect, it } from "vitest";

import {
  CONTRIBUTION_REPORT_MAX_RANGE_DAYS,
  contributionReportFilename,
  daysInclusive,
  exclusiveEndDate,
  parseContributionReportView,
} from "./contribution-report";
import { parseDateOnly } from "./giving-household";

describe("contribution report filters", () => {
  it("uses an exclusive next-day boundary for an inclusive end date", () => {
    expect(exclusiveEndDate(parseDateOnly("2026-12-31")!).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    expect(daysInclusive(parseDateOnly("2026-01-01")!, parseDateOnly("2026-12-31")!)).toBe(
      365,
    );
    expect(CONTRIBUTION_REPORT_MAX_RANGE_DAYS).toBe(366);
  });

  it("builds a safe filename without user-supplied path characters", () => {
    expect(
      contributionReportFilename({
        view: "detail",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        includeTest: true,
      }),
    ).toBe("contribution-detail-2026-01-01-to-2026-12-31-TEST.csv");
    expect(parseContributionReportView("household")).toBe("household");
    expect(parseContributionReportView("../x")).toBe("detail");
  });
});
