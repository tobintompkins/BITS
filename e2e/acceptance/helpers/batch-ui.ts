import { expect, type Page } from "@playwright/test";

import type { OriginalV1Manifest } from "../fixtures/manifest";

export async function confirmBatchTransition(
  page: Page,
  name: "Complete Entry" | "Reconcile Batch" | "Lock Batch",
) {
  await page.getByRole("button", { name, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name, exact: true }).click();
}

export async function recordCheckGift(
  page: Page,
  manifest: OriginalV1Manifest,
  input: { fundName: string; amount: string; checkNumber: string },
) {
  const [donorLast, donorFirst] = manifest.donors.a1.label.split(", ");
  await page.getByPlaceholder("Name, email, or phone").fill(manifest.donors.a1.label);
  await page.getByRole("button", { name: "Search donors" }).click();
  await expect(
    page.getByRole("radio", { name: new RegExp(`${donorFirst} ${donorLast}`) }),
  ).toBeVisible();
  await page.getByRole("radio").first().check();
  await page.getByLabel("Payment method").selectOption("CHECK");
  await page.getByLabel("Check number").fill(input.checkNumber);
  await page
    .locator('select[name="allocations.0.offeringTypeId"]')
    .selectOption({ label: input.fundName });
  await page.locator('input[name="allocations.0.amount"]').fill(input.amount);
  await page.getByLabel("Deductible amount").fill(input.amount);
  await page.getByRole("button", { name: "Save donation" }).click();
  await expect(
    page.getByText("The donation was recorded and the batch total was updated."),
  ).toBeVisible();
}
