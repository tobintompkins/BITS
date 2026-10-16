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
  LEDGER_REVIEW_MIGRATION,
  inspectLedgerReviewSchema,
  ledgerReviewSchemaReadinessMessage,
} from "@/lib/testing/ledger-review-schema-readiness";
import {
  inspectStaffInvitationSchema,
  staffInvitationSchemaReadinessMessage,
} from "@/lib/testing/staff-invitation-schema-readiness";

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

async function main() {
  const isolatedUrl = process.env.BITS_E2E_DATABASE_URL?.trim() ?? "";
  const workingUrl = process.env.DATABASE_URL?.trim() ?? "";

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
    const invitations = await inspectStaffInvitationSchema(prisma);
    if (invitations.status !== "ready") {
      fail(
        `${staffInvitationSchemaReadinessMessage(invitations)} Run npm run staff:invitation-schema-setup first.`,
      );
    }

    const state = await inspectLedgerReviewSchema(prisma);
    process.stdout.write(`isolated ${isolated.database} ledger review schema: ${state.status}\n`);
    if (state.status === "ready") {
      process.stdout.write(ledgerReviewSchemaReadinessMessage(state) + "\n");
      return;
    }
    if (state.status !== "pending") {
      fail(ledgerReviewSchemaReadinessMessage(state));
    }

    const applied = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT migration_name
       FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    const appliedNames = new Set(applied.map((row) => row.migration_name));
    const checkedIn = readdirSync(path.join(process.cwd(), "prisma/migrations"))
      .filter((name) =>
        existsSync(path.join(process.cwd(), "prisma/migrations", name, "migration.sql")),
      )
      .sort();
    const pending = checkedIn.filter((name) => !appliedNames.has(name));
    if (pending.length !== 1 || pending[0] !== LEDGER_REVIEW_MIGRATION) {
      fail(
        `Refusing to migrate bits_e2e because pending migrations are not exactly ${LEDGER_REVIEW_MIGRATION}: ${pending.join(", ") || "(none)"}.`,
      );
    }

    runPrisma(["migrate", "deploy"], isolatedUrl);
    const after = await inspectLedgerReviewSchema(prisma);
    if (after.status !== "ready") {
      fail(ledgerReviewSchemaReadinessMessage(after));
    }
    process.stdout.write(
      "applied checked-in ledger review and create-idempotency migration to bits_e2e\n",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "ledger review schema setup failed");
});
