import {
  isolatedDatabaseNameIsDedicated,
  parsePostgresTargetIdentity,
  postgresTargetsAreEquivalent,
} from "./original-v1-database-url";

export const BITS_ISOLATED_DATABASE_FLAG = "1";
export const BITS_ISOLATED_DATABASE_KEY = "BITS_ISOLATED_DATABASE";
export const BITS_WORKING_DATABASE_URL_KEY = "BITS_WORKING_DATABASE_URL";
export const BITS_ISOLATED_RUN_ID_KEY = "BITS_ISOLATED_RUN_ID";

export const ISOLATED_ONLY_TEST_GLOBS = [
  "**/*.concurrency.test.ts",
  "**/*.integration.test.ts",
  "server/services/staff-check-out.service.test.ts",
  "server/services/staff-party-check-in.service.test.ts",
  "server/services/qr-staff-check-in.service.test.ts",
  "server/services/check-in-station-lifecycle.service.test.ts",
  "server/services/staff-check-in-station-attribution.service.test.ts",
] as const;

export const MIXED_ISOLATED_TEST_GLOBS = [
  "server/services/staff-check-in.service.test.ts",
  "server/services/event-qr-pass-resolution.service.test.ts",
  "server/services/event-qr-pass-lifecycle.service.test.ts",
  "server/repositories/event-attendance.repository.test.ts",
  "server/repositories/event-check-in-station.repository.test.ts",
  "server/repositories/event-qr-pass.repository.test.ts",
] as const;

export const ISOLATED_DATABASE_TEST_GLOBS = [
  ...ISOLATED_ONLY_TEST_GLOBS,
  ...MIXED_ISOLATED_TEST_GLOBS,
] as const;

export const BITS_ISOLATED_REQUIRE_DB_KEY = "BITS_ISOLATED_REQUIRE_DB";

export type IsolatedDatabasePreflight =
  | {
      ok: true;
      isolatedUrl: string;
      workingUrl: string;
      isolatedDatabase: string;
    }
  | { ok: false; reason: string };

export type IsolatedDatabaseRuntime = IsolatedDatabasePreflight;

function classifyIsolatedVersusWorking(
  isolatedUrl: string,
  workingUrl: string,
  workingMissingReason: string,
): IsolatedDatabasePreflight {
  if (!isolatedUrl) {
    return {
      ok: false,
      reason:
        "BITS_E2E_DATABASE_URL is required. Real-database tests never fall back to the working DATABASE_URL.",
    };
  }

  const isolatedIdentity = parsePostgresTargetIdentity(isolatedUrl);
  if (!isolatedIdentity) {
    return {
      ok: false,
      reason:
        "BITS_E2E_DATABASE_URL destination syntax is ambiguous or unsupported. Real-database tests are blocked.",
    };
  }
  if (!isolatedDatabaseNameIsDedicated(isolatedIdentity.database)) {
    return {
      ok: false,
      reason:
        "BITS_E2E_DATABASE_URL must be a dedicated isolated database such as bits_e2e. An e2e substring in another URL part is not isolation evidence. Working names like bits or postgres are rejected.",
    };
  }

  if (!workingUrl) {
    return { ok: false, reason: workingMissingReason };
  }
  const workingIdentity = parsePostgresTargetIdentity(workingUrl);
  if (!workingIdentity) {
    return {
      ok: false,
      reason:
        "Working DATABASE_URL destination syntax is ambiguous or unsupported. Real-database tests are blocked.",
    };
  }
  if (postgresTargetsAreEquivalent(isolatedUrl, workingUrl)) {
    return {
      ok: false,
      reason:
        "BITS_E2E_DATABASE_URL must not identify the same PostgreSQL database as the working DATABASE_URL, including different usernames, localhost/127.0.0.1 aliases, and driver host/port query overrides.",
    };
  }

  return {
    ok: true,
    isolatedUrl,
    workingUrl,
    isolatedDatabase: isolatedIdentity.database,
  };
}

export function readWorkingDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env[BITS_WORKING_DATABASE_URL_KEY]?.trim() ||
    env.DATABASE_URL?.trim() ||
    ""
  );
}

export function readPreservedWorkingDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
) {
  return env[BITS_WORKING_DATABASE_URL_KEY]?.trim() || "";
}

export function classifyIsolatedDatabasePreflight(
  env: Record<string, string | undefined> = process.env,
): IsolatedDatabasePreflight {
  return classifyIsolatedVersusWorking(
    env.BITS_E2E_DATABASE_URL?.trim() ?? "",
    readWorkingDatabaseUrl(env),
    "The original working DATABASE_URL is required for alias comparison before any isolated test connection.",
  );
}

