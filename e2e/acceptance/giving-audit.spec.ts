import { expect, test, type Page } from "@playwright/test";

import type { OriginalV1AcceptanceRole } from "@/lib/testing/original-v1-acceptance-config";
import {
  ORIGINAL_V1_GIVING_AUDIT_AT,
  ORIGINAL_V1_GIVING_AUDIT_DAY,
  ORIGINAL_V1_GIVING_AUDIT_PAGE_SIZE,
  ORIGINAL_V1_GIVING_AUDIT_ROW_COUNT,
  ORIGINAL_V1_PRIVATE_CHECK_A,
  ORIGINAL_V1_PRIVATE_DEPOSIT_A,
  ORIGINAL_V1_PRIVATE_GOODS_B,
  ORIGINAL_V1_PRIVATE_NOTE_A,
} from "@/lib/testing/original-v1-giving-audit-fixtures";

import { closeSession, signedInSession } from "./helpers/session";

const FILTERED = `/reports/giving-audit?entity=Donation&from=${ORIGINAL_V1_GIVING_AUDIT_DAY}&to=${ORIGINAL_V1_GIVING_AUDIT_DAY}`;
const MISSING_SUMMARY = "Check number and Deposit reference changed.";

function rows(page: Page) {
  return page.locator("tbody tr");
}

async function expectNoPrivateText(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toContain(ORIGINAL_V1_PRIVATE_NOTE_A);
  expect(text).not.toContain(ORIGINAL_V1_PRIVATE_CHECK_A);
  expect(text).not.toContain(ORIGINAL_V1_PRIVATE_DEPOSIT_A);
  expect(text).not.toContain(ORIGINAL_V1_PRIVATE_GOODS_B);
}

async function expectChurchALinks(page: Page, batchPath: string, otherBatchPath: string) {
  const hrefs = await page
    .getByRole("link", { name: "View gift's batch" })
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(0);
  expect(hrefs.every((href) => href === batchPath)).toBe(true);
  expect(hrefs).not.toContain(otherBatchPath);
}

async function expectUtcTimes(page: Page, count: number) {
  const times = await page.locator("tbody time").evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: node.textContent ?? "",
      iso: node.getAttribute("dateTime"),
    })),
  );
  expect(times).toHaveLength(count);
  for (const time of times) {
    expect(time.text.endsWith(" UTC")).toBe(true);
    expect(time.iso).toBe(ORIGINAL_V1_GIVING_AUDIT_AT);
  }
}

async function expectDenied(page: Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Giving Audit" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Leadership Security Activity" }),
  ).toHaveCount(0);
  await expectNoPrivateText(page);
}

