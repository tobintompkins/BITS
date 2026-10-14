import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/app/generated/prisma/client";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import {
  describePostgresTarget,
  isolatedDatabaseNameIsDedicated,
  postgresTargetsAreEquivalent,
} from "@/lib/testing/original-v1-database-url";
import {
  STAFF_MEMBERSHIP_VERSION_MIGRATION,
  inspectStaffMembershipVersionSchema,
  staffMembershipSchemaReadinessMessage,
} from "@/lib/testing/staff-membership-schema-readiness";

loadOriginalV1AcceptanceEnvFiles();

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function runPrisma(args: string[], databaseUrl: string) {
  execFileSync("npx", ["prisma", ...args], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function listPending(databaseUrl: string) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const applied = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT migration_name
       FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    return applied;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const isolatedUrl = process.env.BITS_E2E_DATABASE_URL?.trim() ?? "";
  const workingUrl = process.env.DATABASE_URL?.trim() ?? "";
  const reconcile = process.argv.includes("--reconcile-identical-version-column");

  if (!isolatedUrl) {
    fail("BITS_E2E_DATABASE_URL is required. This command never uses DATABASE_URL.");
  }
  const isolated = describePostgresTarget(isolatedUrl);
  if (!isolated.ok || !isolatedDatabaseNameIsDedicated(isolated.database ?? "")) {
    fail("BITS_E2E_DATABASE_URL must be a dedicated isolated database such as bits_e2e.");
  }
  if (workingUrl && postgresTargetsAreEquivalent(isolatedUrl, workingUrl)) {
    fail("BITS_E2E_DATABASE_URL must not be the working application database.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: isolatedUrl }),
  });
  try {
    const state = await inspectStaffMembershipVersionSchema(prisma);
    process.stdout.write(
      `isolated ${isolated.database} schema: ${state.status}\n`,
    );

    if (state.status === "ready") {
      process.stdout.write(staffMembershipSchemaReadinessMessage(state) + "\n");
      return;
    }

    const applied = await listPending(isolatedUrl);
    const appliedNames = new Set(applied.map((row) => row.migration_name));
    if (appliedNames.has(STAFF_MEMBERSHIP_VERSION_MIGRATION)) {
      fail(staffMembershipSchemaReadinessMessage(state));
    }

    const checkedIn = readdirSync(path.join(process.cwd(), "prisma/migrations"))
      .filter((name) =>
        existsSync(
          path.join(process.cwd(), "prisma/migrations", name, "migration.sql"),
        ),
      )
      .sort();
    const pending = checkedIn.filter((name) => !appliedNames.has(name));
    if (
      pending.some((name) => name !== STAFF_MEMBERSHIP_VERSION_MIGRATION)
    ) {
      fail(
        `Refusing to migrate bits_e2e because unrelated migrations are pending: ${pending.join(", ")}.`,
      );
    }

    if (state.status === "pending") {
      runPrisma(["migrate", "deploy"], isolatedUrl);
      const after = await inspectStaffMembershipVersionSchema(prisma);
      if (after.status !== "ready") {
        fail(staffMembershipSchemaReadinessMessage(after));
      }
      process.stdout.write("applied checked-in membership version migration to bits_e2e\n");
      return;
    }

    if (state.status === "drift_column_without_history") {
      const plan = [
        "Reconciliation plan for bits_e2e:",
        `1. Catalog already has organization_memberships.version INTEGER NOT NULL DEFAULT 1.`,
        `2. Checked-in ${STAFF_MEMBERSHIP_VERSION_MIGRATION} is the same additive SQL.`,
        "3. migrate deploy would fail because ADD COLUMN cannot rerun.",
        "4. After confirming the column shape, record that exact migration with prisma migrate resolve --applied.",
        "5. Do not ALTER TABLE from tests and do not mark a different checksum applied.",
      ].join("\n");
      if (!reconcile) {
        process.stdout.write(`${plan}\n`);
        fail(
          "Refusing to silently resolve drift. Re-run with --reconcile-identical-version-column after reviewing the plan.",
        );
      }
      process.stdout.write(`${plan}\nrecording identical checked-in migration\n`);
      runPrisma(
        ["migrate", "resolve", "--applied", STAFF_MEMBERSHIP_VERSION_MIGRATION],
        isolatedUrl,
      );
      const after = await inspectStaffMembershipVersionSchema(prisma);
      if (after.status !== "ready") {
        fail(staffMembershipSchemaReadinessMessage(after));
      }
      process.stdout.write("bits_e2e Prisma history now matches the existing version column\n");
      return;
    }

    fail(staffMembershipSchemaReadinessMessage(state));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "staff membership schema setup failed");
});
