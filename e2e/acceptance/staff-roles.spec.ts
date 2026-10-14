import { expect, test } from "@playwright/test";

import { queryOriginalV1Fixture } from "./helpers/fixture-cli";
import {
  batchCsvPath,
  contributionCsvPath,
  readCsv,
  statementAccessCsvPath,
} from "./helpers/reports";
import { closeSession, signedInSession } from "./helpers/session";

test.describe("original five staff and donor roles", () => {
  test.describe.configure({ mode: "serial" });

  test("ORG_ADMIN can maintain donors and export the church CSV", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "orgAdmin");
    try {
      const { page, manifest } = session;
      await page.goto("/donors");
      await expect(page.getByRole("heading", { name: "Donors" })).toBeVisible();
      await expect(page.getByText(manifest.donors.a1.label)).toBeVisible();
      await expect(page.getByRole("link", { name: "Add donor" })).toBeVisible();

      await page.goto("/donors/new");
      await page.getByLabel("First name").fill(`${manifest.prefix}AdminAdded`);
      await page.getByLabel("Last name").fill("North");
      await page.getByRole("button", { name: "Save donor" }).click();
      await expect(page.getByText("Donor saved.")).toBeVisible();

      await page.goto("/offering-types");
      await expect(
        page.getByRole("heading", { name: /Offering types/i }),
      ).toBeVisible();
      await page.goto("/giving-households");
      await expect(
        page.getByRole("heading", { name: /Giving households/i }),
      ).toBeVisible();

      await page.goto(
        `/reports?view=detail&startDate=${manifest.period.startDate}&endDate=${manifest.period.endDate}`,
      );
      await expect(
        page.getByRole("heading", { name: "Contribution reports" }),
      ).toBeVisible();
      await expect(page.getByText(manifest.donors.a1.amount)).toBeVisible();

      const csv = await readCsv(page, contributionCsvPath(manifest));
      expect(csv.response.status()).toBe(200);
      expect(csv.text).toContain(manifest.donors.a1.amount);
      expect(csv.text).toContain(manifest.donors.a2.amount);
      expect(csv.text).not.toContain(manifest.donors.b1.amount);

      const audited = queryOriginalV1Fixture<{ audit: { id: string } | null }>(
        "audit-export",
      );
      expect(audited.audit).toBeTruthy();

      const accessCsv = await readCsv(page, statementAccessCsvPath(manifest));
      expect(accessCsv.response.status()).toBe(200);
      expect(accessCsv.text.toLowerCase()).not.toContain("pdfstoragekey");
    } finally {
      await closeSession(session);
    }
  });

  test("TREASURER can read reports and cannot be used as a skip", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "treasurer");
    try {
      const { page, manifest } = session;
      await page.goto("/donors");
      await expect(page.getByRole("heading", { name: "Donors" })).toBeVisible();
      await page.goto("/reports/batch-reconciliation");
      await expect(page.getByRole("heading", { name: /Batch/i })).toBeVisible();
      const csv = await readCsv(page, contributionCsvPath(manifest));
      expect(csv.response.status()).toBe(200);
      expect(csv.text).toContain(manifest.donors.a1.amount);
      const batch = await readCsv(page, batchCsvPath(manifest));
      expect(batch.response.status()).toBe(200);
      const access = await readCsv(page, statementAccessCsvPath(manifest));
      expect(access.response.status()).toBe(200);
    } finally {
      await closeSession(session);
    }
  });

  test("DATA_ENTRY can maintain basic records but cannot export reports or change financial contacts", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "dataEntry");
    try {
      const { page, manifest } = session;
      await page.goto("/donors");
      await expect(page.getByRole("heading", { name: "Donors" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Add donor" })).toBeVisible();

      await page.goto("/reports");
      await expect(page.getByRole("alert")).toContainText(/permission/i);
      await expect(page.getByText(manifest.donors.a1.amount)).toHaveCount(0);

      const csv = await readCsv(page, contributionCsvPath(manifest));
      expect(csv.response.status()).toBe(403);
      expect(csv.text).not.toContain(manifest.donors.a1.amount);

      const access = await readCsv(page, statementAccessCsvPath(manifest));
      expect(access.response.status()).toBe(403);

      await page.goto(`/giving-households/${manifest.households.a.id}`);
      await expect(
        page.getByText(/administrator or treasurer/i),
      ).toBeVisible();
      await expect(
        page.getByLabel("Preferred statement recipient"),
      ).toHaveCount(0);

      const before = await page.evaluate(() => {
        const input = document.querySelector(
          'input[name="preferredStatementRecipientId"]',
        ) as HTMLInputElement | null;
        return input?.value ?? "";
      });
      expect(before).toBe(manifest.donors.a1.id);

      await page.evaluate((donorId) => {
        const input = document.querySelector(
          'input[name="preferredStatementRecipientId"]',
        ) as HTMLInputElement | null;
        if (input) input.value = donorId;
        const form = input?.closest("form");
        form?.requestSubmit();
      }, manifest.donors.a2.id);
      await expect(
        page.getByText(/do not have permission to change the primary donor/i),
      ).toBeVisible();

      const household = queryOriginalV1Fixture<{
        household: { preferredStatementRecipientId: string | null } | null;
      }>("household-recipient");
      expect(household.household?.preferredStatementRecipientId).toBe(
        manifest.donors.a1.id,
      );

      await page.evaluate((donorId) => {
        const form = document.getElementById(
          "link-giving-household-donor",
        ) as HTMLFormElement | null;
        if (!form) throw new Error("Link donor form is missing.");
        const select = document.querySelector(
          'select[name="donorId"]',
        ) as HTMLSelectElement | null;
        if (select) {
          if (![...select.options].some((option) => option.value === donorId)) {
            const option = document.createElement("option");
            option.value = donorId;
            option.text = donorId;
            select.appendChild(option);
          }
          select.value = donorId;
        }
        const start = form.querySelector(
          'input[name="startDate"]',
        ) as HTMLInputElement | null;
        if (start) start.value = "2026-01-02";
        form.requestSubmit();
      }, manifest.donors.aUnassigned.id);
      await expect(page.getByText(/backdate/i)).toBeVisible();
    } finally {
      await closeSession(session);
    }
  });

  test("REPORT_VIEWER can export contribution CSV and cannot mutate donors", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "reportViewer");
    try {
      const { page, manifest } = session;
      await page.goto("/donors");
      await expect(page.getByRole("heading", { name: "Donors" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Add donor" })).toHaveCount(0);
      await page.goto("/donors/new");
      await expect(page.getByRole("alert")).toContainText(/permission/i);

      await page.goto("/reports");
      await expect(
        page.getByRole("heading", { name: "Contribution reports" }),
      ).toBeVisible();
      const csv = await readCsv(page, contributionCsvPath(manifest));
      expect(csv.response.status()).toBe(200);
      expect(csv.text).toContain(manifest.donors.a1.amount);

      const access = await readCsv(page, statementAccessCsvPath(manifest));
      expect(access.response.status()).toBe(403);
    } finally {
      await closeSession(session);
    }
  });

  test("DONOR cannot open staff giving routes or church-wide CSV", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "donorA1");
    try {
      const { page, manifest } = session;
      await page.goto("/donors");
      await expect(page.getByRole("alert")).toContainText(/permission|staff|church/i);
      await expect(page.getByText(manifest.donors.a2.label)).toHaveCount(0);

      const csv = await readCsv(page, contributionCsvPath(manifest));
      expect([401, 403]).toContain(csv.response.status());
      expect(csv.text).not.toContain(manifest.donors.a1.amount);

      const access = await readCsv(page, statementAccessCsvPath(manifest));
      expect([401, 403]).toContain(access.response.status());
    } finally {
      await closeSession(session);
    }
  });
});
