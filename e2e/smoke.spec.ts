import { test, expect } from "@playwright/test";

/**
 * Smoke e2e for BITS.
 *
 * Authenticated staff routes require Clerk. Configure:
 * - E2E_CLERK_USER_EMAIL
 * - E2E_CLERK_USER_PASSWORD
 * (and optionally PLAYWRIGHT_BASE_URL / a signed-in storageState)
 *
 * Without those env vars, authenticated checks are skipped so CI does not
 * fail falsely. Run `npm run test:e2e` locally after signing in or setting
 * Clerk test credentials.
 */

const hasClerkE2E =
  Boolean(process.env.E2E_CLERK_USER_EMAIL) &&
  Boolean(process.env.E2E_CLERK_USER_PASSWORD);

test.describe("BITS smoke", () => {
  test("public sign-in route is reachable", async ({ page }) => {
    const response = await page.goto("/sign-in");
    expect(response?.ok() || response?.status() === 200 || response?.status() === 307).toBeTruthy();
  });

  test("staff members directory requires auth (or loads when signed in)", async ({
    page,
  }) => {
    test.skip(
      !hasClerkE2E,
      "Set E2E_CLERK_USER_EMAIL and E2E_CLERK_USER_PASSWORD to run authenticated e2e.",
    );

    // Placeholder for a future Clerk sign-in helper + directory assertion.
    await page.goto("/members");
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  });

  test("events directory requires auth (or loads when signed in)", async ({
    page,
  }) => {
    test.skip(
      !hasClerkE2E,
      "Set E2E_CLERK_USER_EMAIL and E2E_CLERK_USER_PASSWORD to run authenticated e2e.",
    );

    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  });

  test("events calendar requires auth (or loads when signed in)", async ({
    page,
  }) => {
    test.skip(
      !hasClerkE2E,
      "Set E2E_CLERK_USER_EMAIL and E2E_CLERK_USER_PASSWORD to run authenticated e2e.",
    );

    await page.goto("/events/calendar");
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  });

  /**
   * Blueprint 7.1 authenticated smoke checklist (run with Clerk e2e creds):
   * 1. Admin creates a draft event at /events/new
   * 2. Admin publishes the event
   * 3. Authorized staff views the published event
   * 4. Unauthorized role cannot open a PRIVATE event (expect redirect / not found)
   * 5. Admin edits an event
   * 6. Admin creates a recurring event and previews occurrences
   * 7. Calendar month view shows generated occurrence
   * 8. Admin cancels an event; cancelled styling remains visible
   * 9. Admin duplicates an event; duplicate is DRAFT
   * 10. Existing member attendance routes still load
   */
});
