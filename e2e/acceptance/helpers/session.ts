import { clerk } from "@clerk/testing/playwright";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  parseOriginalV1AcceptanceConfig,
  type OriginalV1AcceptanceRole,
} from "@/lib/testing/original-v1-acceptance-config";

import { readOriginalV1Manifest, type OriginalV1Manifest } from "../fixtures/manifest";

export type OriginalV1Session = {
  page: Page;
  context: BrowserContext;
  manifest: OriginalV1Manifest;
  role: OriginalV1AcceptanceRole;
};

function clerkIdentity(page: Page) {
  return page.evaluate(() => {
    const clerk = window.Clerk;
    return {
      userId: clerk?.user?.id ?? null,
      orgId: clerk?.organization?.id ?? null,
    };
  });
}

export async function closeSession(session: OriginalV1Session | null) {
  if (!session) return;
  await session.context.close();
}

export async function signedInSession(
  browser: Browser,
  role: OriginalV1AcceptanceRole,
  org: "a" | "b" = "a",
): Promise<OriginalV1Session> {
  const config = parseOriginalV1AcceptanceConfig();
  const manifest = await readOriginalV1Manifest();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/");
  await clerk.signIn({ page, emailAddress: config.emails[role] });
  await clerk.loaded({ page });

  const clerkOrgId =
    org === "a"
      ? manifest.orgs.a.clerkOrganizationId
      : manifest.orgs.b.clerkOrganizationId;
  await page.evaluate(async (organization) => {
    const loaded = window.Clerk;
    if (!loaded?.setActive) {
      throw new Error("Clerk.setActive is not available.");
    }
    await loaded.setActive({ organization });
  }, clerkOrgId);
  await page.reload();
  await clerk.loaded({ page });

  const identity = await clerkIdentity(page);
  const expectedUser = manifest.users[role];
  expect(identity.userId, `${role} session is not authenticated`).toBe(
    expectedUser.clerkUserId,
  );
  expect(identity.orgId, `${role} is not in the selected church`).toBe(clerkOrgId);

  return { page, context, manifest, role };
}
