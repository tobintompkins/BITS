import { ORIGINAL_V1_ACCEPTANCE_ROLE_EMAILS } from "@/lib/testing/original-v1-acceptance-config";
import {
  describePostgresTarget,
  isolatedDatabaseNameIsDedicated,
  parsePostgresTargetIdentity,
  postgresTargetsAreEquivalent,
} from "@/lib/testing/original-v1-database-url";
import {
  ORIGINAL_V1_ACCEPTANCE_FLAG,
  ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH,
  originalV1TargetFingerprint,
  timingSafeStringEquals,
} from "@/lib/testing/original-v1-target-token";

export class OriginalV1AcceptancePreflightError extends Error {}

export type OriginalV1PreflightIssue = {
  code: string;
  message: string;
  names?: string[];
};

export type OriginalV1PreflightReport = {
  ok: boolean;
  readyForFixtures: boolean;
  readyForLiveAcceptance: boolean;
  issues: OriginalV1PreflightIssue[];
  notes: string[];
  isolatedDatabase: string | null;
  isolatedHostKind: string | null;
};

const EMAIL_KEYS = [...ORIGINAL_V1_ACCEPTANCE_ROLE_EMAILS];

function read(env: Record<string, string | undefined>, key: string) {
  return env[key]?.trim() ?? "";
}

function addIssue(
  issues: OriginalV1PreflightIssue[],
  issue: OriginalV1PreflightIssue,
) {
  issues.push(issue);
}

