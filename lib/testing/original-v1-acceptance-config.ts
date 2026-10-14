import {
  isolatedDatabaseNameIsDedicated,
  parsePostgresTargetIdentity,
  postgresTargetsAreEquivalent,
} from "@/lib/testing/original-v1-database-url";
import {
  ORIGINAL_V1_ACCEPTANCE_FLAG,
  ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH,
  originalV1TargetFingerprint,
} from "@/lib/testing/original-v1-target-token";

export class OriginalV1AcceptanceConfigError extends Error {}

export const ORIGINAL_V1_ACCEPTANCE_ROLE_EMAILS = [
  "E2E_CLERK_ORG_ADMIN_EMAIL",
  "E2E_CLERK_TREASURER_EMAIL",
  "E2E_CLERK_DATA_ENTRY_EMAIL",
  "E2E_CLERK_REPORT_VIEWER_EMAIL",
  "E2E_CLERK_DONOR_A1_EMAIL",
  "E2E_CLERK_DONOR_A2_EMAIL",
  "E2E_CLERK_MULTI_ORG_EMAIL",
] as const;

export type OriginalV1AcceptanceRole =
  | "orgAdmin"
  | "treasurer"
  | "dataEntry"
  | "reportViewer"
  | "donorA1"
  | "donorA2"
  | "multiOrg";

export type OriginalV1AcceptanceConfig = {
  acceptanceEnabled: true;
  targetToken: string;
  e2eDatabaseUrl: string;
  appDatabaseUrl: string;
  workingDatabaseUrl: string;
  expectedFingerprint: string;
  baseUrl: string;
  clerkSecretKey: string;
  clerkPublishableKey: string;
  clerkOrgAId: string;
  clerkOrgBId: string;
  runId: string;
  prefix: string;
  emails: Record<OriginalV1AcceptanceRole, string>;
};

const EMAIL_KEYS: Array<{
  role: OriginalV1AcceptanceRole;
  env: (typeof ORIGINAL_V1_ACCEPTANCE_ROLE_EMAILS)[number];
}> = [
  { role: "orgAdmin", env: "E2E_CLERK_ORG_ADMIN_EMAIL" },
  { role: "treasurer", env: "E2E_CLERK_TREASURER_EMAIL" },
  { role: "dataEntry", env: "E2E_CLERK_DATA_ENTRY_EMAIL" },
  { role: "reportViewer", env: "E2E_CLERK_REPORT_VIEWER_EMAIL" },
  { role: "donorA1", env: "E2E_CLERK_DONOR_A1_EMAIL" },
  { role: "donorA2", env: "E2E_CLERK_DONOR_A2_EMAIL" },
  { role: "multiOrg", env: "E2E_CLERK_MULTI_ORG_EMAIL" },
];

function read(env: Record<string, string | undefined>, key: string) {
  return env[key]?.trim() ?? "";
}

function missingMessage(missing: string[]) {
  return [
    "Original v1 role/tenant acceptance is blocked until isolated test-target configuration is complete.",
    `Missing or invalid: ${missing.join(", ")}.`,
    "Set BITS_E2E_ACCEPTANCE=1, a unique BITS_E2E_DATABASE_URL (never DATABASE_URL), matching BITS_E2E_APP_DATABASE_URL, BITS_E2E_TARGET_TOKEN, Clerk development keys, two Clerk organization IDs, and the seven fictional Clerk identity emails.",
    "Start the app server with DATABASE_URL equal to BITS_E2E_DATABASE_URL and BITS_E2E_ACCEPTANCE=1. Ordinary smoke tests may skip; this command must not.",
  ].join(" ");
}

