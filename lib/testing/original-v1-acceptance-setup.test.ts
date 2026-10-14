import { describe, expect, it } from "vitest";

import {
  deriveIsolatedDatabaseUrl,
  isolatedOrganizationsLookOwned,
  OriginalV1AcceptanceSetupError,
} from "./original-v1-acceptance-setup";

describe("original v1 isolated setup guards", () => {
  it("derives bits_e2e from the working church URL without using that database name", () => {
    const isolated = deriveIsolatedDatabaseUrl(
      "postgresql://postgres:secret@localhost:5432/bits?schema=public",
    );
    expect(isolated).toContain("/bits_e2e");
    expect(isolated).not.toMatch(/\/bits(\?|$)/);
  });

  it("refuses to derive an isolated URL when DATABASE_URL is already bits_e2e", () => {
    expect(() =>
      deriveIsolatedDatabaseUrl(
        "postgresql://postgres:secret@localhost:5432/bits_e2e",
      ),
    ).toThrow(OriginalV1AcceptanceSetupError);
  });

  it("stops when an existing bits_e2e database contains non-fixture churches", () => {
    expect(
      isolatedOrganizationsLookOwned([
        { name: "First Baptist Working Church", slug: "first-baptist" },
      ]).ok,
    ).toBe(false);
    expect(
      isolatedOrganizationsLookOwned([
        { name: "E2E07 Northside Chapel", slug: "e2e07-north-abc" },
      ]).ok,
    ).toBe(true);
    expect(isolatedOrganizationsLookOwned([]).ok).toBe(true);
  });
});
