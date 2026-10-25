import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseEnvFileContents } from "@/lib/testing/original-v1-acceptance-env";

export const STATEMENT_STORAGE_TEST_ENV_RELATIVE = "e2e/.local/storage-test.env";

export const STATEMENT_STORAGE_TEST_ENV_KEYS = [
  "BITS_STATEMENT_S3_TEST_TARGET",
  "BITS_STATEMENT_S3_TEST_BUCKET",
  "BITS_STATEMENT_S3_TEST_REGION",
  "BITS_STATEMENT_S3_TEST_ENDPOINT",
  "BITS_STATEMENT_S3_TEST_PREFIX",
  "BITS_STATEMENT_S3_TEST_FORCE_PATH_STYLE",
  "BITS_STATEMENT_S3_TEST_ALLOW_INSECURE_HTTP",
] as const;

const FORBIDDEN_OVERLAY_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "BITS_E2E_DATABASE_URL",
  "BITS_WORKING_DATABASE_URL",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "E2E_CLERK_ORG_A_ID",
  "E2E_CLERK_ORG_B_ID",
] as const;

function nonemptyKeys(env: Record<string, string | undefined>) {
  return new Set(
    Object.entries(env)
      .filter(([, value]) => value !== undefined && value.trim() !== "")
      .map(([key]) => key),
  );
}

export function applyStatementStorageTestEnv(
  env: Record<string, string | undefined>,
  localValues: Record<string, string>,
  presetKeys: Set<string>,
) {
  for (const key of STATEMENT_STORAGE_TEST_ENV_KEYS) {
    if (presetKeys.has(key)) continue;
    const value = localValues[key]?.trim();
    if (value) env[key] = value;
  }
  for (const key of FORBIDDEN_OVERLAY_KEYS) {
    if (localValues[key] && !presetKeys.has(key)) {
      delete env[key];
    }
  }
  return env;
}

export function loadStatementStorageTestEnvFiles(cwd = process.cwd()) {
  const presetKeys = nonemptyKeys(process.env);
  const localPath = path.join(cwd, STATEMENT_STORAGE_TEST_ENV_RELATIVE);
  if (!existsSync(localPath)) {
    return { localPath, loadedLocal: false };
  }
  const localValues = parseEnvFileContents(readFileSync(localPath, "utf8"));
  applyStatementStorageTestEnv(process.env, localValues, presetKeys);
  return { localPath, loadedLocal: true };
}
