import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import { describePostgresTarget } from "@/lib/testing/original-v1-database-url";
import { STAFF_MEMBERSHIP_VERSION_MIGRATION } from "@/lib/testing/staff-membership-schema-readiness";

loadOriginalV1AcceptanceEnvFiles();

const LOCAL_BACKUP_RELATIVE = "e2e/.local/backups/bits-2026-10-14-staff-membership-version.json";

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

function snapshotRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: String(row.id),
    organizationId: String(row.organizationId),
    userAccountId: String(row.userAccountId),
    roleTypeId: String(row.roleTypeId),
    active: Boolean(row.active),
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  }));
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

  const pending = await withClient(workingUrl, async (client) => {
    const applied = await client.query<{ migration_name: string }>(
      `SELECT migration_name
       FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    const names = new Set(applied.rows.map((row) => row.migration_name));
    return [STAFF_MEMBERSHIP_VERSION_MIGRATION].filter((name) => !names.has(name));
  });
  if (pending.length !== 1 || pending[0] !== STAFF_MEMBERSHIP_VERSION_MIGRATION) {
    fail(
      `Refusing to migrate: pending migrations are not exactly ${STAFF_MEMBERSHIP_VERSION_MIGRATION}.`,
    );
  }

  const before = await withClient(workingUrl, async (client) => {
    const result = await client.query(
      `SELECT id, "organizationId", "userAccountId", "roleTypeId", active, "createdAt", "updatedAt"
       FROM organization_memberships
       ORDER BY id`,
    );
    return snapshotRows(result.rows);
  });

  const backupPath = path.join(process.cwd(), LOCAL_BACKUP_RELATIVE);
  mkdirSync(path.dirname(backupPath), { recursive: true, mode: 0o700 });
  writeFileSync(
    backupPath,
    `${JSON.stringify({ database: "bits", hostKind: "loopback", memberships: before }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  const parsed = JSON.parse(readFileSync(backupPath, "utf8")) as {
    memberships: unknown[];
  };
  if (!Array.isArray(parsed.memberships) || parsed.memberships.length !== before.length) {
    fail("Backup file was written but is not readable.");
  }
  process.stdout.write(
    `wrote recoverable membership snapshot to ${LOCAL_BACKUP_RELATIVE} (${before.length} rows)\n`,
  );

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: {
      ...process.env,
      DATABASE_URL: workingUrl,
      DIRECT_URL: workingUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await withClient(workingUrl, async (client) => {
    const after = await client.query(
      `SELECT id, "organizationId", "userAccountId", "roleTypeId", active, "createdAt", "updatedAt", version
       FROM organization_memberships
       ORDER BY id`,
    );
    const afterRows = after.rows;
    if (afterRows.length !== before.length) {
      fail("Membership row count changed after migration.");
    }
    for (const [index, row] of afterRows.entries()) {
      const expected = before[index];
      if (
        String(row.id) !== expected.id ||
        String(row.organizationId) !== expected.organizationId ||
        String(row.userAccountId) !== expected.userAccountId ||
        String(row.roleTypeId) !== expected.roleTypeId ||
        Boolean(row.active) !== expected.active
      ) {
        fail("A membership id/role/status/tenant changed during migration.");
      }
      if (Number(row.version) !== 1) {
        fail("New version values are not the expected default of 1.");
      }
    }
  });

  process.stdout.write(
    "local bits database is schema-ready for Staff Access. This is not signed-in acceptance.\n",
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "local membership migrate failed");
});
