import {
  isolatedDatabaseNameIsDedicated,
  parsePostgresTargetIdentity,
  postgresTargetsAreEquivalent,
} from "@/lib/testing/original-v1-database-url";
import { parseEnvFileContents } from "@/lib/testing/original-v1-acceptance-env";
import { ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH } from "@/lib/testing/original-v1-target-token";

export const ORIGINAL_V1_NODE_ENGINE = ">=24 <25";
export const ORIGINAL_V1_NPM_ENGINE = ">=10";
export const RAILPACK_NODE_VERSION_HINT = "24";

/**
 * Official Railpack Node order (https://railpack.com/languages/node/).
 * `engines.node` beats `.nvmrc`. `RAILPACK_NODE_VERSION` beats engines.
 * That variable is a host env name. The unapplied TEST file sets it on the service.
 */
export const RAILPACK_NODE_PRECEDENCE = [
  "RAILPACK_NODE_VERSION",
  "package.json devEngines.runtime",
  "package.json engines.node",
  ".nvmrc",
  ".node-version",
  "mise.toml / .tool-versions",
  "default LTS",
] as const;

export const PRISMA_GENERATE_UNUSED_DATABASE_URL =
  "postgresql://127.0.0.1:1/prisma_generate_unused";

export const RUNTIME_SMOKE_RSYNC_EXCLUDES = [
  "node_modules",
  ".next",
  ".git",
  "e2e/.local",
  "/storage/",
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
  ".env.test.local",
  "app/generated",
  ".tmp",
  "backups",
  "*.backup",
  "*.pem",
] as const;

const PLACEHOLDER_KEY_PATTERN = /placeholder|example|changeme|unused|fake/i;
const SECRET_LOG_PATTERN =
  /(sk_test_|sk_live_|pk_test_|pk_live_|whsec_)[A-Za-z0-9+/=_-]+/g;

export type ClerkDevelopmentKeyClass =
  | {
      ok: true;
      publishablePrefix: "pk_test_";
      secretPrefix: "sk_test_";
    }
  | { ok: false; reason: string };

export type IsolatedSmokeDatabase =
  | { kind: "omit"; reason: string }
  | { kind: "isolated"; database: string; isolatedUrl: string }
  | { kind: "blocked"; reason: string };

export type RuntimeSmokeHttpCheck = {
  path: string;
  status: number;
  location: string | null;
  bodyHasFingerprint: boolean;
  bodyLooksPrivate: boolean;
  safeBodyHint: string | null;
};

function readTrimmed(
  env: Record<string, string | undefined>,
  key: string,
) {
  return env[key]?.trim() ?? "";
}

function isPlaceholderClerkKey(value: string, prefix: string) {
  const rest = value.slice(prefix.length);
  if (rest.length < 16) return true;
  if (/^x+$/i.test(rest)) return true;
  return PLACEHOLDER_KEY_PATTERN.test(rest);
}

