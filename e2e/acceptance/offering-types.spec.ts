import { expect, test } from "@playwright/test";

import { normalizeNewOfferingTypeCode } from "@/lib/validation/offering-type";

import { recordCheckGift } from "./helpers/batch-ui";
import { queryOriginalV1Fixture } from "./helpers/fixture-cli";
import { closeSession, signedInSession } from "./helpers/session";

test.describe("original offering-type administration", () => {
  test.describe.configure({ mode: "serial" });

  const amount = "15.00";
  let fundName = "";
  let fundCode = "";
  let fundPath = "";
  let batchName = "";
  let batchPath = "";

  test("TREASURER can create and edit a run-owned fund", async ({ browser }) => {
    const session = await signedInSession(browser, "treasurer");
    try {
      const { page, manifest } = session;
      fundName = `${manifest.prefix}Benevolence`;
      fundCode = normalizeNewOfferingTypeCode(`${manifest.prefix}FUND`) ?? "";
      expect(fundCode).not.toBe("");

      await page.goto("/offering-types/new");
      await expect(page.getByRole("heading", { name: "Add offering type" })).toBeVisible();
      await page.getByLabel("Name").fill(fundName);
      await page.getByLabel("Display order").fill("40");
      await page.getByLabel("Description").fill(`${manifest.prefix}run fund`);
      await page.getByLabel("Integration code").fill(`${manifest.prefix}FUND`);
      await page.getByRole("checkbox", { name: "Normally tax-deductible" }).check();
      await page.getByRole("button", { name: "Save offering type" }).click();
      await expect(page.getByText("Offering type saved.")).toBeVisible();
      await page.getByRole("link", { name: "View saved offering type" }).click();
      await expect(page.getByRole("heading", { name: fundName })).toBeVisible();
      fundPath = new URL(page.url()).pathname;

      await page.getByLabel("Display order").fill("41");
      await page.getByLabel("Description").fill(`${manifest.prefix}run fund revised`);
      await expect(page.getByLabel("Integration code")).toHaveAttribute("readonly", "");
      await page.getByRole("button", { name: "Save offering type" }).click();
      await expect(page.getByText("Offering type saved.")).toBeVisible();

      const saved = queryOriginalV1Fixture<{
        fund: {
          code: string;
          description: string;
          active: boolean;
          displayOrder: number;
          defaultTaxDeductible: boolean;
        } | null;
      }>("owned-offering-type", fundName);
      expect(saved.fund).toMatchObject({
        code: fundCode,
        description: `${manifest.prefix}run fund revised`,
        active: true,
        displayOrder: 41,
        defaultTaxDeductible: true,
      });
    } finally {
      await closeSession(session);
    }
  });

  test("a recorded gift keeps its fund and amount after deactivation", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "treasurer");
    try {
      const { page, manifest } = session;
      batchName = `${manifest.prefix}Fund Sunday`;
      await page.goto("/batches/new");
      await page.getByLabel("Batch name").fill(batchName);
      await page.getByLabel("Offering date").fill(manifest.offeringDate);
      await page.getByLabel("Expected total").fill(amount);
      await page.getByRole("button", { name: "Create Batch" }).click();
      await expect(page.getByRole("heading", { name: batchName })).toBeVisible();
      batchPath = new URL(page.url()).pathname;
      await page.getByRole("link", { name: "Add Donation" }).click();
      await recordCheckGift(page, manifest, {
        fundName,
        amount,
        checkNumber: "451",
      });
      await expect(page.getByText(`${fundName} $15.00`)).toBeVisible();

      await page.goto(fundPath);
      await page
        .getByRole("checkbox", {
          name: "I confirm this fund should be deactivated. New gifts and checkout cannot use it. Historical gifts stay on file.",
        })
        .check();
      await page.getByRole("button", { name: "Deactivate offering type" }).click();
      await expect(page.getByText(/^Inactive ·/)).toBeVisible();

      await page.goto(batchPath);
      await expect(page.getByText(`${fundName} $15.00`)).toBeVisible();
      await page.getByRole("link", { name: "Add Donation" }).click();
      await expect(
        page.locator('select[name="allocations.0.offeringTypeId"] option', {
          hasText: fundName,
        }),
      ).toHaveCount(0);

      const persisted = queryOriginalV1Fixture<{
        fund: { active: boolean } | null;
        allocationCount: number;
        allocationAmounts: string[];
      }>("owned-offering-type", fundName);
      expect(persisted.fund?.active).toBe(false);
      expect(persisted.allocationCount).toBe(1);
      expect(persisted.allocationAmounts).toEqual([amount]);
    } finally {
      await closeSession(session);
    }
  });

  test("TREASURER can reactivate the same fund for new entry", async ({ browser }) => {
    const session = await signedInSession(browser, "treasurer");
    try {
      const { page, manifest } = session;
      await page.goto(fundPath);
      await page
        .getByRole("checkbox", {
          name: "I confirm this fund should be reactivated for new gift entry.",
        })
        .check();
      await page.getByRole("button", { name: "Reactivate offering type" }).click();
      await expect(page.getByText(/^Active ·/)).toBeVisible();

      await page.goto(batchPath);
      await page.getByRole("link", { name: "Add Donation" }).click();
      await expect(
        page.locator('select[name="allocations.0.offeringTypeId"] option', {
          hasText: fundName,
        }),
      ).toHaveCount(1);
      const persisted = queryOriginalV1Fixture<{
        fund: { active: boolean } | null;
        allocationAmounts: string[];
      }>("owned-offering-type", fundName);
      expect(persisted.fund?.active).toBe(true);
      expect(persisted.allocationAmounts).toEqual([amount]);
    } finally {
      await closeSession(session);
    }
  });

  test("DATA_ENTRY and REPORT_VIEWER can read the fund and cannot save it", async ({
    browser,
  }) => {
    for (const role of ["dataEntry", "reportViewer"] as const) {
      const session = await signedInSession(browser, role);
      try {
        const { page } = session;
        await page.goto("/offering-types");
        await expect(page.getByRole("heading", { name: "Offering Types" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Add offering type" })).toHaveCount(0);
        await page.goto("/offering-types/new");
        await expect(
          page.locator("[role='alert']").filter({
            hasText: "You do not have permission to perform this offering type action.",
          }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: "Save offering type" })).toHaveCount(0);
        await page.goto(fundPath);
        await expect(page.getByRole("heading", { name: fundName })).toBeVisible();
        await expect(page.getByRole("button", { name: "Save offering type" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Deactivate offering type" })).toHaveCount(0);
      } finally {
        await closeSession(session);
      }
    }
  });

  test("DONOR and the other church cannot maintain Church A’s fund", async ({
    browser,
  }) => {
    const before = queryOriginalV1Fixture<{ sum: string; count: number }>("org-b-totals");
    const donor = await signedInSession(browser, "donorA1");
    try {
      await donor.page.goto("/offering-types");
      await expect(
        donor.page.locator("[role='alert']").filter({
          hasText: "You do not have permission to perform this offering type action.",
        }),
      ).toBeVisible();
      await expect(donor.page.getByRole("heading", { name: "Offering Types" })).toHaveCount(0);
    } finally {
      await closeSession(donor);
    }

    const otherChurch = await signedInSession(browser, "multiOrg", "b");
    try {
      await otherChurch.page.goto(fundPath);
      await expect(
        otherChurch.page.locator("[role='alert']").filter({
          hasText: "Offering type not found in this church.",
        }),
      ).toBeVisible();
      await expect(otherChurch.page.getByRole("button", { name: "Save offering type" })).toHaveCount(0);
    } finally {
      await closeSession(otherChurch);
    }

    const after = queryOriginalV1Fixture<{ sum: string; count: number }>("org-b-totals");
    expect(after).toEqual(before);
  });
});
