import { defineConfig, devices } from "@playwright/test";

import { loadOriginalV1AcceptanceEnvFiles } from "./lib/testing/original-v1-acceptance-env";

loadOriginalV1AcceptanceEnvFiles();

/**
 * Dedicated original-v1 role/tenant acceptance.
 * Fails closed when isolated Clerk/database configuration is missing.
 * Does not auto-start the app; the server must already be running on the
 * isolated database with BITS_E2E_ACCEPTANCE=1.
 */
export default defineConfig({
  testDir: "./e2e/acceptance",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3017",
    trace: "off",
    screenshot: "off",
    video: "off",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "acceptance-setup", testMatch: /acceptance\.setup\.ts/ },
    {
      name: "acceptance",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["acceptance-setup"],
    },
    {
      name: "acceptance-teardown",
      testMatch: /acceptance\.teardown\.ts/,
      dependencies: ["acceptance"],
    },
  ],
});