export function parseOriginalV1AcceptanceConfig(
  env: Record<string, string | undefined> = process.env,
): OriginalV1AcceptanceConfig {
  const missing: string[] = [];

  if (read(env, "BITS_E2E_ACCEPTANCE") !== ORIGINAL_V1_ACCEPTANCE_FLAG) {
    missing.push("BITS_E2E_ACCEPTANCE=1");
  }

  const targetToken = read(env, "BITS_E2E_TARGET_TOKEN");
  if (targetToken.length < ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH) {
    missing.push(
      `BITS_E2E_TARGET_TOKEN (>=${ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH} characters)`,
    );
  }

  const e2eDatabaseUrl = read(env, "BITS_E2E_DATABASE_URL");
  if (!e2eDatabaseUrl) missing.push("BITS_E2E_DATABASE_URL");

  const appDatabaseUrl = read(env, "BITS_E2E_APP_DATABASE_URL");
  if (!appDatabaseUrl) missing.push("BITS_E2E_APP_DATABASE_URL");

  const workingDatabaseUrl = read(env, "DATABASE_URL");
  if (!workingDatabaseUrl) missing.push("DATABASE_URL");

  const clerkSecretKey = read(env, "CLERK_SECRET_KEY");
  if (!clerkSecretKey) missing.push("CLERK_SECRET_KEY");
  else if (!clerkSecretKey.startsWith("sk_test_")) {
    missing.push("CLERK_SECRET_KEY (development sk_test_ only)");
  }

  const clerkPublishableKey = read(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  if (!clerkPublishableKey) missing.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  else if (!clerkPublishableKey.startsWith("pk_test_")) {
    missing.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (development pk_test_ only)");
  }

  const clerkOrgAId = read(env, "E2E_CLERK_ORG_A_ID");
  if (!clerkOrgAId) missing.push("E2E_CLERK_ORG_A_ID");
  const clerkOrgBId = read(env, "E2E_CLERK_ORG_B_ID");
  if (!clerkOrgBId) missing.push("E2E_CLERK_ORG_B_ID");

  const baseUrl =
    read(env, "PLAYWRIGHT_BASE_URL") || read(env, "APP_BASE_URL");
  if (!baseUrl) missing.push("PLAYWRIGHT_BASE_URL");

  const emails = {} as Record<OriginalV1AcceptanceRole, string>;
  for (const row of EMAIL_KEYS) {
    const value = read(env, row.env);
    if (!value) missing.push(row.env);
    else emails[row.role] = value;
  }

  if (
    e2eDatabaseUrl &&
    workingDatabaseUrl &&
    postgresTargetsAreEquivalent(e2eDatabaseUrl, workingDatabaseUrl)
  ) {
    throw new OriginalV1AcceptanceConfigError(
      "BITS_E2E_DATABASE_URL must not target the same PostgreSQL database as DATABASE_URL, including localhost/127.0.0.1 aliases. The fixture runner never writes to the working application database.",
    );
  }

  if (e2eDatabaseUrl) {
    const isolated = parsePostgresTargetIdentity(e2eDatabaseUrl);
    if (!isolated || !isolatedDatabaseNameIsDedicated(isolated.database)) {
      throw new OriginalV1AcceptanceConfigError(
        "BITS_E2E_DATABASE_URL must use a dedicated isolated database name such as bits_e2e. Working names like bits or postgres are rejected.",
      );
    }
  }

  if (
    e2eDatabaseUrl &&
    appDatabaseUrl &&
    !postgresTargetsAreEquivalent(e2eDatabaseUrl, appDatabaseUrl)
  ) {
    throw new OriginalV1AcceptanceConfigError(
      "BITS_E2E_APP_DATABASE_URL must identify the same isolated database as BITS_E2E_DATABASE_URL so the acceptance server and fixture runner stay aligned.",
    );
  }

  if (clerkOrgAId && clerkOrgBId && clerkOrgAId === clerkOrgBId) {
    throw new OriginalV1AcceptanceConfigError(
      "E2E_CLERK_ORG_A_ID and E2E_CLERK_ORG_B_ID must identify two different Clerk organizations.",
    );
  }

  const uniqueEmails = new Set(Object.values(emails));
  if (
    uniqueEmails.size > 0 &&
    uniqueEmails.size !== Object.keys(emails).length
  ) {
    throw new OriginalV1AcceptanceConfigError(
      "Each original-v1 acceptance role must use a distinct Clerk email identity.",
    );
  }

  if (missing.length) {
    throw new OriginalV1AcceptanceConfigError(missingMessage(missing));
  }

  const runId = read(env, "BITS_E2E_RUN_ID") || "local";
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(runId)) {
    throw new OriginalV1AcceptanceConfigError(
      "BITS_E2E_RUN_ID may contain only letters, numbers, underscores, or hyphens (max 32).",
    );
  }

  return {
    acceptanceEnabled: true,
    targetToken,
    e2eDatabaseUrl,
    appDatabaseUrl,
    workingDatabaseUrl,
    expectedFingerprint: originalV1TargetFingerprint(
      targetToken,
      e2eDatabaseUrl,
    ),
    baseUrl: baseUrl.replace(/\/+$/, ""),
    clerkSecretKey,
    clerkPublishableKey,
    clerkOrgAId,
    clerkOrgBId,
    runId,
    prefix: `E2E07-${runId}-`,
    emails,
  };
}
