import { expect, test } from "@playwright/test";

import { clerk } from "@clerk/testing/playwright";

import {
  assertOrgACsv,
  assertOrgBCsv,
  contributionCsvPath,
  readCsv,
} from "./helpers/reports";
import { closeSession, signedInSession } from "./helpers/session";

test.describe("multi-organization staff switching", () => {
  test.describe.configure({ mode: "serial" });

  test("fresh CSV requests follow the active Clerk organization", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "multiOrg", "a");
    try {
      const { page, manifest } = session;
      const churchA = await readCsv(page, contributionCsvPath(manifest));
      expect(churchA.response.status()).toBe(200);
      assertOrgACsv(churchA.text, manifest);

      await page.goto("/");
      await clerk.loaded({ page });
      await page.evaluate(async (organization) => {
        await window.Clerk.setActive({ organization });
      }, manifest.orgs.b.clerkOrganizationId);
      await page.reload();
      await clerk.loaded({ page });
      const identity = await page.evaluate(() => window.Clerk?.organization?.id ?? null);
      expect(identity).toBe(manifest.orgs.b.clerkOrganizationId);

      const churchB = await readCsv(
        page,
        contributionCsvPath(manifest, { organizationId: manifest.orgs.b.id }),
      );
      expect(churchB.response.status()).toBe(200);
      assertOrgBCsv(churchB.text, manifest);

      await page.goto("/donors");
      await expect(page.getByText(manifest.donors.b1.label)).toBeVisible();
      await expect(page.getByText("Avery")).toHaveCount(0);
    } finally {
      await closeSession(session);
    }
  });
});
