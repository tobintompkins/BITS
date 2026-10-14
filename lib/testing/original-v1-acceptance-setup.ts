import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  ORIGINAL_V1_LOCAL_ENV_RELATIVE,
  ORIGINAL_V1_LOCAL_STORAGE_RELATIVE,
  ORIGINAL_V1_LOCAL_TOKEN_RELATIVE,
} from "@/lib/testing/original-v1-acceptance-env";
import { parsePostgresTargetIdentity } from "@/lib/testing/original-v1-database-url";

export class OriginalV1AcceptanceSetupError extends Error {}

const ISOLATED_DATABASE_NAME = "bits_e2e";

export function deriveIsolatedDatabaseUrl(
  workingUrl: string,
  databaseName = ISOLATED_DATABASE_NAME,
) {
  const identity = parsePostgresTargetIdentity(workingUrl);
  if (!identity) {
    throw new OriginalV1AcceptanceSetupError(
      "DATABASE_URL is not a usable PostgreSQL URL, so an isolated sibling database cannot be derived.",
    );
  }
  if (identity.database === databaseName) {
    throw new OriginalV1AcceptanceSetupError(
      "DATABASE_URL already points at the isolated database name. Keep the working church URL unchanged.",
    );
  }

  const parsed = new URL(workingUrl.trim());
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

export function isolatedOrganizationsLookOwned(
  rows: Array<{ name: string | null; slug: string | null }>,
) {
  if (rows.length === 0) {
    return { ok: true as const };
  }

  const foreign = rows.filter((row) => {
    const name = row.name?.trim() ?? "";
    const slug = row.slug?.trim() ?? "";
    return !name.startsWith("E2E07") && !slug.toLowerCase().startsWith("e2e07-");
  });
  if (foreign.length > 0) {
    return {
      ok: false as const,
      reason:
        "bits_e2e already contains organizations that do not look like original-v1 acceptance fixtures. Setup will not write to an ambiguous database.",
    };
  }
  return { ok: true as const };
}

export function readOrCreateAcceptanceToken(cwd = process.cwd()) {
  const tokenPath = path.join(cwd, ORIGINAL_V1_LOCAL_TOKEN_RELATIVE);
  mkdirSync(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
  if (existsSync(tokenPath)) {
    const existing = readFileSync(tokenPath, "utf8").trim();
    if (existing.length >= 16) {
      return { token: existing, created: false, tokenPath };
    }
  }
  const token = randomBytes(32).toString("hex");
  writeFileSync(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  return { token, created: true, tokenPath };
}

export function ensureAcceptanceStorageRoot(cwd = process.cwd()) {
  const storageRoot = path.join(cwd, ORIGINAL_V1_LOCAL_STORAGE_RELATIVE);
  mkdirSync(storageRoot, { recursive: true, mode: 0o700 });
  return storageRoot;
}

export function mergeLocalAcceptanceEnvFile(
  cwd: string,
  values: Record<string, string>,
) {
  const envPath = path.join(cwd, ORIGINAL_V1_LOCAL_ENV_RELATIVE);
  mkdirSync(path.dirname(envPath), { recursive: true, mode: 0o700 });
  const existing = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : "# Gitignored original-v1 acceptance settings. Do not commit.\n";
  const present = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1])
      .filter((key): key is string => Boolean(key)),
  );

  const additions: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (!value || present.has(key)) continue;
    additions.push(`${key}=${value}`);
  }
  if (additions.length === 0) {
    return { envPath, wrote: false };
  }
  const next = existing.endsWith("\n") || existing.length === 0
    ? `${existing}${additions.join("\n")}\n`
    : `${existing}\n${additions.join("\n")}\n`;
  writeFileSync(envPath, next, { encoding: "utf8", mode: 0o600 });
  return { envPath, wrote: true };
}

export function defaultIsolatedPlaywrightBaseUrl() {
  return "http://127.0.0.1:3017";
}
