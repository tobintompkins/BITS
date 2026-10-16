export const LEDGER_REVIEW_MIGRATION =
  "20261014200000_add_ledger_review_and_idempotency";
export const LEDGER_REVIEW_PREREQ_MIGRATION = "20261014180000_add_staff_invitations";

export type LedgerReviewSchemaState =
  | { status: "ready" }
  | { status: "pending" }
  | { status: "drift_table_without_history" }
  | { status: "incompatible"; detail: string };

export function classifyLedgerReviewSchema(input: {
  versionColumnExists: boolean;
  tableExists: boolean;
  migrationFinishedAt: Date | string | null;
  migrationRolledBackAt: Date | string | null;
}): LedgerReviewSchemaState {
  const migrationApplied = Boolean(
    input.migrationFinishedAt && !input.migrationRolledBackAt,
  );
  if (input.versionColumnExists && input.tableExists && migrationApplied) {
    return { status: "ready" };
  }
  if (!input.versionColumnExists && !input.tableExists && !migrationApplied) {
    return { status: "pending" };
  }
  if ((input.versionColumnExists || input.tableExists) && !migrationApplied) {
    return { status: "drift_table_without_history" };
  }
  return {
    status: "incompatible",
    detail:
      "Prisma history records the ledger review migration, but reviewVersion or ledger_create_idempotency is missing.",
  };
}

export type LedgerReviewLocalMigratePlan =
  | { ok: true; pending: [typeof LEDGER_REVIEW_MIGRATION] }
  | { ok: false; reason: string };

export function classifyLedgerReviewLocalMigratePlan(input: {
  appliedNames: string[];
  checkedInNames: string[];
  unresolvedCount: number;
  prerequisiteMigration: string;
  targetMigration: string;
}): LedgerReviewLocalMigratePlan {
  if (input.unresolvedCount > 0) {
    return { ok: false, reason: "Unresolved migration history; refusing to deploy." };
  }
  const applied = new Set(input.appliedNames);
  if (!applied.has(input.prerequisiteMigration)) {
    return {
      ok: false,
      reason: `${input.prerequisiteMigration} must already be applied before ledger review storage.`,
    };
  }
  const pending = input.checkedInNames
    .filter((name) => !applied.has(name))
    .sort();
  if (pending.length !== 1 || pending[0] !== input.targetMigration) {
    return {
      ok: false,
      reason: `Refusing to migrate: pending migrations are not exactly ${input.targetMigration}.`,
    };
  }
  return { ok: true, pending: [LEDGER_REVIEW_MIGRATION] };
}

export function ledgerReviewSchemaReadinessMessage(
  state: LedgerReviewSchemaState,
) {
  switch (state.status) {
    case "ready":
      return "Ledger review and create-idempotency schema is ready.";
    case "pending":
      return `Apply checked-in Prisma migration ${LEDGER_REVIEW_MIGRATION} with npm run ledger:review-schema-setup on isolated bits_e2e, or the local working migrate script on loopback bits. Tests must not ALTER TABLE.`;
    case "drift_table_without_history":
      return `reviewVersion or ledger_create_idempotency exists, but ${LEDGER_REVIEW_MIGRATION} is not in _prisma_migrations. Do not ALTER TABLE from tests.`;
    case "incompatible":
      return state.detail;
  }
}

export function assertLedgerReviewSchemaReady(state: LedgerReviewSchemaState) {
  if (state.status !== "ready") {
    throw new Error(ledgerReviewSchemaReadinessMessage(state));
  }
}

type SqlClient = {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
};

export async function inspectLedgerReviewSchema(db: SqlClient) {
  const columns = await db.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'offering_batches'
       AND column_name = 'reviewVersion'`,
  );
  const tables = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'ledger_create_idempotency'`,
  );
  const history = await db.$queryRawUnsafe<
    Array<{ finished_at: Date | string | null; rolled_back_at: Date | string | null }>
  >(
    `SELECT finished_at, rolled_back_at
     FROM "_prisma_migrations"
     WHERE migration_name = $1`,
    LEDGER_REVIEW_MIGRATION,
  );
  return classifyLedgerReviewSchema({
    versionColumnExists: columns.length > 0,
    tableExists: tables.length > 0,
    migrationFinishedAt: history[0]?.finished_at ?? null,
    migrationRolledBackAt: history[0]?.rolled_back_at ?? null,
  });
}