export function diagnoseOriginalV1AcceptanceEnv(
  env: Record<string, string | undefined> = process.env,
): OriginalV1PreflightReport {
  const issues: OriginalV1PreflightIssue[] = [];
  const notes: string[] = [];
  const missing: string[] = [];

  if (read(env, "BITS_E2E_ACCEPTANCE") !== ORIGINAL_V1_ACCEPTANCE_FLAG) {
    missing.push("BITS_E2E_ACCEPTANCE");
  }

  const targetToken = read(env, "BITS_E2E_TARGET_TOKEN");
  if (targetToken.length < ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH) {
    missing.push("BITS_E2E_TARGET_TOKEN");
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
    addIssue(issues, {
      code: "clerk_production_secret",
      names: ["CLERK_SECRET_KEY"],
      message:
        "CLERK_SECRET_KEY must be a Clerk development sk_test_ key. Production secrets are rejected.",
    });
  }

  const clerkPublishableKey = read(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  if (!clerkPublishableKey) missing.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  else if (!clerkPublishableKey.startsWith("pk_test_")) {
    addIssue(issues, {
      code: "clerk_production_publishable",
      names: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
      message:
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a Clerk development pk_test_ key.",
    });
  }

  if (!read(env, "E2E_CLERK_ORG_A_ID")) missing.push("E2E_CLERK_ORG_A_ID");
  if (!read(env, "E2E_CLERK_ORG_B_ID")) missing.push("E2E_CLERK_ORG_B_ID");
  if (
    read(env, "E2E_CLERK_ORG_A_ID") &&
    read(env, "E2E_CLERK_ORG_A_ID") === read(env, "E2E_CLERK_ORG_B_ID")
  ) {
    addIssue(issues, {
      code: "clerk_orgs_not_distinct",
      names: ["E2E_CLERK_ORG_A_ID", "E2E_CLERK_ORG_B_ID"],
      message: "Church A and Church B must be two different Clerk organizations.",
    });
  }

  if (!read(env, "PLAYWRIGHT_BASE_URL") && !read(env, "APP_BASE_URL")) {
    missing.push("PLAYWRIGHT_BASE_URL");
  }

  const emails: string[] = [];
  for (const name of EMAIL_KEYS) {
    const value = read(env, name);
    if (!value) missing.push(name);
    else emails.push(value);
  }
  if (emails.length === EMAIL_KEYS.length && new Set(emails).size !== emails.length) {
    addIssue(issues, {
      code: "clerk_emails_not_distinct",
      names: [...EMAIL_KEYS],
      message: "Each original-v1 acceptance role must use a distinct Clerk email identity.",
    });
  }

  if (missing.length) {
    addIssue(issues, {
      code: "missing_variables",
      names: missing,
      message: `Missing or invalid: ${missing.join(", ")}.`,
    });
  }

  let isolatedDatabase: string | null = null;
  let isolatedHostKind: string | null = null;
  if (e2eDatabaseUrl) {
    const described = describePostgresTarget(e2eDatabaseUrl);
    isolatedDatabase = described.database;
    isolatedHostKind = described.hostKind;
    const identity = parsePostgresTargetIdentity(e2eDatabaseUrl);
    if (!identity || !isolatedDatabaseNameIsDedicated(identity.database)) {
      addIssue(issues, {
        code: "isolated_database_not_dedicated",
        names: ["BITS_E2E_DATABASE_URL"],
        message:
          "BITS_E2E_DATABASE_URL must use a dedicated isolated database name such as bits_e2e.",
      });
    }
  }

  if (
    e2eDatabaseUrl &&
    workingDatabaseUrl &&
    postgresTargetsAreEquivalent(e2eDatabaseUrl, workingDatabaseUrl)
  ) {
    addIssue(issues, {
      code: "working_database_alias",
      names: ["BITS_E2E_DATABASE_URL", "DATABASE_URL"],
      message:
        "The isolated target is an alias of the working DATABASE_URL. Fixture writes are blocked.",
    });
  }

  if (
    e2eDatabaseUrl &&
    appDatabaseUrl &&
    !postgresTargetsAreEquivalent(e2eDatabaseUrl, appDatabaseUrl)
  ) {
    addIssue(issues, {
      code: "app_database_mismatch",
      names: ["BITS_E2E_APP_DATABASE_URL", "BITS_E2E_DATABASE_URL"],
      message:
        "BITS_E2E_APP_DATABASE_URL must identify the same isolated database as BITS_E2E_DATABASE_URL.",
    });
  }

  const nodeEnv = read(env, "NODE_ENV");
  if (nodeEnv === "production") {
    addIssue(issues, {
      code: "production_runtime",
      names: ["NODE_ENV"],
      message:
        "Original v1 acceptance refuses a production NODE_ENV. Use the isolated development server.",
    });
  }

  notes.push(
    "This diagnostic never prints secrets, tokens, emails, or connection strings.",
  );
  notes.push(
    "BITS fixture roles (ORG_ADMIN, TREASURER, DATA_ENTRY, REPORT_VIEWER, DONOR) are assigned by the fixture runner, not by Clerk dashboard roles.",
  );

  const blockingCodes = new Set(issues.map((issue) => issue.code));
  const readyForFixtures =
    !blockingCodes.has("missing_variables") &&
    !blockingCodes.has("working_database_alias") &&
    !blockingCodes.has("isolated_database_not_dedicated") &&
    !blockingCodes.has("app_database_mismatch") &&
    !blockingCodes.has("clerk_production_secret") &&
    !blockingCodes.has("clerk_production_publishable") &&
    !blockingCodes.has("clerk_orgs_not_distinct") &&
    !blockingCodes.has("clerk_emails_not_distinct") &&
    !blockingCodes.has("production_runtime");

  return {
    ok: issues.length === 0,
    readyForFixtures,
    readyForLiveAcceptance: false,
    issues,
    notes,
    isolatedDatabase,
    isolatedHostKind,
  };
}

export async function probeOriginalV1AcceptanceTarget(input: {
  baseUrl: string;
  targetToken: string;
  e2eDatabaseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<OriginalV1PreflightIssue | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = `${input.baseUrl.replace(/\/+$/, "")}/api/e2e/original-v1-target`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${input.targetToken}` },
    });
  } catch {
    return {
      code: "server_unreachable",
      names: ["PLAYWRIGHT_BASE_URL"],
      message:
        "The acceptance server is not reachable. Start a dedicated app process against bits_e2e with BITS_E2E_ACCEPTANCE=1.",
    };
  }

  if (response.status === 404) {
    return {
      code: "server_not_acceptance_target",
      names: ["BITS_E2E_ACCEPTANCE", "PLAYWRIGHT_BASE_URL"],
      message:
        "The server at PLAYWRIGHT_BASE_URL is not the isolated original-v1 target. Fixture writes were not sent.",
    };
  }
  if (!response.ok) {
    return {
      code: "server_token_rejected",
      names: ["BITS_E2E_TARGET_TOKEN"],
      message: "The isolated-target probe rejected the configured token.",
    };
  }

  const body = (await response.json()) as { fingerprint?: string };
  const expected = originalV1TargetFingerprint(
    input.targetToken,
    input.e2eDatabaseUrl,
  );
  if (!body.fingerprint || !timingSafeStringEquals(expected, body.fingerprint)) {
    return {
      code: "server_database_mismatch",
      names: ["DATABASE_URL", "BITS_E2E_DATABASE_URL"],
      message:
        "The running server DATABASE_URL does not match the isolated bits_e2e target.",
    };
  }
  return null;
}

export function formatOriginalV1PreflightReport(report: OriginalV1PreflightReport) {
  const lines = [
    `ok=${report.ok}`,
    `readyForFixtures=${report.readyForFixtures}`,
    `readyForLiveAcceptance=${report.readyForLiveAcceptance}`,
    `isolatedDatabase=${report.isolatedDatabase ?? "unknown"}`,
    `isolatedHostKind=${report.isolatedHostKind ?? "unknown"}`,
  ];
  for (const issue of report.issues) {
    const names = issue.names?.length ? ` names=${issue.names.join(",")}` : "";
    lines.push(`issue ${issue.code}${names}: ${issue.message}`);
  }
  for (const note of report.notes) {
    lines.push(`note: ${note}`);
  }
  return `${lines.join("\n")}\n`;
}

export function assertOriginalV1PreflightReady(report: OriginalV1PreflightReport) {
  if (report.readyForFixtures && report.issues.length === 0) {
    return;
  }
  throw new OriginalV1AcceptancePreflightError(
    formatOriginalV1PreflightReport(report).trim(),
  );
}
