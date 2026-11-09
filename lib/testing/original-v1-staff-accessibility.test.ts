import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function source(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("original v1 staff accessibility contracts", () => {
  it("keeps a skip link to staff main content and avoids a competing header h1", () => {
    const layout = source("app/(staff)/layout.tsx");
    expect(layout).toContain('href="#staff-main-content"');
    expect(layout).toContain("Skip to main content");
    expect(layout).toContain('id="staff-main-content"');
    expect(layout).not.toMatch(/<h1 className="text-lg font-semibold text-white">/);
    expect(layout).toContain("staffChurchDisplayName");
    expect(layout).toContain("No church selected. Stop. Do not save.");
    expect(layout).toContain('label: "Statements"');
  });

  it("names toast errors, donation search, and unique gift allocation controls", () => {
    const toast = source("components/ui/toast.tsx");
    expect(toast).toContain('role={variant === "error" ? "alert" : "status"}');
    expect(toast).toContain('aria-label="Dismiss notification"');

    const form = source("components/batches/manual-donation-form.tsx");
    expect(form).toContain("Search donors");
    expect(form).toContain("donor-search-error");
    expect(form).toContain("Giving fund {index + 1}");
    expect(form).toContain("Amount {index + 1}");
    expect(form).toContain("`Remove allocation ${index + 1}`");
    expect(form).toContain("allocationRowBindings");
    expect(form).toContain('role="status"');
  });

  it("gives repeated staff actions unique accessible names", () => {
    expect(source("app/(staff)/batches/page.tsx")).toContain(
      "`View ${batch.name}`",
    );
    expect(source("app/(staff)/batches/page.tsx")).toContain(
      "`Edit ${batch.name}`",
    );
    expect(source("app/(staff)/batches/[id]/page.tsx")).toContain(
      "`Edit donation from ${donation.donorName}`",
    );
    expect(
      source("components/staff/staff-membership-edit-form.tsx"),
    ).toContain("`Save membership for ${row.displayName}`");
    expect(source("components/staff/staff-invitation-list.tsx")).toContain(
      "`Revoke invitation for ${row.email}`",
    );
    expect(source("app/(staff)/statements/registry/page.tsx")).toContain(
      "`Open review for ${row.statementIdentifier}`",
    );
    expect(
      source("components/giving/unmatched-gift-match-dialog.tsx"),
    ).toContain(
      "`Review and match ${gift.offeringDateLabel} ${gift.totalAmountLabel}`",
    );
  });

  it("keeps keyboard-reachable logo upload, report current page, and idle-timeout DOM order", () => {
    const org = source(
      "app/(staff)/settings/organization/organization-settings-form.tsx",
    );
    expect(org).toContain('className="sr-only"');
    expect(org).not.toMatch(/type="file"[\s\S]*className="hidden"/);
    expect(org).toContain('role="alert"');

    expect(
      source("components/reports/contribution-report-filters.tsx"),
    ).toContain('aria-current={filters.view === view ? "page" : undefined}');

    const idle = source("components/security/staff-idle-timeout.tsx");
    const actions = idle.slice(idle.indexOf("flex flex-col gap-3"));
    expect(actions.indexOf("Stay Signed In")).toBeLessThan(
      actions.indexOf("Sign Out Now"),
    );
    expect(idle).not.toContain("flex-col-reverse");
  });
});
