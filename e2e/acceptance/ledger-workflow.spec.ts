import { expect, test } from "@playwright/test";

import { closeSession, signedInSession } from "./helpers/session";

test.describe("original ledger workflow", () => {
  test.describe.configure({ mode: "serial" });

  test("DATA_ENTRY can create a draft batch and record a split gift but cannot reconcile", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "dataEntry");
    try {
      const { page, manifest } = session;
      await page.goto("/batches/new");
      await expect(
        page.getByRole("heading", { name: "Add Offering Batch" }),
      ).toBeVisible();
      await page.getByLabel("Batch name").fill(`${manifest.prefix}Ledger Sunday`);
      await page.getByLabel("Offering date").fill(manifest.offeringDate);
      await page.getByLabel("Expected total").fill("30.00");
      await page.getByRole("button", { name: "Create Batch" }).click();
      await expect(page.getByRole("heading", { name: `${manifest.prefix}Ledger Sunday` })).toBeVisible();

      await page.getByRole("link", { name: "Add Donation" }).click();
      await page.getByPlaceholder("Name, email, or phone").fill(manifest.donors.a1.label);
      await page.getByRole("button", { name: "Search donors" }).click();
      await expect(page.getByText(manifest.donors.a1.label)).toBeVisible();
      await page.getByRole("radio").first().check();
      await page.getByLabel("Payment method").selectOption("CHECK");
      await page.getByLabel("Check number").fill("441");
      const funds = page.locator('select[name="allocations.0.offeringTypeId"]');
      await funds.selectOption({ index: 1 });
      await page.locator('input[name="allocations.0.amount"]').fill("10.00");
      await page.getByRole("button", { name: "Add allocation row" }).click();
      await page
        .locator('select[name="allocations.1.offeringTypeId"]')
        .selectOption({ index: 2 });
      await page.locator('input[name="allocations.1.amount"]').fill("20.00");
      await page.getByLabel("Deductible amount").fill("30.00");
      await page.getByRole("button", { name: "Save donation" }).click();
      await expect(
        page.getByText("The donation was recorded and the batch total was updated."),
      ).toBeVisible();
      await expect(page.getByText("$30.00").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Reconcile Batch" })).toHaveCount(0);

      await page.getByRole("button", { name: "Complete Entry" }).click();
      await page.getByRole("button", { name: "Complete Entry" }).last().click();
      await expect(
        page.getByText("Entry is complete. This batch is now Entered"),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Add Donation" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Reconcile Batch" })).toHaveCount(0);
    } finally {
      await closeSession(session);
    }
  });

  test("REPORT_VIEWER can view batches and cannot add gifts", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "reportViewer");
    try {
      const { page } = session;
      await page.goto("/batches");
      await expect(
        page.getByRole("heading", { name: /Offering Batches/i }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Add Batch" })).toHaveCount(0);
      await page.goto("/batches/new");
      await expect(page.getByRole("heading", { name: "Add Offering Batch" })).toHaveCount(0);
    } finally {
      await closeSession(session);
    }
  });

  test("DONOR cannot open staff batch routes", async ({ browser }) => {
    const session = await signedInSession(browser, "donorA1");
    try {
      const { page } = session;
      await page.goto("/batches");
      await expect(page.getByRole("heading", { name: /Offering Batches/i })).toHaveCount(0);
    } finally {
      await closeSession(session);
    }
  });
});