test.describe("giving audit acceptance", () => {
  test("an administrator sees one church, both pages, and redacted rows", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "orgAdmin");
    try {
      const { page, manifest } = session;
      const batchPath = `/batches/${manifest.batches.a.id}`;
      const otherBatchPath = `/batches/${manifest.batches.b.id}`;
      await page.goto("/reports/giving-audit");
      await expect(page.getByRole("heading", { name: "Giving Audit" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Date & Time (UTC)" })).toBeVisible();
      await expect(page.getByText("Listed times are UTC.")).toBeVisible();

      await page.getByLabel("Record type").selectOption({ label: "Gift" });
      await page.getByLabel("From (UTC)").fill(ORIGINAL_V1_GIVING_AUDIT_DAY);
      await page.getByLabel("Through (UTC)").fill(ORIGINAL_V1_GIVING_AUDIT_DAY);
      await page.getByRole("button", { name: "Apply filter" }).click();

      await expect(rows(page)).toHaveCount(ORIGINAL_V1_GIVING_AUDIT_PAGE_SIZE);
      await expect(page.getByText(MISSING_SUMMARY)).toHaveCount(1);
      await expect(page.getByText("Notes changed.")).toHaveCount(1);
      await expect(page.locator("tbody tr", { hasText: MISSING_SUMMARY }).getByRole("link")).toHaveCount(0);
      await expectUtcTimes(page, ORIGINAL_V1_GIVING_AUDIT_PAGE_SIZE);
      await expectChurchALinks(page, batchPath, otherBatchPath);
      await expect(page.getByText("Goods or services changed.")).toHaveCount(0);
      await expectNoPrivateText(page);

      await page.getByRole("link", { name: "Older records" }).click();
      await expect(rows(page)).toHaveCount(1);
      await expect(page.getByText(MISSING_SUMMARY)).toHaveCount(0);
      await expect(page.getByText("Notes changed.")).toHaveCount(0);
      await expectUtcTimes(page, 1);
      await expectChurchALinks(page, batchPath, otherBatchPath);
      await expectNoPrivateText(page);

      await page.getByLabel("From (UTC)").fill("2099-01-16");
      await page.getByLabel("Through (UTC)").fill("2099-01-16");
      await page.getByRole("button", { name: "Apply filter" }).click();
      await expect(page.getByText("No recorded giving actions match this filter.")).toBeVisible();
      await expect(page.getByText("Notes changed.")).toHaveCount(0);

      await page.goto("/reports/giving-audit?category=PRIVACY");
      await expect(
        page.getByRole("alert", { name: "Choose a valid giving audit filter." }),
      ).toBeVisible();
      await expect(page.getByText(ORIGINAL_V1_PRIVATE_NOTE_A)).toHaveCount(0);
      expect(ORIGINAL_V1_GIVING_AUDIT_PAGE_SIZE + 1).toBe(ORIGINAL_V1_GIVING_AUDIT_ROW_COUNT);
    } finally {
      await closeSession(session);
    }
  });

  test("a treasurer sees the same church and cannot open Security Activity", async ({
    browser,
  }) => {
    const session = await signedInSession(browser, "treasurer");
    try {
      const { page, manifest } = session;
      await page.goto(FILTERED);
      await expect(page.getByRole("heading", { name: "Giving Audit" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Date & Time (UTC)" })).toBeVisible();
      await expect(rows(page)).toHaveCount(ORIGINAL_V1_GIVING_AUDIT_PAGE_SIZE);
      await expect(page.getByText(MISSING_SUMMARY)).toHaveCount(1);
      await expect(page.getByText("Goods or services changed.")).toHaveCount(0);
      await expectChurchALinks(
        page,
        `/batches/${manifest.batches.a.id}`,
        `/batches/${manifest.batches.b.id}`,
      );
      await expectNoPrivateText(page);
      await expect(page.getByRole("link", { name: "Security Activity" })).toHaveCount(0);

      await expectDenied(page, "/administration/security-activity");
      await expectDenied(page, "/administration/security-activity?category=PRIVACY");
      await expectDenied(page, "/administration/security-activity?category=NOT_A_CATEGORY");
    } finally {
      await closeSession(session);
    }
  });

  test("the other church's sentinel stays on that church", async ({ browser }) => {
    const session = await signedInSession(browser, "multiOrg", "b");
    try {
      const { page } = session;
      await page.goto(FILTERED);
      await expect(page.getByText("Goods or services changed.")).toHaveCount(1);
      await expect(page.getByText("Notes changed.")).toHaveCount(0);
      await expect(page.getByText(MISSING_SUMMARY)).toHaveCount(0);
      await expectNoPrivateText(page);
    } finally {
      await closeSession(session);
    }
  });

  for (const role of ["dataEntry", "reportViewer", "donorA1"] as const satisfies readonly OriginalV1AcceptanceRole[]) {
    test(`${role} cannot read giving audit from the direct URL`, async ({ browser }) => {
      const session = await signedInSession(browser, role);
      try {
        await expectDenied(session.page, FILTERED);
        await expectDenied(session.page, "/reports/giving-audit?category=PRIVACY");
      } finally {
        await closeSession(session);
      }
    });
  }
});
