import { describe, expect, it } from "vitest";

import {
  buildContributionCsv,
  sanitizeContributionCsvText,
} from "./contribution-csv";

describe("contribution CSV protection", () => {
  it("neutralizes formulas and leading whitespace or control characters", () => {
    expect(sanitizeContributionCsvText("=cmd")).toBe("'=cmd");
    expect(sanitizeContributionCsvText("+1+1")).toBe("'+1+1");
    expect(sanitizeContributionCsvText("-1+1")).toBe("'-1+1");
    expect(sanitizeContributionCsvText("@sum")).toBe("'@sum");
    expect(sanitizeContributionCsvText("  =cmd")).toBe("'  =cmd");
    expect(sanitizeContributionCsvText("\t=cmd")).toBe("'\t=cmd");
    expect(sanitizeContributionCsvText("Adams")).toBe("Adams");
  });

  it("escapes commas, quotes, newlines and Unicode without changing amounts", () => {
    const csv = buildContributionCsv([
      ["Donor", "Gift total", "Note"],
      ["Young, Ada", "10.00", 'Said "thanks"\nnext'],
      ["José", "12.50", "普通"],
    ]);
    expect(csv).toContain('"Young, Ada"');
    expect(csv).toContain("10.00");
    expect(csv).toContain('"Said ""thanks""\nnext"');
    expect(csv).toContain("José");
    expect(csv).not.toMatch(/1e\+/i);
  });
});
