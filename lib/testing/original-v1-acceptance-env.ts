import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { config as loadDotenv } from "dotenv";

export const ORIGINAL_V1_LOCAL_ENV_RELATIVE = "e2e/.local/acceptance.env";
export const ORIGINAL_V1_LOCAL_TOKEN_RELATIVE = "e2e/.local/target-token";
export const ORIGINAL_V1_LOCAL_STORAGE_RELATIVE = "e2e/.local/statement-storage";

export const ORIGINAL_V1_ISOLATED_ENV_KEYS = [
  "BITS_E2E_ACCEPTANCE",
  "BITS_E2E_TARGET_TOKEN",
  "BITS_E2E_DATABASE_URL",
  "BITS_E2E_APP_DATABASE_URL",
  "BITS_E2E_RUN_ID",
  "PLAYWRIGHT_BASE_URL",
  "BITS_FILE_STORAGE_ROOT",
  "BITS_STATEMENT_PDF_BACKEND",
  "E2E_CLERK_ORG_A_ID",
  "E2E_CLERK_ORG_B_ID",
  "E2E_CLERK_ORG_ADMIN_EMAIL",
  "E2E_CLERK_TREASURER_EMAIL",
  "E2E_CLERK_DATA_ENTRY_EMAIL",
  "E2E_CLERK_REPORT_VIEWER_EMAIL",
  "E2E_CLERK_DONOR_A1_EMAIL",
  "E2E_CLERK_DONOR_A2_EMAIL",
  "E2E_CLERK_MULTI_ORG_EMAIL",
] as const;

function nonemptyKeys(env: Record<string, string | undefined>) {
  return new Set(
    Object.entries(env)
      .filter(([, value]) => value !== undefined && value.trim() !== "")
      .map(([key]) => key),
  );
}

export function parseEnvFileContents(contents: string) {
  const values: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      line,
    );
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

export function applyOriginalV1LocalAcceptanceEnv(
  env: Record<string, string | undefined>,
  localValues: Record<string, string>,
  presetKeys: Set<string>,
) {
  for (const key of ORIGINAL_V1_ISOLATED_ENV_KEYS) {
    if (presetKeys.has(key)) continue;
    const value = localValues[key]?.trim();
    if (value) env[key] = value;
  }
  return env;
}

/**
 * Load `.env` without clobbering the process, then overlay gitignored
 * `e2e/.local/acceptance.env` for isolated keys only. Explicit process
 * exports always win so a working `.env` cannot retarget the suite.
 */
export function loadOriginalV1AcceptanceEnvFiles(cwd = process.cwd()) {
  const presetKeys = nonemptyKeys(process.env);
  loadDotenv({ path: path.join(cwd, ".env") });

  const localPath = path.join(cwd, ORIGINAL_V1_LOCAL_ENV_RELATIVE);
  if (!existsSync(localPath)) {
    return { localPath, loadedLocal: false };
  }

  const localValues = parseEnvFileContents(readFileSync(localPath, "utf8"));
  applyOriginalV1LocalAcceptanceEnv(process.env, localValues, presetKeys);
  return { localPath, loadedLocal: true };
}
