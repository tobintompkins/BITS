import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineRailway, postgres, project, service } from "railway/iac";
import { REQUIRED_CLERK_SHARED_KEYS } from "./shared-variables.ts";

/**
 * Desired TEST graph for Railway CLI 5.71.0.
 * Not linked and not applied.
 *
 * APP_BASE_URL is ignored by the variable policy. The first create does not
 * send it, and a later plan does not delete it after it is set on the service.
 */
const TEST_PROJECT = "bits-test";
const TEST_ENVIRONMENT = "test";

function assertSharedReceipt(): void {
  const path = join(dirname(fileURLToPath(import.meta.url)), ".shared-check.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(
      "Cannot plan: Clerk shared variables are not verified. Project bits-test and environment test must exist first. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY as shared variables, then run npm run railway:shared-check. Do not paste the values into git or chat.",
    );
  }
  const record = parsed as {
    project?: string;
    environment?: string;
    keys?: string[];
  };
  const keys = new Set(record.keys ?? []);
  const missing = REQUIRED_CLERK_SHARED_KEYS.filter((key) => !keys.has(key));
  if (
    record.project !== TEST_PROJECT ||
    record.environment !== TEST_ENVIRONMENT ||
    missing.length > 0
  ) {
    throw new Error(
      `Cannot plan: shared-variable check does not cover ${TEST_PROJECT} / ${TEST_ENVIRONMENT}${missing.length ? ` (${missing.join(", ")})` : ""}. Run npm run railway:shared-check.`,
    );
  }
}

export default defineRailway((ctx) => {
  if (ctx.projectName !== TEST_PROJECT || !ctx.isEnvironment(TEST_ENVIRONMENT)) {
    throw new Error(
      `Refusing to plan ${ctx.projectName || "(no project)"} / ${ctx.environment || "(no environment)"}. Link only ${TEST_PROJECT}, environment ${TEST_ENVIRONMENT}.`,
    );
  }
  if (ctx.shared == null) {
    throw new Error(
      "Cannot plan: Railway did not provide the shared-variable context. Set the Clerk shared variables on environment test before planning.",
    );
  }
  if (ctx.command === "plan" || ctx.command === "apply") {
    assertSharedReceipt();
  }

  const db = postgres("bits-test-db");
  const web = service("bits", {
    build: "npm run build",
    start: "npm start",
    healthcheck: "/visit",
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      RAILPACK_NODE_VERSION: "24",
      BITS_STAFF_INVITATION_PROVIDER: "mock",
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        ctx.shared.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: ctx.shared.CLERK_SECRET_KEY,
    },
  });

  return Object.assign(
    project(TEST_PROJECT, {
      resources: [web, db],
    }),
    {
      variables: {
        managed: true,
        ignore: ["bits/APP_BASE_URL"],
      },
    },
  );
});
