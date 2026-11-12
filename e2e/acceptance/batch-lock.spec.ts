import { expect, test, type Page } from "@playwright/test";

import { utcTodayDateString } from "@/lib/batches/dates";
import { STALE_BATCH_REVIEW_MESSAGE } from "@/lib/batches/review-version";

import { confirmBatchTransition, recordCheckGift } from "./helpers/batch-ui";
import { queryOriginalV1Fixture } from "./helpers/fixture-cli";
import { closeSession, signedInSession } from "./helpers/session";

test.describe("original batch deposit and lock", () => {
  test.describe.configure({ mode: "serial" });

  const amount = "18.00";
  let batchName = "";
  let batchPath = "";
  let editPath = "";
  let churchBBefore: { sum: string; count: number } | null = null;

  async function saveDeposit(page: Page, depositDate: string, reference: string) {
    await page.goto(batchPath);
    await page.getByLabel(/Deposit date/).fill(depositDate);
    await page.getByLabel(/Deposit reference/).fill(reference);
    await page.getByRole("button", { name: "Save Deposit" }).click();
    await expect(page.getByText("Deposit information saved.")).toBeVisible();
  }

  test("TREASURER can enter and reconcile a run-owned batch", async ({ browser }) => {
    churchBBefore = queryOriginalV1Fixture("org-b-totals");
    const session = await signedInSession(browser, "treasurer");
    try {
      const { page, manifest } = session;
      batchName = `${manifest.prefix}Lock Sunday`;
      await page.goto("/batches/new");
      await page.getByLabel("Batch name").fill(batchName);
      await page.getByLabel("Offering date").fill(manifest.offeringDate);
      await page.getByLabel("Expected total").fill(amount);
      await page.getByRole("button", { name: "Create Batch" }).click();
      await expect(page.getByRole("heading", { name: batchName })).toBeVisible();
      batchPath = new URL(page.url()).pathname;
      await page.getByRole("link", { name: "Add Donation" }).click();
      await recordCheckGift(page, manifest, {
        fundName: manifest.offeringTypes.a.label,
        amount,
        checkNumber: "452",
      });
      editPath =
        (await page
          .getByRole("link", { name: /Edit donation from / })
          .getAttribute("href")) ?? "";
      expect(editPath).toContain("/donations/");
      await confirmBatchTransition(page, "Complete Entry");
      await expect(page.getByText("Entry is complete. This batch is now Entered")).toBeVisible();
      await confirmBatchTransition(page, "Reconcile Batch");
      await expect(
        page.getByText("This batch is reconciled. Expected and recorded totals match."),
      ).toBeVisible();
    } finally {
      await closeSession(session);
    }
  });

  test("DATA_ENTRY can view the reconciled batch and cannot deposit or lock it", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "dataEntry");
    try {
      const { page } = session;
      await page.goto(batchPath);
      await expect(page.getByRole("heading", { name: batchName })).toBeVisible();
      await expect(page.getByText("$18.00").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Save Deposit" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Lock Batch" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Add Donation" })).toHaveCount(0);
    } finally {
      await closeSession(session);
    }
  });

  test("a stale lock is rejected, then the batch locks and stays unchanged", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const depositDate = utcTodayDateString();
    const treasurer = await signedInSession(browser, "treasurer");
    const heldForm = await signedInSession(browser, "treasurer");
    const otherWriter = await signedInSession(browser, "treasurer");
    try {
      await saveDeposit(treasurer.page, depositDate, "SLIP-1");
      await heldForm.page.goto(batchPath);
      await heldForm.page.getByLabel(/Deposit reference/).fill("SLIP-BLOCK");

      await treasurer.page.getByRole("button", { name: "Lock Batch", exact: true }).click();
      const dialog = treasurer.page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await saveDeposit(otherWriter.page, depositDate, "SLIP-2");
      await dialog.getByRole("button", { name: "Lock Batch", exact: true }).click();
      await expect(
        dialog.locator("[role='alert']").filter({ hasText: STALE_BATCH_REVIEW_MESSAGE }),
      ).toBeVisible();
      const stillOpen = queryOriginalV1Fixture<{
        batch: { status: string; recordedTotal: string; expectedTotal: string } | null;
      }>("owned-batch", batchName);
      expect(stillOpen.batch).toMatchObject({
        status: "RECONCILED",
        recordedTotal: amount,
        expectedTotal: amount,
      });

      await treasurer.page.reload();
      await confirmBatchTransition(treasurer.page, "Lock Batch");
      await expect(treasurer.page.getByText("This batch is locked and read-only.")).toBeVisible();
      await expect(treasurer.page.getByText("Locked").first()).toBeVisible();
      await expect(treasurer.page.getByRole("link", { name: /Edit donation from / })).toHaveCount(0);
      await expect(treasurer.page.getByRole("button", { name: "Save Deposit" })).toHaveCount(0);
      await expect(treasurer.page.getByText(/\$18\.00/).first()).toBeVisible();

      await heldForm.page.getByRole("button", { name: "Save Deposit" }).click();
      await expect(
        heldForm.page.locator("[role='alert']").filter({
          hasText: "This batch is not in the required status.",
        }),
      ).toBeVisible();

      await treasurer.page.goto(editPath);
      await expect(treasurer.page.getByRole("heading", { name: "Edit Draft Donation" })).toHaveCount(0);
      await expect(treasurer.page.getByRole("heading", { name: batchName })).toBeVisible();

      const locked = queryOriginalV1Fixture<{
        batch: {
          status: string;
          expectedTotal: string;
          recordedTotal: string;
          depositDate: string | null;
          depositReference: string | null;
        } | null;
        donationTotals: string[];
        allocations: Array<{ fund: string; amount: string }>;
        lockAuditCount: number;
        lockStatus: { oldValue: string | null; newValue: string | null } | null;
      }>("owned-batch", batchName);
      expect(locked.batch).toMatchObject({
        status: "LOCKED",
        expectedTotal: amount,
        recordedTotal: amount,
        depositDate,
        depositReference: "SLIP-2",
      });
      expect(locked.donationTotals).toEqual([amount]);
      expect(locked.allocations).toEqual([
        { fund: treasurer.manifest.offeringTypes.a.label, amount },
      ]);
      expect(locked.lockAuditCount).toBe(1);
      expect(locked.lockStatus).toEqual({ oldValue: "RECONCILED", newValue: "LOCKED" });
    } finally {
      await closeSession(otherWriter);
      await closeSession(heldForm);
      await closeSession(treasurer);
    }
  });

  test("REPORT_VIEWER sees locked history and the other church stays unchanged", async ({
    browser,
  }) => {
    const viewer = await signedInSession(browser, "reportViewer");
    try {
      await viewer.page.goto(batchPath);
      await expect(viewer.page.getByRole("heading", { name: batchName })).toBeVisible();
      await expect(viewer.page.getByText("Locked").first()).toBeVisible();
      await expect(viewer.page.getByRole("link", { name: /Edit donation from / })).toHaveCount(0);
      await expect(viewer.page.getByRole("button", { name: "Save Deposit" })).toHaveCount(0);
      await expect(viewer.page.getByRole("button", { name: "Lock Batch" })).toHaveCount(0);
    } finally {
      await closeSession(viewer);
    }

    const donor = await signedInSession(browser, "donorA1");
    try {
      await donor.page.goto(batchPath);
      await expect(donor.page.getByRole("heading", { name: batchName })).toHaveCount(0);
    } finally {
      await closeSession(donor);
    }

    const otherChurch = await signedInSession(browser, "multiOrg", "b");
    try {
      const response = await otherChurch.page.goto(batchPath);
      expect(response?.status()).toBe(404);
      await expect(otherChurch.page.getByRole("heading", { name: batchName })).toHaveCount(0);
    } finally {
      await closeSession(otherChurch);
    }

    const after = queryOriginalV1Fixture<{ sum: string; count: number }>("org-b-totals");
    expect(after).toEqual(churchBBefore);
  });
});
