import { execFileSync } from "node:child_process";

import { Client } from "pg";

import { loadOriginalV1AcceptanceEnvFiles } from "../lib/testing/original-v1-acceptance-env";
import {
  diagnoseOriginalV1AcceptanceEnv,
  formatOriginalV1PreflightReport,
} from "../lib/testing/original-v1-acceptance-preflight";
import {
  defaultIsolatedPlaywrightBaseUrl,
  deriveIsolatedDatabaseUrl,
  ensureAcceptanceStorageRoot,
  isolatedOrganizationsLookOwned,
  mergeLocalAcceptanceEnvFile,
  OriginalV1AcceptanceSetupError,
  readOrCreateAcceptanceToken,
} from "../lib/testing/original-v1-acceptance-setup";

const ISOLATED_DATABASE_NAME = "bits_e2e";

loadOriginalV1AcceptanceEnvFiles();

async function withClient<T>(url: string, fn: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function ensureIsolatedDatabase(workingUrl: string, isolatedUrl: string) {
  const exists = await withClient(workingUrl, async (client) => {
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [ISOLATED_DATABASE_NAME],
    );
    return (result.rowCount ?? 0) > 0;
  });

  if (!exists) {
    await withClient(workingUrl, async (client) => {
      await client.query(`CREATE DATABASE ${ISOLATED_DATABASE_NAME}`);
    });
    process.stdout.write("created isolated database bits_e2e\n");
  } else {
    process.stdout.write("isolated database bits_e2e already exists\n");
  }

  await withClient(isolatedUrl, async (client) => {
    const table = await client.query<{ reg: string | null }>(
      "SELECT to_regclass('public.organizations') AS reg",
    );
    if (!table.rows[0]?.reg) {
      return;
    }
    const orgs = await client.query<{ name: string; slug: string }>(
      'SELECT name, slug FROM organizations',
    );
    const ownership = isolatedOrganizationsLookOwned(orgs.rows);
    if (!ownership.ok) {
      throw new OriginalV1AcceptanceSetupError(ownership.reason);
    }
  });
}

function migrateIsolatedDatabase(isolatedUrl: string) {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: {
      ...process.env,
      DATABASE_URL: isolatedUrl,
      DIRECT_URL: isolatedUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.write("applied existing migrations to bits_e2e only\n");
}

async function applyLocalSetup() {
  const workingUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (!workingUrl) {
    throw new OriginalV1AcceptanceSetupError(
      "DATABASE_URL is required so setup can derive a sibling bits_e2e database without changing the working church URL.",
    );
  }

  const isolatedUrl =
    process.env.BITS_E2E_DATABASE_URL?.trim() ||
    deriveIsolatedDatabaseUrl(workingUrl);
  process.env.BITS_E2E_DATABASE_URL = isolatedUrl;
  process.env.BITS_E2E_APP_DATABASE_URL = isolatedUrl;

  try {
    await ensureIsolatedDatabase(workingUrl, isolatedUrl);
  } catch (error) {
    if (error instanceof OriginalV1AcceptanceSetupError) throw error;
    throw new OriginalV1AcceptanceSetupError(
      "PostgreSQL is unavailable or refused the isolated-database setup. The working bits database was not reset, copied, dropped, or seeded.",
    );
  }

  try {
    migrateIsolatedDatabase(isolatedUrl);
  } catch {
    throw new OriginalV1AcceptanceSetupError(
      "Prisma migrate deploy failed against bits_e2e. The working bits database was not changed.",
    );
  }

  const { token } = readOrCreateAcceptanceToken();
  const storageRoot = ensureAcceptanceStorageRoot();
  process.env.BITS_E2E_ACCEPTANCE = "1";
  process.env.BITS_E2E_TARGET_TOKEN = token;
  process.env.BITS_FILE_STORAGE_ROOT = storageRoot;
  process.env.BITS_STATEMENT_PDF_BACKEND = "local";
  if (!process.env.PLAYWRIGHT_BASE_URL?.trim()) {
    process.env.PLAYWRIGHT_BASE_URL = defaultIsolatedPlaywrightBaseUrl();
  }

  mergeLocalAcceptanceEnvFile(process.cwd(), {
    BITS_E2E_ACCEPTANCE: "1",
    BITS_E2E_TARGET_TOKEN: token,
    BITS_E2E_DATABASE_URL: isolatedUrl,
    BITS_E2E_APP_DATABASE_URL: isolatedUrl,
    BITS_E2E_RUN_ID: process.env.BITS_E2E_RUN_ID?.trim() || "local",
    PLAYWRIGHT_BASE_URL:
      process.env.PLAYWRIGHT_BASE_URL || defaultIsolatedPlaywrightBaseUrl(),
    BITS_FILE_STORAGE_ROOT: storageRoot,
    BITS_STATEMENT_PDF_BACKEND: "local",
  });
  process.stdout.write(
    "wrote missing keys to gitignored e2e/.local/acceptance.env\n",
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply) {
    await applyLocalSetup();
  }

  const report = diagnoseOriginalV1AcceptanceEnv();
  process.stdout.write(formatOriginalV1PreflightReport(report));
  if (!apply) {
    process.stdout.write(
      "note: rerun with --apply to create bits_e2e, apply migrations, and write gitignored local files. The working DATABASE_URL is not changed.\n",
    );
  }
  if (!report.ok) process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Acceptance setup failed.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
