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
  STAFF_INVITATION_MIGRATION,
  inspectStaffInvitationSchema,
  staffInvitationSchemaReadinessMessage,
} from "@/lib/testing/staff-invitation-schema-readiness";
import {
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
    const membership = await inspectStaffMembershipVersionSchema(prisma);
    if (membership.status !== "ready") {
      fail(
        `${staffMembershipSchemaReadinessMessage(membership)} Run npm run staff:membership-schema-setup first.`,
      );
    }

    const state = await inspectStaffInvitationSchema(prisma);
    process.stdout.write(`isolated ${isolated.database} invitation schema: ${state.status}\n`);
    if (state.status === "ready") {
      process.stdout.write(staffInvitationSchemaReadinessMessage(state) + "\n");
      return;
    }
    if (state.status !== "pending") {
      fail(staffInvitationSchemaReadinessMessage(state));
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
    if (pending.some((name) => name !== STAFF_INVITATION_MIGRATION)) {
      fail(
        `Refusing to migrate bits_e2e because unrelated migrations are pending: ${pending.join(", ")}.`,
      );
    }

    runPrisma(["migrate", "deploy"], isolatedUrl);
    const after = await inspectStaffInvitationSchema(prisma);
    if (after.status !== "ready") {
      fail(staffInvitationSchemaReadinessMessage(after));
    }
    process.stdout.write("applied checked-in staff invitation migration to bits_e2e\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "staff invitation schema setup failed");
});
