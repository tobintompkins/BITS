import { expect, test } from "@playwright/test";

import { queryOriginalV1Fixture } from "./helpers/fixture-cli";
import {
  assertOrgACsv,
  contributionCsvPath,
  expectDeniedStatus,
  readCsv,
} from "./helpers/reports";
import { closeSession, signedInSession } from "./helpers/session";

test.describe("two-church isolation", () => {
  test.describe.configure({ mode: "serial" });

  test("church A staff cannot read church B donors, households, reports, or PDFs", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "orgAdmin", "a");
    try {
      const { page, manifest } = session;
      await page.goto("/donors");
      await expect(page.getByText(manifest.donors.a1.label)).toBeVisible();
      await expect(page.getByText("Drew")).toHaveCount(0);

      await page.goto(`/donors/${manifest.donors.b1.id}`);
      await expect(page.getByRole("alert")).toContainText(/not found/i);

      await page.goto(`/giving-households/${manifest.households.b.id}`);
      await expect(page.getByRole("alert")).toContainText(/not found/i);

      const csv = await readCsv(page, contributionCsvPath(manifest));
      expect(csv.response.status()).toBe(200);
      assertOrgACsv(csv.text, manifest);

      const foreignFilter = await readCsv(
        page,
        contributionCsvPath(manifest, { donorId: manifest.donors.b1.id }),
      );
      expectDeniedStatus(foreignFilter.response.status(), [400, 403, 404]);
      expect(foreignFilter.text).not.toContain(manifest.donors.b1.amount);

      const foreignPdf = await page.request.get(
        `/api/staff/statements/${manifest.statements.b1Generated.id}/pdf`,
      );
      expect(foreignPdf.status()).toBe(404);
      expect(await foreignPdf.text()).not.toContain("%PDF-");
      expect(await foreignPdf.text()).not.toContain(manifest.statements.b1Generated.marker);

      const portalPdf = await page.request.get(
        `/api/portal/statements/${manifest.statements.b1Published.id}/pdf?mode=view`,
      );
      expectDeniedStatus(portalPdf.status());
      expect(await portalPdf.text()).not.toContain(manifest.statements.b1Published.marker);
    } finally {
      await closeSession(session);
    }
  });

  test("denied cross-tenant donor mutation leaves church B totals unchanged", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "orgAdmin", "a");
    try {
      const { page, manifest } = session;
      const before = queryOriginalV1Fixture<{
        sum: string;
        count: number;
        firstName: string | null;
      }>("org-b-totals");

      await page.goto(`/donors/${manifest.donors.b1.id}`);
      await expect(page.getByRole("alert")).toContainText(/not found/i);
      if (await page.getByRole("button", { name: "Save donor" }).count()) {
        await page.getByLabel("First name").fill("ShouldNotSave");
        await page.getByRole("button", { name: "Save donor" }).click();
      }

      const after = queryOriginalV1Fixture<{
        sum: string;
        count: number;
        firstName: string | null;
      }>("org-b-totals");
      expect(after.sum).toBe(before.sum);
      expect(after.count).toBe(before.count);
      expect(after.firstName).toContain(manifest.prefix);
      expect(after.firstName).not.toBe("ShouldNotSave");
    } finally {
      await closeSession(session);
    }
  });
});
