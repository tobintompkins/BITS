import { expect, test, type Page } from "@playwright/test";

import type { OriginalV1AcceptanceRole } from "@/lib/testing/original-v1-acceptance-config";
import { ORIGINAL_V1_SETTINGS_FOOTER } from "@/lib/testing/original-v1-giving-audit-fixtures";

import { queryOriginalV1Fixture } from "./helpers/fixture-cli";
import { closeSession, signedInSession } from "./helpers/session";

const PNG_A = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_B = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

type SettingsSnapshot = {
  footerA: string | null;
  footerB: string | null;
  logoKeyA: string | null;
  organizationAuditIdsA: string[];
  logoIsolated: boolean;
};

type LogoFile = {
  readable: boolean;
  exists: boolean;
  byteLength: number;
  hex: string | null;
};

function snapshot() {
  return queryOriginalV1Fixture<SettingsSnapshot>("settings-snapshot");
}

async function saveOrganizationSettings(page: Page) {
  const status = page.getByRole("status");
  await expect(status).toBeHidden();
  await page.getByRole("button", { name: "Save Changes" }).click({ noWaitAfter: true });
  await expect(status).toContainText("Organization Settings Updated Successfully");
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  if (await dismiss.isVisible()) {
    await dismiss.click();
  }
  await expect(status).toBeHidden();
}

function addedAuditIds(before: string[], after: string[]) {
  const seen = new Set(before);
  return after.filter((id) => !seen.has(id));
}

test.describe("organization settings acceptance", () => {
  test.describe.configure({ mode: "serial" });

  test("an administrator saves one fictional change and an isolated logo", async ({
    browser,
  }) => {
    const before = snapshot();
    const session = await signedInSession(browser, "orgAdmin");
    const south = await signedInSession(browser, "multiOrg", "b");
    try {
      const { page } = session;
      await page.goto("/settings/organization");
      await expect(page.getByRole("heading", { name: "Organization Settings" })).toBeVisible();
      await expect(page.getByLabel("Email")).not.toHaveValue("");
      await expect(page.getByLabel("Statement Footer")).toHaveValue(before.footerA ?? "");

      await saveOrganizationSettings(page);
      const noOp = snapshot();
      expect(noOp.organizationAuditIdsA).toEqual(before.organizationAuditIdsA);
      expect(noOp.footerB).toBe(before.footerB);

      await page.getByLabel("Statement Footer").fill(ORIGINAL_V1_SETTINGS_FOOTER);
      await saveOrganizationSettings(page);
      await page.goto("/settings/organization", { waitUntil: "domcontentloaded" });
      await expect(page.getByLabel("Statement Footer")).toHaveValue(ORIGINAL_V1_SETTINGS_FOOTER);
      const changed = snapshot();
      const created = addedAuditIds(before.organizationAuditIdsA, changed.organizationAuditIdsA);
      expect(created).toHaveLength(1);
      expect(changed.footerA).toBe(ORIGINAL_V1_SETTINGS_FOOTER);
      expect(changed.footerB).toBe(before.footerB);
      queryOriginalV1Fixture("record-owned-audit", created[0]);

      await saveOrganizationSettings(page);
      const secondNoOp = snapshot();
      expect(secondNoOp.organizationAuditIdsA).toEqual(changed.organizationAuditIdsA);

      await south.page.goto("/settings/organization");
      await expect(south.page.getByLabel("Statement Footer")).toHaveValue(before.footerB ?? "");
      await expect(south.page.getByLabel("Statement Footer")).not.toHaveValue(
        ORIGINAL_V1_SETTINGS_FOOTER,
      );

      if (!changed.logoIsolated) {
        test.info().annotations.push({
          type: "blocked",
          description:
            "Organization logo storage is not isolated from public files. Logo replacement was not attempted.",
        });
      } else {
        await page.getByLabel("Upload Logo").setInputFiles({
          name: "mark-a.png",
          mimeType: "image/png",
          buffer: PNG_A,
        });
        await saveOrganizationSettings(page);
        const firstLogo = snapshot();
        expect(firstLogo.logoKeyA).toBeTruthy();
        const firstFile = queryOriginalV1Fixture<LogoFile>("logo-file", firstLogo.logoKeyA ?? "");
        expect(firstFile.readable).toBe(true);
        expect(firstFile.exists).toBe(true);
        expect(firstFile.hex).toBe(PNG_A.toString("hex"));
        queryOriginalV1Fixture("record-owned-logo", firstLogo.logoKeyA ?? "");

        await page.getByLabel("Upload Logo").setInputFiles({
          name: "mark-b.png",
          mimeType: "image/png",
          buffer: PNG_B,
        });
        await saveOrganizationSettings(page);
        const secondLogo = snapshot();
        expect(secondLogo.logoKeyA).toBeTruthy();
        expect(secondLogo.logoKeyA).not.toBe(firstLogo.logoKeyA);
        const replaced = queryOriginalV1Fixture<LogoFile>("logo-file", firstLogo.logoKeyA ?? "");
        const current = queryOriginalV1Fixture<LogoFile>("logo-file", secondLogo.logoKeyA ?? "");
        expect(replaced.exists).toBe(false);
        expect(current.readable).toBe(true);
        expect(current.hex).toBe(PNG_B.toString("hex"));
        queryOriginalV1Fixture("record-owned-logo", secondLogo.logoKeyA ?? "");

        await page.getByRole("button", { name: "Remove Logo" }).click();
        await saveOrganizationSettings(page);
        const removed = snapshot();
        expect(removed.logoKeyA).toBeNull();
        expect(queryOriginalV1Fixture<LogoFile>("logo-file", secondLogo.logoKeyA ?? "").exists).toBe(
          false,
        );
      }

      await page.getByLabel("Statement Footer").fill(before.footerA ?? "");
      await saveOrganizationSettings(page);
      const restored = snapshot();
      expect(restored.footerA).toBe(before.footerA);
      expect(restored.footerB).toBe(before.footerB);
      for (const id of addedAuditIds(changed.organizationAuditIdsA, restored.organizationAuditIdsA)) {
        queryOriginalV1Fixture("record-owned-audit", id);
      }
    } finally {
      await closeSession(session);
      await closeSession(south);
    }
  });

  for (const role of ["treasurer", "dataEntry", "reportViewer", "donorA1"] as const satisfies readonly OriginalV1AcceptanceRole[]) {
    test(`${role} cannot submit organization settings`, async ({ browser }) => {
      const session = await signedInSession(browser, role);
      try {
        await session.page.goto("/settings/organization");
        await expect(
          session.page.getByRole("heading", { name: "Organization Settings" }),
        ).toBeVisible();
        await expect(session.page.getByRole("button", { name: "Save Changes" })).toHaveCount(0);
        await expect(session.page.getByLabel("Statement Footer")).toBeDisabled();
      } finally {
        await closeSession(session);
      }
    });
  }
});
