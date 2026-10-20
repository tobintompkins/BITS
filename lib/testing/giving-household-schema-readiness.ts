export const GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_MIGRATION =
  "20261003220000_add_household_memberships_one_open_per_donor";
export const GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_INDEX =
  "household_memberships_one_open_per_donor";

export const GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_TABLE = "household_memberships";
export const GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_SCHEMA = "public";
export const GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_COLUMNS = [
  "organizationId",
  "donorId",
] as const;
export const GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_PREDICATE = "enddate is null";

export type GivingHouseholdIndexShape = {
  schemaName: string;
  tableName: string;
  unique: boolean;
  valid: boolean;
  ready: boolean;
  columns: string[];
  predicate: string | null;
};

export type GivingHouseholdSchemaState =
  | { status: "ready" }
  | { status: "pending" }
  | { status: "drift_index_without_history" }
  | { status: "incompatible"; detail: string };

export function normalizeGivingHouseholdIndexPredicate(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/["'`]/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function givingHouseholdIndexShapeDefect(
  index: GivingHouseholdIndexShape | null,
) {
  if (!index) return "missing";
  if (index.schemaName !== GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_SCHEMA) {
    return `schema ${index.schemaName}`;
  }
  if (index.tableName !== GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_TABLE) {
    return `table ${index.tableName}`;
  }
  if (!index.unique) return "not unique";
  if (!index.valid || !index.ready) return "not valid/ready";
  if (
    index.columns.length !== GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_COLUMNS.length ||
    GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_COLUMNS.some(
      (column, offset) => index.columns[offset] !== column,
    )
  ) {
    return `columns ${index.columns.join(",")}`;
  }
  if (
    normalizeGivingHouseholdIndexPredicate(index.predicate) !==
    GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_PREDICATE
  ) {
    return `predicate ${normalizeGivingHouseholdIndexPredicate(index.predicate)}`;
  }
  return null;
}

export function classifyGivingHouseholdSchema(input: {
  index: GivingHouseholdIndexShape | null;
  migrationFinishedAt: Date | string | null;
  migrationRolledBackAt: Date | string | null;
}): GivingHouseholdSchemaState {
  const migrationApplied = Boolean(
    input.migrationFinishedAt && !input.migrationRolledBackAt,
  );
  const defect = givingHouseholdIndexShapeDefect(input.index);
  if (!input.index && !migrationApplied) return { status: "pending" };
  if (defect === "missing" && migrationApplied) {
    return {
      status: "incompatible",
      detail:
        "Prisma history records the open-membership index migration, but household_memberships_one_open_per_donor is missing.",
    };
  }
  if (defect) {
    return {
      status: "incompatible",
      detail: `${GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_INDEX} is present but malformed (${defect}). Tests must not ALTER TABLE or use working bits.`,
    };
  }
  if (!migrationApplied) return { status: "drift_index_without_history" };
  return { status: "ready" };
}

export function givingHouseholdSchemaReadinessMessage(
  state: GivingHouseholdSchemaState,
) {
  switch (state.status) {
    case "ready":
      return "Giving-household open-membership schema is ready.";
    case "pending":
      return `Apply checked-in Prisma migration ${GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_MIGRATION} on isolated bits_e2e. Tests must not ALTER TABLE or use working bits.`;
    case "drift_index_without_history":
      return `${GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_INDEX} exists, but ${GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_MIGRATION} is not in _prisma_migrations. Do not ALTER TABLE from tests.`;
    case "incompatible":
      return state.detail;
  }
}

export function assertGivingHouseholdSchemaReady(
  state: GivingHouseholdSchemaState,
) {
  if (state.status !== "ready") {
    throw new Error(givingHouseholdSchemaReadinessMessage(state));
  }
}

export const READY_GIVING_HOUSEHOLD_INDEX_SHAPE: GivingHouseholdIndexShape = {
  schemaName: GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_SCHEMA,
  tableName: GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_TABLE,
  unique: true,
  valid: true,
  ready: true,
  columns: [...GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_COLUMNS],
  predicate: `"endDate" IS NULL`,
};

type SqlClient = {
  $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

export async function inspectGivingHouseholdSchema(db: SqlClient) {
  const indexes = await db.$queryRaw<
    Array<{
      schema_name: string;
      table_name: string;
      is_unique: boolean;
      is_valid: boolean;
      is_ready: boolean;
      predicate: string | null;
      columns: string;
    }>
  >`
    SELECT
      n.nspname::text AS schema_name,
      t.relname::text AS table_name,
      (ix.indisunique)::boolean AS is_unique,
      (ix.indisvalid)::boolean AS is_valid,
      (ix.indisready)::boolean AS is_ready,
      pg_get_expr(ix.indpred, ix.indrelid)::text AS predicate,
      (
        SELECT coalesce(string_agg(a.attname::text, ',' ORDER BY cols.ordinality), '')
        FROM unnest(ix.indkey) WITH ORDINALITY AS cols(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = t.oid
         AND a.attnum = cols.attnum
      ) AS columns
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE i.relname = ${GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_INDEX}
      AND n.nspname = ${GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_SCHEMA}
  `;
  const history = await db.$queryRaw<
    Array<{ finished_at: Date | string | null; rolled_back_at: Date | string | null }>
  >`
    SELECT finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name = ${GIVING_HOUSEHOLD_OPEN_MEMBERSHIP_MIGRATION}
  `;
  const row = indexes[0];
  return classifyGivingHouseholdSchema({
    index: row
      ? {
          schemaName: row.schema_name,
          tableName: row.table_name,
          unique: row.is_unique,
          valid: row.is_valid,
          ready: row.is_ready,
          columns: row.columns ? row.columns.split(",") : [],
          predicate: row.predicate,
        }
      : null,
    migrationFinishedAt: history[0]?.finished_at ?? null,
    migrationRolledBackAt: history[0]?.rolled_back_at ?? null,
  });
}
