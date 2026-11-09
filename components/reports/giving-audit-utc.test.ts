import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { givingAuditTimestampText } from "@/lib/validation/giving-audit-history";

import {
  GIVING_AUDIT_FROM_LABEL,
  GIVING_AUDIT_THROUGH_LABEL,
  GIVING_AUDIT_TIMESTAMP_HEADING,
  GivingAuditUtcHelp,
} from "./giving-audit-utc";

describe("giving audit UTC labels", () => {
  it("renders UTC calendar-day help and timestamp wording", () => {
    const html = renderToStaticMarkup(
      createElement(
        "section",
        null,
        createElement("span", null, GIVING_AUDIT_FROM_LABEL),
        createElement("span", null, GIVING_AUDIT_THROUGH_LABEL),
        createElement("span", null, GIVING_AUDIT_TIMESTAMP_HEADING),
        createElement(GivingAuditUtcHelp),
        createElement("time", null, givingAuditTimestampText("Nov 5, 2026, 3:00 PM")),
      ),
    );
    expect(html).toContain("From (UTC)");
    expect(html).toContain("Through (UTC)");
    expect(html).toContain("Date &amp; Time (UTC)");
    expect(html).toContain("UTC calendar days");
    expect(html).toContain("Nov 5, 2026, 3:00 PM UTC");
  });
});
