export const STAFF_INVITATION_MIGRATION = "20261014180000_add_staff_invitations";

export type StaffInvitationSchemaState =
  | { status: "ready" }
  | { status: "pending" }
  | { status: "drift_table_without_history" }
  | { status: "incompatible"; detail: string };

export function classifyStaffInvitationSchema(input: {
  tableExists: boolean;
  migrationFinishedAt: Date | string | null;
  migrationRolledBackAt: Date | string | null;
}): StaffInvitationSchemaState {
  const migrationApplied = Boolean(
    input.migrationFinishedAt && !input.migrationRolledBackAt,
  );
  if (input.tableExists && migrationApplied) return { status: "ready" };
  if (!input.tableExists && !migrationApplied) return { status: "pending" };
  if (input.tableExists && !migrationApplied) {
    return { status: "drift_table_without_history" };
  }
  return {
    status: "incompatible",
    detail:
      "Prisma history records the staff invitation migration, but staff_invitations is missing.",
  };
}

export type StaffInvitationLocalMigratePlan =
  | { ok: true; pending: [typeof STAFF_INVITATION_MIGRATION] }
  | { ok: false; reason: string };

export function classifyStaffInvitationLocalMigratePlan(input: {
  appliedNames: string[];
  checkedInNames: string[];
  unresolvedCount: number;
  prerequisiteMigration: string;
  targetMigration: string;
}): StaffInvitationLocalMigratePlan {
  if (input.unresolvedCount > 0) {
    return { ok: false, reason: "Unresolved migration history; refusing to deploy." };
  }
  const applied = new Set(input.appliedNames);
  if (!applied.has(input.prerequisiteMigration)) {
    return {
      ok: false,
      reason: `${input.prerequisiteMigration} must already be applied before invitation storage.`,
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
  return {
    ok: true,
    pending: [STAFF_INVITATION_MIGRATION],
  };
}

export function staffInvitationSchemaReadinessMessage(
  state: StaffInvitationSchemaState,
) {
  switch (state.status) {
    case "ready":
      return "Staff invitation schema is ready.";
    case "pending":
      return `Apply checked-in Prisma migration ${STAFF_INVITATION_MIGRATION} with npm run staff:invitation-schema-setup on isolated bits_e2e, or the local working migrate script on loopback bits. Tests must not ALTER TABLE.`;
    case "drift_table_without_history":
      return `staff_invitations exists, but ${STAFF_INVITATION_MIGRATION} is not in _prisma_migrations. Do not ALTER TABLE from tests.`;
    case "incompatible":
      return state.detail;
  }
}

type SqlClient = {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
};

export async function inspectStaffInvitationSchema(db: SqlClient) {
  const tables = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'staff_invitations'`,
  );
  const history = await db.$queryRawUnsafe<
    Array<{ finished_at: Date | string | null; rolled_back_at: Date | string | null }>
  >(
    `SELECT finished_at, rolled_back_at
     FROM "_prisma_migrations"
     WHERE migration_name = $1`,
    STAFF_INVITATION_MIGRATION,
  );
  return classifyStaffInvitationSchema({
    tableExists: tables.length > 0,
    migrationFinishedAt: history[0]?.finished_at ?? null,
    migrationRolledBackAt: history[0]?.rolled_back_at ?? null,
  });
}