export function classifyClerkDevelopmentKeys(
  env: Record<string, string | undefined>,
): ClerkDevelopmentKeyClass {
  const publishable = readTrimmed(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const secret = readTrimmed(env, "CLERK_SECRET_KEY");

  if (!publishable || !secret) {
    return {
      ok: false,
      reason:
        "Existing local Clerk Development keys are required. NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY were not both present.",
    };
  }
  if (publishable.startsWith("pk_live_") || secret.startsWith("sk_live_")) {
    return {
      ok: false,
      reason:
        "Live Clerk keys are rejected. Isolated production-mode smoke uses existing Development pk_test_ / sk_test_ keys only.",
    };
  }
  if (!publishable.startsWith("pk_test_") || !secret.startsWith("sk_test_")) {
    return {
      ok: false,
      reason:
        "Clerk keys must use Development prefixes pk_test_ and sk_test_. Placeholder and live keys are rejected.",
    };
  }
  if (
    isPlaceholderClerkKey(publishable, "pk_test_") ||
    isPlaceholderClerkKey(secret, "sk_test_")
  ) {
    return {
      ok: false,
      reason:
        "Placeholder Clerk keys are rejected. Isolated smoke loads existing Development keys only.",
    };
  }

  return {
    ok: true,
    publishablePrefix: "pk_test_",
    secretPrefix: "sk_test_",
  };
}

export function selectIsolatedSmokeDatabase(
  env: Record<string, string | undefined>,
): IsolatedSmokeDatabase {
  const isolatedUrl = readTrimmed(env, "BITS_E2E_DATABASE_URL");
  const workingUrl =
    readTrimmed(env, "BITS_WORKING_DATABASE_URL") ||
    readTrimmed(env, "DATABASE_URL");

  if (!isolatedUrl) {
    return {
      kind: "omit",
      reason:
        "No BITS_E2E_DATABASE_URL. Public /visit and production e2e 404 do not receive a working DATABASE_URL.",
    };
  }

  const isolatedIdentity = parsePostgresTargetIdentity(isolatedUrl);
  if (!isolatedIdentity) {
    return {
      kind: "blocked",
      reason:
        "BITS_E2E_DATABASE_URL destination syntax is ambiguous. Isolated smoke will not pass a database URL.",
    };
  }
  if (!isolatedDatabaseNameIsDedicated(isolatedIdentity.database)) {
    return {
      kind: "blocked",
      reason:
        "BITS_E2E_DATABASE_URL must be a dedicated isolated database such as bits_e2e. Working names are rejected.",
    };
  }
  if (workingUrl && postgresTargetsAreEquivalent(isolatedUrl, workingUrl)) {
    return {
      kind: "blocked",
      reason:
        "BITS_E2E_DATABASE_URL must not identify the same PostgreSQL database as the working DATABASE_URL.",
    };
  }

  return {
    kind: "isolated",
    database: isolatedIdentity.database,
    isolatedUrl,
  };
}

export function mergeClerkKeySources(input: {
  processEnv: Record<string, string | undefined>;
  workingEnvFile?: Record<string, string>;
  workingLocalEnvFile?: Record<string, string>;
}) {
  const publishable =
    readTrimmed(input.processEnv, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") ||
    input.workingLocalEnvFile?.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
    input.workingEnvFile?.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
    "";
  const secret =
    readTrimmed(input.processEnv, "CLERK_SECRET_KEY") ||
    input.workingLocalEnvFile?.CLERK_SECRET_KEY?.trim() ||
    input.workingEnvFile?.CLERK_SECRET_KEY?.trim() ||
    "";
  return {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishable,
    CLERK_SECRET_KEY: secret,
  };
}

export function parseWorkingEnvFileContents(contents: string) {
  return parseEnvFileContents(contents);
}

export function runtimeSmokeRsyncArgs(source: string, dest: string) {
  return [
    "-a",
    ...RUNTIME_SMOKE_RSYNC_EXCLUDES.flatMap((pattern) => [
      "--exclude",
      pattern,
    ]),
    source.endsWith("/") ? source : `${source}/`,
    dest.endsWith("/") ? dest : `${dest}/`,
  ];
}

export function rsyncExcludeWouldDropLibStorage(
  excludes: readonly string[] = RUNTIME_SMOKE_RSYNC_EXCLUDES,
) {
  return excludes.some(
    (pattern) =>
      pattern === "storage" ||
      pattern === "storage/" ||
      pattern === "**/storage/**" ||
      pattern === "lib/storage" ||
      pattern === "lib/storage/",
  );
}

type SmokeChildInput = {
  path: string;
  home?: string;
  tmpdir?: string;
  lang?: string;
  port: number;
  publishableKey: string;
  secretKey: string;
  storageRoot: string;
  databaseUrl?: string;
  acceptance?: { token: string };
};

function inheritedRuntimeEnv(input: SmokeChildInput) {
  const env: Record<string, string> = {
    PATH: input.path,
    PORT: String(input.port),
    APP_BASE_URL: `http://127.0.0.1:${input.port}`,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: input.publishableKey,
    CLERK_SECRET_KEY: input.secretKey,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/dashboard",
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/dashboard",
    BITS_STAFF_INVITATION_PROVIDER: "mock",
    BITS_STATEMENT_PDF_BACKEND: "local",
    BITS_FILE_STORAGE_ROOT: input.storageRoot,
  };
  if (input.home) env.HOME = input.home;
  if (input.tmpdir) env.TMPDIR = input.tmpdir;
  if (input.lang) env.LANG = input.lang;
  return env;
}

export function buildRuntimeSmokeBuildEnv(
  input: SmokeChildInput,
): Record<string, string> {
  return {
    ...inheritedRuntimeEnv(input),
    NODE_ENV: "production",
    DATABASE_URL: PRISMA_GENERATE_UNUSED_DATABASE_URL,
  };
}

export function isolatedNextStartArgs(port: number) {
  return ["start", "-p", String(port)];
}

export function buildRuntimeSmokeStartEnv(input: SmokeChildInput) {
  const env: Record<string, string> = {
    ...inheritedRuntimeEnv(input),
    NODE_ENV: "production",
  };
  if (input.databaseUrl) {
    env.DATABASE_URL = input.databaseUrl;
  }
  if (input.acceptance) {
    env.BITS_E2E_ACCEPTANCE = "1";
    env.BITS_E2E_TARGET_TOKEN = input.acceptance.token;
  }
  return env;
}

export function redactRuntimeSmokeText(text: string) {
  return text
    .replace(SECRET_LOG_PATTERN, "$1[redacted]")
    .replace(/postgresql:\/\/\S+/gi, "postgresql://[redacted]");
}

export function redactRequestLocation(location: string | null | undefined) {
  if (!location) return null;
  try {
    if (location.startsWith("/")) {
      const url = new URL(location, "http://127.0.0.1");
      return url.pathname;
    }
    const url = new URL(location);
    return `${url.origin}${url.pathname}`;
  } catch {
    return location.split("?")[0] ?? null;
  }
}

export function classifyVisitHttp(check: RuntimeSmokeHttpCheck) {
  if (check.status === 200 && !check.bodyLooksPrivate) {
    return { ok: true as const, reason: "Unsigned /visit returned 200." };
  }
  if (check.status === 500) {
    return {
      ok: false as const,
      reason:
        "Unsigned /visit returned 500. That is a failed smoke, not process readiness.",
    };
  }
  return {
    ok: false as const,
    reason: `Unsigned /visit returned ${check.status} instead of 200.`,
  };
}

export function classifyProductionE2eHttp(check: RuntimeSmokeHttpCheck) {
  if (check.bodyHasFingerprint || check.bodyLooksPrivate) {
    return {
      ok: false as const,
      reason:
        "Production /api/e2e/original-v1-target exposed a fingerprint or private data.",
    };
  }
  if (check.status === 404) {
    return {
      ok: true as const,
      reason:
        "Production /api/e2e/original-v1-target returned 404 without a fingerprint.",
    };
  }
  if (check.status === 500) {
    return {
      ok: false as const,
      reason:
        "Production e2e probe returned 500. That is a failed smoke, not an expected 404.",
    };
  }
  return {
    ok: false as const,
    reason: `Production e2e probe returned ${check.status} instead of 404.`,
  };
}

export function classifyUnsignedStaffRedirect(check: RuntimeSmokeHttpCheck) {
  if (check.status === 200 || check.bodyLooksPrivate) {
    return {
      ok: false as const,
      reason:
        "Unsigned /batches returned private data or 200. Protected staff routes must not render unsigned.",
    };
  }
  if (check.status === 500) {
    return {
      ok: false as const,
      reason:
        "Unsigned /batches returned 500. That is a failed smoke, not a sign-in redirect.",
    };
  }
  const location = check.location ?? "";
  const signIn =
    location === "/sign-in" ||
    location.startsWith("/sign-in/") ||
    /clerk/i.test(location);
  if ((check.status === 302 || check.status === 307) && signIn) {
    return {
      ok: true as const,
      reason: "Unsigned /batches redirected toward sign-in.",
    };
  }
  return {
    ok: false as const,
    reason: `Unsigned /batches returned ${check.status} with location ${location || "(none)"}.`,
  };
}

export function inspectSmokeResponseBody(body: string) {
  const trimmed = body.trim();
  let parsed: unknown = null;
  try {
    parsed = trimmed ? JSON.parse(trimmed) : null;
  } catch {
    parsed = null;
  }
  const record =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  const redacted = redactRuntimeSmokeText(trimmed)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hintMatch =
    /Clerk[^.<:]{0,80}|keys are missing|Publishable key|secretKey|Prisma|DATABASE_URL|Not found/i.exec(
      redacted,
    );
  return {
    bodyHasFingerprint: Boolean(record?.fingerprint) || /fingerprint/i.test(trimmed),
    bodyLooksPrivate:
      Boolean(record?.ok) ||
      /totalAmount|household|donation|statement/i.test(trimmed),
    safeBodyHint: hintMatch
      ? redactRuntimeSmokeText(hintMatch[0]).slice(0, 160)
      : record && typeof record.error === "string"
        ? record.error.slice(0, 160)
        : redacted.slice(0, 160) || null,
  };
}

export function expectedProductionE2eStatus() {
  return 404;
}

export function syntheticProductionAcceptanceToken() {
  return "bits-runtime-smoke-token";
}

export function assertSyntheticAcceptanceToken(token: string) {
  return token.length >= ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH;
}

export function describeRuntimeSmokeChildEnv(env: Record<string, string>) {
  return {
    nodeEnv: env.NODE_ENV ?? "",
    hasPublishableKey: Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    publishablePrefix: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith(
      "pk_test_",
    )
      ? "pk_test_"
      : "",
    hasSecretKey: Boolean(env.CLERK_SECRET_KEY),
    secretPrefix: env.CLERK_SECRET_KEY?.startsWith("sk_test_")
      ? "sk_test_"
      : "",
    hasWorkingDatabaseUrl: false,
    hasDatabaseUrl: Boolean(env.DATABASE_URL),
    databaseIsGenerateUnused:
      env.DATABASE_URL === PRISMA_GENERATE_UNUSED_DATABASE_URL,
    hasStripe: Boolean(env.STRIPE_SECRET_KEY || env.STRIPE_WEBHOOK_SECRET),
    hasDirectUrl: Boolean(env.DIRECT_URL),
    invitationProvider: env.BITS_STAFF_INVITATION_PROVIDER ?? "",
    acceptanceFlag: env.BITS_E2E_ACCEPTANCE === "1",
  };
}
