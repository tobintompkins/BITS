export const STAFF_MEMBERSHIP_VERSION_MIGRATION =
  "20261014130000_add_organization_membership_version";

export type StaffMembershipVersionColumn = {
  dataType: string;
  isNullable: string;
  columnDefault: string | null;
};

export type StaffMembershipVersionMigrationRecord = {
  finishedAt: Date | string | null;
  rolledBackAt: Date | string | null;
};

export type StaffMembershipSchemaState =
  | { status: "ready"; column: StaffMembershipVersionColumn }
  | { status: "pending" }
  | { status: "drift_column_without_history"; column: StaffMembershipVersionColumn }
  | { status: "incompatible"; detail: string };

function defaultLooksLikeOne(value: string | null) {
  if (!value) return false;
  return /(^|[^0-9])1([^0-9]|$)/.test(value);
}

export function versionColumnMatchesMigration(
  column: StaffMembershipVersionColumn | null,
) {
  if (!column) return false;
  const type = column.dataType.toLowerCase();
  return (
    (type === "integer" || type === "int4") &&
    column.isNullable === "NO" &&
    defaultLooksLikeOne(column.columnDefault)
  );
}

export function classifyStaffMembershipVersionSchema(input: {
  column: StaffMembershipVersionColumn | null;
  migration: StaffMembershipVersionMigrationRecord | null;
}): StaffMembershipSchemaState {
  const migrationApplied = Boolean(
    input.migration?.finishedAt && !input.migration.rolledBackAt,
  );
  const matchingColumn = versionColumnMatchesMigration(input.column);

  if (matchingColumn && migrationApplied) {
    return { status: "ready", column: input.column! };
  }
  if (!input.column && !migrationApplied) {
    return { status: "pending" };
  }
  if (matchingColumn && !migrationApplied) {
    return {
      status: "drift_column_without_history",
      column: input.column!,
    };
  }
  if (migrationApplied && !input.column) {
    return {
      status: "incompatible",
      detail:
        "Prisma history records the membership version migration, but organization_memberships.version is missing.",
    };
  }
  return {
    status: "incompatible",
    detail:
      "organization_memberships.version does not match INTEGER NOT NULL DEFAULT 1, or migration history is rolled back.",
  };
}

export function staffMembershipSchemaReadinessMessage(
  state: StaffMembershipSchemaState,
) {
  switch (state.status) {
    case "ready":
      return "Staff membership version schema is ready.";
    case "pending":
      return `Apply checked-in Prisma migration ${STAFF_MEMBERSHIP_VERSION_MIGRATION} with npm run staff:membership-schema-setup on isolated bits_e2e, or the local working migrate script on loopback bits. Tests must not ALTER TABLE.`;
    case "drift_column_without_history":
      return `organization_memberships.version exists, but ${STAFF_MEMBERSHIP_VERSION_MIGRATION} is not in _prisma_migrations. Do not ALTER TABLE from tests. Run npm run staff:membership-schema-setup -- --reconcile-identical-version-column on isolated bits_e2e after confirming the column is INTEGER NOT NULL DEFAULT 1.`;
    case "incompatible":
      return state.detail;
  }
}

export function assertStaffMembershipVersionSchemaReady(
  state: StaffMembershipSchemaState,
) {
  if (state.status !== "ready") {
    throw new Error(staffMembershipSchemaReadinessMessage(state));
  }
}

type SqlClient = {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
};

export async function inspectStaffMembershipVersionSchema(db: SqlClient) {
  const columns = await db.$queryRawUnsafe<
    Array<{
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>
  >(
    `SELECT data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'organization_memberships'
       AND column_name = 'version'`,
  );
  const history = await db.$queryRawUnsafe<
    Array<{ finished_at: Date | string | null; rolled_back_at: Date | string | null }>
  >(
    `SELECT finished_at, rolled_back_at
     FROM "_prisma_migrations"
     WHERE migration_name = $1`,
    STAFF_MEMBERSHIP_VERSION_MIGRATION,
  );
  return classifyStaffMembershipVersionSchema({
    column: columns[0]
      ? {
          dataType: columns[0].data_type,
          isNullable: columns[0].is_nullable,
          columnDefault: columns[0].column_default,
        }
      : null,
    migration: history[0]
      ? {
          finishedAt: history[0].finished_at,
          rolledBackAt: history[0].rolled_back_at,
        }
      : null,
  });
}
