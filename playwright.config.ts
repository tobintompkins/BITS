import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e is optional for CI.
 * Staff routes require Clerk authentication — set CLERK test credentials
 * (or a storageState) before running authenticated flows.
 *
 * Without credentials, smoke tests skip rather than failing the suite.
 */
const hasClerkE2E =
  Boolean(process.env.E2E_CLERK_USER_EMAIL) &&
  Boolean(process.env.E2E_CLERK_USER_PASSWORD);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  /* Do not auto-start the app in CI without auth — document local usage. */
  webServer: process.env.PLAYWRIGHT_WEB_SERVER
    ? {
        command: "npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
  metadata: {
    clerkE2EConfigured: hasClerkE2E,
  },
});
