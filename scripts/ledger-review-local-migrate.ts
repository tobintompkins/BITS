import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { Client } from "pg";

import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import { describePostgresTarget } from "@/lib/testing/original-v1-database-url";
import {
  LEDGER_REVIEW_MIGRATION,
  LEDGER_REVIEW_PREREQ_MIGRATION,
  classifyLedgerReviewLocalMigratePlan,
} from "@/lib/testing/ledger-review-schema-readiness";

loadOriginalV1AcceptanceEnvFiles();

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

async function withClient<T>(url: string, fn: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const workingUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (!workingUrl) fail("DATABASE_URL is required.");
  const described = describePostgresTarget(workingUrl);
  if (!described.ok || described.hostKind !== "loopback" || described.database !== "bits") {
    fail(
      "Refusing to migrate: DATABASE_URL is not the identified local loopback working database named bits.",
    );
  }

  const plan = await withClient(workingUrl, async (client) => {
    const applied = await client.query<{ migration_name: string }>(
      `SELECT migration_name
       FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    const unresolved = await client.query(
      `SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`,
    );
    const checkedIn = readdirSync(path.join(process.cwd(), "prisma/migrations"))
      .filter((name) =>
        existsSync(path.join(process.cwd(), "prisma/migrations", name, "migration.sql")),
      );
    return classifyLedgerReviewLocalMigratePlan({
      appliedNames: applied.rows.map((row) => row.migration_name),
      checkedInNames: checkedIn,
      unresolvedCount: unresolved.rowCount ?? 0,
      prerequisiteMigration: LEDGER_REVIEW_PREREQ_MIGRATION,
      targetMigration: LEDGER_REVIEW_MIGRATION,
    });
  });
  if (!plan.ok) fail(plan.reason);

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: {
      ...process.env,
      DATABASE_URL: workingUrl,
      DIRECT_URL: workingUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  process.stdout.write(
    "local bits database is schema-ready for ledger review versions and create idempotency. This is not signed-in acceptance and does not edit gifts.\n",
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "local ledger review migrate failed");
});
