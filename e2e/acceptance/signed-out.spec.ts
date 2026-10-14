import { expect, test } from "@playwright/test";

import { parseOriginalV1AcceptanceConfig } from "@/lib/testing/original-v1-acceptance-config";

import { readOriginalV1Manifest } from "./fixtures/manifest";
import {
  contributionCsvPath,
  statementAccessCsvPath,
} from "./helpers/reports";

test.describe("signed-out original v1 routes", () => {
  test.describe.configure({ mode: "serial" });

  test("protected pages redirect to sign-in instead of rendering data", async ({
    page,
  }) => {
    parseOriginalV1AcceptanceConfig();
    const manifest = await readOriginalV1Manifest();

    for (const path of [
      "/donors",
      "/giving-households",
      "/offering-types",
      "/reports",
      "/reports/batch-reconciliation",
      "/reports/statement-access",
      `/donors/${manifest.donors.a1.id}`,
    ]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(page.url(), `${path} must not stay on the protected route`).toMatch(
        /sign-in/i,
      );
      expect(await page.content()).not.toContain(manifest.donors.a1.amount);
      expect(await page.content()).not.toContain(manifest.donors.a1.label);
      expect(response?.status() === 200 ? page.url() : "redirected").not.toBe(
        new URL(path, page.url()).toString(),
      );
    }
  });

  test("APIs deny unauthenticated CSV and PDF requests", async ({ request }) => {
    const manifest = await readOriginalV1Manifest();
    const csv = await request.get(contributionCsvPath(manifest));
    expect(csv.status()).toBe(401);
    expect(await csv.text()).not.toContain(manifest.donors.a1.amount);

    const statementCsv = await request.get(statementAccessCsvPath(manifest));
    expect(statementCsv.status()).toBe(401);

    const portalPdf = await request.get(
      `/api/portal/statements/${manifest.statements.a1Published.id}/pdf?mode=view`,
    );
    expect(portalPdf.status()).toBe(401);
    expect(await portalPdf.text()).not.toContain("%PDF-");

    const staffPdf = await request.get(
      `/api/staff/statements/${manifest.statements.a1Generated.id}/pdf`,
    );
    expect(staffPdf.status()).toBe(401);
  });
});
