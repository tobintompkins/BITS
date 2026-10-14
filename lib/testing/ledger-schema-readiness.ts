export type LedgerSchemaState =
  | { status: "ready" }
  | { status: "missing"; detail: string };

const REQUIRED_TABLES = [
  "offering_batches",
  "donations",
  "donation_allocations",
] as const;

export function classifyLedgerSchema(tableNames: string[]): LedgerSchemaState {
  const present = new Set(tableNames);
  const missing = REQUIRED_TABLES.filter((name) => !present.has(name));
  if (missing.length === 0) return { status: "ready" };
  return {
    status: "missing",
    detail: `Ledger tables missing: ${missing.join(", ")}. Apply checked-in Prisma migrations. Tests must not ALTER TABLE.`,
  };
}

export function ledgerSchemaReadinessMessage(state: LedgerSchemaState) {
  if (state.status === "ready") return "Ledger schema is ready.";
  return state.detail;
}

export function assertLedgerSchemaReady(state: LedgerSchemaState) {
  if (state.status !== "ready") {
    throw new Error(ledgerSchemaReadinessMessage(state));
  }
}

type SqlClient = {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
};

export async function inspectLedgerSchema(db: SqlClient) {
  const tables = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN (
         'offering_batches',
         'donations',
         'donation_allocations'
       )`,
  );
  return classifyLedgerSchema(tables.map((row) => row.table_name));
}