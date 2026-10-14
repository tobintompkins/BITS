import { expect, test } from "@playwright/test";

import { expectDeniedStatus } from "./helpers/reports";
import { closeSession, signedInSession } from "./helpers/session";

test.describe("donor portal statement authorization", () => {
  test.describe.configure({ mode: "serial" });

  test("donor A1 can open only authorized published PDFs", async ({ browser }) => {
    const session = await signedInSession(browser, "donorA1");
    try {
      const { page, manifest } = session;

      const own = await page.request.get(
        `/api/portal/statements/${manifest.statements.a1Published.id}/pdf?mode=view`,
      );
      expect(own.status()).toBe(200);
      expect(own.headers()["content-type"]).toContain("application/pdf");
      const ownBytes = Buffer.from(await own.body());
      expect(ownBytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(ownBytes.toString("utf8")).toContain(manifest.statements.a1Published.marker);
      expect(own.headers()["content-disposition"] ?? "").not.toMatch(/storage/i);

      const household = await page.request.get(
        `/api/portal/statements/${manifest.statements.aHouseholdPublished.id}/pdf?mode=download`,
      );
      expect(household.status()).toBe(200);
      expect(Buffer.from(await household.body()).toString("utf8")).toContain(
        manifest.statements.aHouseholdPublished.marker,
      );

      const unpublished = await page.request.get(
        `/api/portal/statements/${manifest.statements.a1Generated.id}/pdf?mode=view`,
      );
      expect(unpublished.status()).toBe(404);
      expect(await unpublished.text()).not.toContain("%PDF-");

      const otherDonor = await page.request.get(
        `/api/portal/statements/${manifest.statements.a2Published.id}/pdf?mode=view`,
      );
      expect(otherDonor.status()).toBe(404);
      expect(await otherDonor.text()).not.toContain(
        manifest.statements.a2Published.marker,
      );

      const otherChurch = await page.request.get(
        `/api/portal/statements/${manifest.statements.b1Published.id}/pdf?mode=view`,
      );
      expect(otherChurch.status()).toBe(404);
      expect(await otherChurch.text()).not.toContain(
        manifest.statements.b1Published.marker,
      );
    } finally {
      await closeSession(session);
    }
  });

  test("donor A2 cannot open A1 individual or household PDFs", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "donorA2");
    try {
      const { page, manifest } = session;
      const own = await page.request.get(
        `/api/portal/statements/${manifest.statements.a2Published.id}/pdf?mode=view`,
      );
      expect(own.status()).toBe(200);
      expect(Buffer.from(await own.body()).toString("utf8")).toContain(
        manifest.statements.a2Published.marker,
      );

      const a1 = await page.request.get(
        `/api/portal/statements/${manifest.statements.a1Published.id}/pdf?mode=view`,
      );
      expectDeniedStatus(a1.status());
      expect(await a1.text()).not.toContain("%PDF-");

      const household = await page.request.get(
        `/api/portal/statements/${manifest.statements.aHouseholdPublished.id}/pdf?mode=view`,
      );
      expect(household.status()).toBe(404);
      expect(await household.text()).not.toContain(
        manifest.statements.aHouseholdPublished.marker,
      );
    } finally {
      await closeSession(session);
    }
  });
});