export function classifyIsolatedDatabaseRuntime(
  env: Record<string, string | undefined> = process.env,
): IsolatedDatabaseRuntime {
  if (env[BITS_ISOLATED_DATABASE_KEY] !== BITS_ISOLATED_DATABASE_FLAG) {
    return {
      ok: false,
      reason: isolatedPrismaBlockedMessage(),
    };
  }

  const preservedWorking = readPreservedWorkingDatabaseUrl(env);
  const versusWorking = classifyIsolatedVersusWorking(
    env.BITS_E2E_DATABASE_URL?.trim() ?? "",
    preservedWorking,
    "BITS_WORKING_DATABASE_URL must preserve the original working destination in an isolated child. A retargeted DATABASE_URL is not the original.",
  );
  if (!versusWorking.ok) return versusWorking;

  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) {
    return {
      ok: false,
      reason:
        "DATABASE_URL must identify the isolated destination in a marked child. Real test clients never fall back to the working database.",
    };
  }
  if (!parsePostgresTargetIdentity(databaseUrl)) {
    return {
      ok: false,
      reason:
        "DATABASE_URL destination syntax is ambiguous or unsupported. Real-database tests are blocked.",
    };
  }
  if (!postgresTargetsAreEquivalent(databaseUrl, versusWorking.isolatedUrl)) {
    return {
      ok: false,
      reason:
        "DATABASE_URL must identify the same PostgreSQL database as BITS_E2E_DATABASE_URL. Real test clients never use a different destination than the isolated target.",
    };
  }
  if (postgresTargetsAreEquivalent(databaseUrl, versusWorking.workingUrl)) {
    return {
      ok: false,
      reason:
        "DATABASE_URL must not identify the working database while isolated tests are running.",
    };
  }

  return versusWorking;
}

export function isIsolatedDatabaseReady(
  env: Record<string, string | undefined> = process.env,
) {
  return classifyIsolatedDatabaseRuntime(env).ok;
}

export function isolatedDatabaseRunEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  const runtime = classifyIsolatedDatabaseRuntime(env);
  if (runtime.ok) return true;
  if (env[BITS_ISOLATED_REQUIRE_DB_KEY] === BITS_ISOLATED_DATABASE_FLAG) {
    throw new Error(runtime.reason);
  }
  return false;
}

export function isolatedConnectionString(
  env: Record<string, string | undefined> = process.env,
) {
  const runtime = classifyIsolatedDatabaseRuntime(env);
  if (!runtime.ok) throw new Error(runtime.reason);
  return runtime.isolatedUrl;
}

export function isolatedTestChildEnv(
  preflight: Extract<IsolatedDatabasePreflight, { ok: true }>,
  runId: string,
  parentEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...parentEnv,
    [BITS_WORKING_DATABASE_URL_KEY]: preflight.workingUrl,
    DATABASE_URL: preflight.isolatedUrl,
    BITS_E2E_DATABASE_URL: preflight.isolatedUrl,
    [BITS_ISOLATED_DATABASE_KEY]: BITS_ISOLATED_DATABASE_FLAG,
    [BITS_ISOLATED_REQUIRE_DB_KEY]: BITS_ISOLATED_DATABASE_FLAG,
    [BITS_ISOLATED_RUN_ID_KEY]: runId,
  };
}

export function isolatedPrismaBlockedMessage() {
  return "Real Prisma construction is blocked during unit tests. Mock @/lib/db/prisma or run npm run test:isolated against a verified bits_e2e database.";
}

const LOCAL_DATABASE_UNAVAILABLE =
  "Local database service is unavailable (ECONNREFUSED). Isolated tests were not run. No database was migrated or reset.";

export function describeIsolatedRunnerFailure(error: unknown): string {
  return sanitizeIsolatedRunnerText(describeIsolatedRunnerFailureRaw(error));
}

function describeIsolatedRunnerFailureRaw(error: unknown): string {
  if (error instanceof AggregateError) {
    const nested = error.errors.map((item) => describeIsolatedRunnerFailureRaw(item));
    if (nested.some((item) => item.includes("ECONNREFUSED"))) {
      return LOCAL_DATABASE_UNAVAILABLE;
    }
    return nested.filter(Boolean).join("; ") || "Isolated database command failed.";
  }
  if (error instanceof Error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ECONNREFUSED") return LOCAL_DATABASE_UNAVAILABLE;
    const parts = [err.code, err.syscall, err.message].filter(
      (part) => typeof part === "string" && part.trim() !== "",
    );
    return parts.join(" ") || error.name || "Isolated database command failed.";
  }
  return "isolated tests failed";
}

export function sanitizeIsolatedRunnerText(message: string) {
  const redacted = message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-database-url]")
    .replace(/\b(password|pwd)=([^\s&]+)/gi, "$1=[redacted]");
  return redacted.trim()
    ? redacted
    : "Isolated database command failed without a message.";
}
