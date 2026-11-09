import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

import Decimal from "decimal.js";

export class RecoveryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryConfigError";
  }
}

/** Parent environment values that can retarget libpq differently from node-pg. */
export const RECOVERY_BLOCKING_ENV = [
  "PGHOSTADDR",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGOPTIONS",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "PGPASSFILE",
  "PGSSLMODE",
  "PGAPPNAME",
] as const;

export const FORBIDDEN_RECOVERY_DATABASES = [
  "bits",
  "bits_e2e",
  "postgres",
  "template0",
  "template1",
] as const;

export const RECOVERY_DIRECTORY_MODE = 0o700;
export const RECOVERY_FILE_MODE = 0o600;

export const RECOVERY_INDEXES = [
  "household_memberships_one_open_per_donor",
  "ledger_create_idempotency_org_action_token_key",
] as const;

export const RECOVERY_FOREIGN_KEYS = [
  "donations_donorId_fkey",
  "donation_allocations_donationId_fkey",
  "donation_allocations_offeringTypeId_fkey",
  "household_memberships_donorId_fkey",
  "offering_batches_organizationId_fkey",
  "ledger_create_idempotency_donationId_fkey",
] as const;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isRecoveryLoopbackAddress(address: string | null | undefined) {
  if (!address) return false;
  const host = address.split("/")[0]?.trim().toLowerCase() ?? "";
  return LOOPBACK_HOSTS.has(host);
}
const RUN_ID_PATTERN = /^[0-9a-f]{20,32}$/;
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export type RecoveryConfiguration = {
  host: "127.0.0.1" | "::1";
  port: number;
  username: string;
  maintenanceDatabase: "postgres";
  runId: string;
  sourceDatabase: string;
  restoredDatabase: string;
};

export function createRecoveryRunId(now = new Date(), entropy = randomBytes(4)) {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  return `${stamp}${entropy.toString("hex")}`;
}

export function recoveryDatabaseNames(runId: string) {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new RecoveryConfigError(
      "Run id must be 20–32 lowercase hex characters generated for this rehearsal.",
    );
  }
  const sourceDatabase = `bits_e2e_recovery_${runId}_source`;
  const restoredDatabase = `bits_e2e_recovery_${runId}_restored`;
  if (sourceDatabase.length > 63 || restoredDatabase.length > 63) {
    throw new RecoveryConfigError("Generated database names exceed PostgreSQL's 63-byte limit.");
  }
  if (sourceDatabase === restoredDatabase) {
    throw new RecoveryConfigError("Source and restored database names must differ.");
  }
  return { sourceDatabase, restoredDatabase };
}

export function quoteRecoveryIdentifier(name: string) {
  if (!SAFE_IDENTIFIER.test(name) || name.length > 63) {
    throw new RecoveryConfigError("Refusing an unsafe database identifier.");
  }
  if ((FORBIDDEN_RECOVERY_DATABASES as readonly string[]).includes(name)) {
    throw new RecoveryConfigError(`Refusing reserved database ${name}.`);
  }
  return `"${name}"`;
}

function blockingEnvironment(env: Record<string, string | undefined>) {
  return RECOVERY_BLOCKING_ENV.filter((name) => {
    const value = env[name];
    return value != null && value.trim() !== "";
  });
}

export function assertRecoveryArguments(argv: string[]) {
  const joined = argv.join(" ");
  if (/postgres(ql)?:\/\//i.test(joined)) {
    throw new RecoveryConfigError(
      "Refusing a raw PostgreSQL URL. Pass --host, --port, --username, and --maintenance-database.",
    );
  }
  if (/hostaddr|pgoptions|service=|options=/i.test(joined)) {
    throw new RecoveryConfigError(
      "Refusing hostaddr, service, or options overrides. libpq would honor them and node-pg would not.",
    );
  }
  if (argv.some((arg) => arg === "--clean" || arg === "--create" || arg === "-c" || arg === "-C")) {
    throw new RecoveryConfigError("Refusing --clean or --create. Restore goes into a new empty database.");
  }
}

export function assertRecoveryConfiguration(input: {
  host: string;
  port: string;
  username: string;
  maintenanceDatabase: string;
  runId: string;
  env?: Record<string, string | undefined>;
}): RecoveryConfiguration {
  const blocked = blockingEnvironment(input.env ?? {});
  if (blocked.length) {
    throw new RecoveryConfigError(
      `Refusing libpq environment overrides: ${blocked.join(", ")}. Unset them and pass explicit flags. Put a password only in BITS_RECOVERY_PASSWORD.`,
    );
  }

  const host = input.host.trim();
  if (!host || host.includes(",") || host.includes("/") || host.includes("\\") || /\s/.test(host)) {
    throw new RecoveryConfigError(
      "Host must be one explicit loopback address. Sockets, multi-host lists, and paths are refused.",
    );
  }
  if (host.toLowerCase() === "localhost") {
    throw new RecoveryConfigError(
      "Host localhost is ambiguous. Pass 127.0.0.1 or ::1 so node-pg and libpq use the same address.",
    );
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new RecoveryConfigError("Host must be the loopback address 127.0.0.1 or ::1.");
  }

  if (!/^[0-9]+$/.test(input.port.trim())) {
    throw new RecoveryConfigError("Port must be an explicit integer. It is not taken from the environment.");
  }
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RecoveryConfigError("Port must be between 1 and 65535.");
  }

  const username = input.username.trim();
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{0,62}$/.test(username)) {
    throw new RecoveryConfigError("Username must be a single explicit local role name.");
  }

  const maintenanceDatabase = input.maintenanceDatabase.trim();
  if (maintenanceDatabase !== "postgres") {
    throw new RecoveryConfigError(
      "Maintenance database must be postgres. It is used only to create the two new rehearsal databases.",
    );
  }

  const names = recoveryDatabaseNames(input.runId);
  for (const name of [names.sourceDatabase, names.restoredDatabase]) {
    quoteRecoveryIdentifier(name);
    if ((FORBIDDEN_RECOVERY_DATABASES as readonly string[]).includes(name)) {
      throw new RecoveryConfigError(`Refusing reserved database ${name}.`);
    }
  }

  return {
    host: host as RecoveryConfiguration["host"],
    port,
    username,
    maintenanceDatabase: "postgres",
    runId: input.runId,
    ...names,
  };
}

export function buildPgTargetArgs(input: {
  host: string;
  port: number;
  username: string;
  database: string;
}) {
  quoteRecoveryIdentifier(input.database);
  if (!input.database.startsWith("bits_e2e_recovery_")) {
    throw new RecoveryConfigError("pg_dump and pg_restore may target only this run's rehearsal databases.");
  }
  return [
    "--host",
    input.host,
    "--port",
    String(input.port),
    "--username",
    input.username,
    "--dbname",
    input.database,
    "--no-password",
  ];
}

export function buildPgDumpArgs(target: {
  host: string;
  port: number;
  username: string;
  database: string;
  dumpPath: string;
}) {
  return [
    ...buildPgTargetArgs(target),
    "--format=custom",
    "--file",
    target.dumpPath,
  ];
}

export function buildPgRestoreArgs(target: {
  host: string;
  port: number;
  username: string;
  database: string;
  dumpPath: string;
}) {
  const args = [
    ...buildPgTargetArgs(target),
    "--exit-on-error",
    "--single-transaction",
    target.dumpPath,
  ];
  if (args.some((arg) => ["--clean", "--create", "-c", "-C", "--if-exists"].includes(arg))) {
    throw new RecoveryConfigError("Restore arguments must not clean or create a database.");
  }
  return args;
}

export function recoveryProcessEnv(input: {
  host: string;
  port: number;
  username: string;
  database: string;
  password?: string;
  path?: string;
}) {
  quoteRecoveryIdentifier(input.database);
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "production",
    PGHOST: input.host,
    PGPORT: String(input.port),
    PGDATABASE: input.database,
    PGUSER: input.username,
    PGAPPNAME: "bits-local-recovery",
    PGSSLMODE: "disable",
    LC_ALL: "C",
    LANG: "C",
  };
  if (input.path) env.PATH = input.path;
  if (input.password) env.PGPASSWORD = input.password;
  return env;
}

export function recoveryDatabaseUrl(input: {
  host: string;
  port: number;
  username: string;
  database: string;
  password?: string;
}) {
  quoteRecoveryIdentifier(input.database);
  const user = encodeURIComponent(input.username);
  const auth = input.password
    ? `${user}:${encodeURIComponent(input.password)}`
    : user;
  const host = input.host.includes(":") ? `[${input.host}]` : input.host;
  return `postgresql://${auth}@${host}:${input.port}/${input.database}?sslmode=disable`;
}

export function redactRecoveryOutput(text: string, secrets: string[]) {
  let redacted = text;
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted.replace(/postgres(ql)?:\/\/\S+/gi, "[redacted-url]");
}

export function checkedInMigrationNames(migrationsDirectory: string) {
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(path.join(migrationsDirectory, entry.name, "migration.sql")),
    )
    .map((entry) => entry.name)
    .sort();
}

export function recoveryFixtureAmounts() {
  const partA = new Decimal("4.10");
  const partB = new Decimal("6.20");
  return {
    partA: partA.toFixed(2),
    partB: partB.toFixed(2),
    total: partA.plus(partB).toFixed(2),
    reviewVersion: 4,
    offeringDate: "2026-09-06",
    householdMemberships: [
      { startDate: "2024-01-01", endDate: "2024-12-31" },
      { startDate: "2025-01-01", endDate: null },
    ],
    idempotencyAction: "CREATE_MANUAL_BATCH_DONATION",
    operationToken: "recovery-fixture-token",
    auditAction: "RECOVERY_FIXTURE_GIFT",
  };
}

export type RecoveryQuery = <T = Record<string, unknown>>(
  sql: string,
  params?: readonly unknown[],
) => Promise<{ rows: T[] }>;

const FIXTURE_AT = "2026-11-04T15:00:00.000Z";

export async function insertRecoveryFixture(query: RecoveryQuery) {
  const amounts = recoveryFixtureAmounts();
  const ids = {
    alphaId: crypto.randomUUID(),
    bravoId: crypto.randomUUID(),
    treasurerId: crypto.randomUUID(),
    entryId: crypto.randomUUID(),
    donorId: crypto.randomUUID(),
    householdId: crypto.randomUUID(),
    endedMembershipId: crypto.randomUUID(),
    openMembershipId: crypto.randomUUID(),
    offeringTypeId: crypto.randomUUID(),
    batchId: crypto.randomUUID(),
    donationId: crypto.randomUUID(),
    allocationAId: crypto.randomUUID(),
    allocationBId: crypto.randomUUID(),
    auditId: crypto.randomUUID(),
    idempotencyId: crypto.randomUUID(),
  };

  const roleIds = new Map<string, string>();
  for (const code of ["ORG_ADMIN", "TREASURER", "DATA_ENTRY", "REPORT_VIEWER", "DONOR"]) {
    roleIds.set(code, crypto.randomUUID());
  }

  await query("BEGIN");
  try {
    for (const [slug, id, name] of [
      ["recovery-church-alpha", ids.alphaId, "Recovery Church Alpha"],
      ["recovery-church-bravo", ids.bravoId, "Recovery Church Bravo"],
    ] as const) {
      await query(
        `INSERT INTO "organizations"
          ("id", "name", "slug", "mailingAddressLine1", "city", "state", "postalCode", "updatedAt")
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
        [id, name, slug, "1 Recovery Lane", "Nashville", "TN", "37203", FIXTURE_AT],
      );
    }

    await query(
      `INSERT INTO "user_accounts"
        ("id", "clerkUserId", "primaryEmail", "displayName", "updatedAt")
       VALUES
        ($1::uuid, $2, $3, $4, $5::timestamptz),
        ($6::uuid, $7, $8, $9, $5::timestamptz)`,
      [
        ids.treasurerId,
        "recovery-local-alpha",
        "recovery-treasurer@example.test",
        "Recovery Treasurer",
        FIXTURE_AT,
        ids.entryId,
        "recovery-local-bravo",
        "recovery-entry@example.test",
        "Recovery Data Entry",
      ],
    );

    for (const [code, id] of roleIds) {
      await query(
        `INSERT INTO "role_types" ("id", "code", "name", "updatedAt")
         VALUES ($1::uuid, $2::"RoleCode", $3, $4::timestamptz)`,
        [id, code, code, FIXTURE_AT],
      );
    }

    await query(
      `INSERT INTO "organization_memberships"
        ("id", "organizationId", "userAccountId", "roleTypeId", "version", "updatedAt")
       VALUES
        ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 2, $5::timestamptz),
        ($6::uuid, $7::uuid, $8::uuid, $9::uuid, 3, $5::timestamptz)`,
      [
        crypto.randomUUID(),
        ids.alphaId,
        ids.treasurerId,
        roleIds.get("TREASURER"),
        FIXTURE_AT,
        crypto.randomUUID(),
        ids.bravoId,
        ids.entryId,
        roleIds.get("DATA_ENTRY"),
      ],
    );

    await query(
      `INSERT INTO "donors"
        ("id", "organizationId", "firstName", "lastName", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::timestamptz)`,
      [ids.donorId, ids.alphaId, "Ada", "Fixture", FIXTURE_AT],
    );

    await query(
      `INSERT INTO "households"
        ("id", "organizationId", "displayName", "mailingAddressLine1", "city", "state", "postalCode", "primaryDonorId", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::uuid, $9::timestamptz)`,
      [
        ids.householdId,
        ids.alphaId,
        "Recovery Household Alpha",
        "1 Recovery Lane",
        "Nashville",
        "TN",
        "37203",
        ids.donorId,
        FIXTURE_AT,
      ],
    );

    await query(
      `INSERT INTO "household_memberships"
        ("id", "organizationId", "householdId", "donorId", "startDate", "endDate", "updatedAt")
       VALUES
        ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date, $6::date, $7::timestamptz),
        ($8::uuid, $2::uuid, $3::uuid, $4::uuid, $9::date, NULL, $7::timestamptz)`,
      [
        ids.endedMembershipId,
        ids.alphaId,
        ids.householdId,
        ids.donorId,
        amounts.householdMemberships[0].startDate,
        amounts.householdMemberships[0].endDate,
        FIXTURE_AT,
        ids.openMembershipId,
        amounts.householdMemberships[1].startDate,
      ],
    );

    await query(
      `INSERT INTO "offering_types"
        ("id", "organizationId", "name", "code", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::timestamptz)`,
      [ids.offeringTypeId, ids.alphaId, "Recovery General", "RECOVERY_GENERAL", FIXTURE_AT],
    );

    await query(
      `INSERT INTO "offering_batches"
        ("id", "organizationId", "name", "offeringDate", "status", "expectedTotal", "recordedTotal", "createdByUserAccountId", "reviewVersion", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3, $4::date, 'DRAFT'::"OfferingBatchStatus", $5::numeric, $6::numeric, $7::uuid, $8::int, $9::timestamptz)`,
      [
        ids.batchId,
        ids.alphaId,
        "Recovery Draft",
        amounts.offeringDate,
        amounts.total,
        amounts.total,
        ids.treasurerId,
        amounts.reviewVersion,
        FIXTURE_AT,
      ],
    );

    await query(
      `INSERT INTO "donations"
        ("id", "organizationId", "donorId", "batchId", "offeringDate", "receivedDate", "paymentMethod", "totalAmount", "deductibleAmount", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date, $5::date, 'CASH'::"PaymentMethod", $6::numeric, $6::numeric, $7::timestamptz)`,
      [
        ids.donationId,
        ids.alphaId,
        ids.donorId,
        ids.batchId,
        amounts.offeringDate,
        amounts.total,
        FIXTURE_AT,
      ],
    );

    await query(
      `INSERT INTO "donation_allocations"
        ("id", "organizationId", "donationId", "offeringTypeId", "amount")
       VALUES
        ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric),
        ($6::uuid, $2::uuid, $3::uuid, $4::uuid, $7::numeric)`,
      [
        ids.allocationAId,
        ids.alphaId,
        ids.donationId,
        ids.offeringTypeId,
        amounts.partA,
        ids.allocationBId,
        amounts.partB,
      ],
    );

    await query(
      `INSERT INTO "audit_events"
        ("id", "organizationId", "actorUserAccountId", "action", "entityType", "entityId", "changeMetadata")
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'Donation', $5::uuid, $6::jsonb)`,
      [
        ids.auditId,
        ids.alphaId,
        ids.treasurerId,
        amounts.auditAction,
        ids.donationId,
        JSON.stringify({ fixture: "core20" }),
      ],
    );

    await query(
      `INSERT INTO "ledger_create_idempotency"
        ("id", "organizationId", "action", "operationToken", "actorUserAccountId", "batchId", "donationId", "payloadFingerprint")
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::uuid, $8)`,
      [
        ids.idempotencyId,
        ids.alphaId,
        amounts.idempotencyAction,
        amounts.operationToken,
        ids.treasurerId,
        ids.batchId,
        ids.donationId,
        "recovery-fixture-4.10-6.20",
      ],
    );

    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }

  return {
    organizationId: ids.alphaId,
    donorId: ids.donorId,
    householdId: ids.householdId,
    actorUserAccountId: ids.treasurerId,
    batchId: ids.batchId,
    donationId: ids.donationId,
  };
}

export type RecoveryEvidence = {
  migrations: string[];
  indexes: Array<{ name: string; definition: string }>;
  foreignKeys: Array<{ name: string; definition: string }>;
  organizations: string[];
  roles: string[];
  memberships: Array<{ organizationSlug: string; roleCode: string; version: number }>;
  donor: { organizationSlug: string; firstName: string; lastName: string; linkedAccount: boolean };
  householdMemberships: Array<{ startDate: string; endDate: string | null }>;
  offeringType: { organizationSlug: string; code: string };
  batch: {
    organizationSlug: string;
    status: string;
    reviewVersion: number;
    expectedTotal: string;
    recordedTotal: string;
  };
  gift: {
    paymentMethod: string;
    totalAmount: string;
    deductibleAmount: string;
    allocationSum: string;
    allocationCount: number;
  };
  audit: { action: string; entityType: string; linkedToDonation: boolean };
  idempotency: {
    action: string;
    operationToken: string;
    linkedToDonation: boolean;
    linkedToBatch: boolean;
  };
};

function moneyText(value: unknown) {
  return new Decimal(String(value)).toFixed(2);
}

export async function readRecoveryEvidence(query: RecoveryQuery): Promise<RecoveryEvidence> {
  const migrations = await query<{ migration_name: string }>(
    `SELECT migration_name
     FROM "_prisma_migrations"
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
     ORDER BY migration_name`,
  );
  const indexes = await query<{ name: string; definition: string }>(
    `SELECT indexname AS name, indexdef AS definition
     FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = ANY($1::text[])
     ORDER BY indexname`,
    [RECOVERY_INDEXES],
  );
  const foreignKeys = await query<{ name: string; definition: string }>(
    `SELECT con.conname AS name, pg_get_constraintdef(con.oid) AS definition
     FROM pg_constraint con
     JOIN pg_namespace nsp ON nsp.oid = con.connamespace
     WHERE nsp.nspname = 'public'
       AND con.contype = 'f'
       AND con.conname = ANY($1::text[])
     ORDER BY con.conname`,
    [RECOVERY_FOREIGN_KEYS],
  );
  const organizations = await query<{ slug: string }>(
    `SELECT slug FROM "organizations" ORDER BY slug`,
  );
  const roles = await query<{ code: string }>(
    `SELECT code::text AS code FROM "role_types" ORDER BY code`,
  );
  const memberships = await query<{
    organization_slug: string;
    role_code: string;
    version: number;
  }>(
    `SELECT o.slug AS organization_slug, r.code::text AS role_code, m.version
     FROM "organization_memberships" m
     JOIN "organizations" o ON o.id = m."organizationId"
     JOIN "role_types" r ON r.id = m."roleTypeId"
     ORDER BY o.slug, r.code`,
  );
  const donors = await query<{
    organization_slug: string;
    first_name: string;
    last_name: string;
    linked_account: boolean;
  }>(
    `SELECT o.slug AS organization_slug, d."firstName" AS first_name, d."lastName" AS last_name,
            (d."userAccountId" IS NOT NULL) AS linked_account
     FROM "donors" d
     JOIN "organizations" o ON o.id = d."organizationId"
     ORDER BY o.slug`,
  );
  const householdMemberships = await query<{ start_date: string; end_date: string | null }>(
    `SELECT to_char(hm."startDate", 'YYYY-MM-DD') AS start_date,
            to_char(hm."endDate", 'YYYY-MM-DD') AS end_date
     FROM "household_memberships" hm
     JOIN "organizations" o ON o.id = hm."organizationId"
     WHERE o.slug = 'recovery-church-alpha'
     ORDER BY hm."startDate"`,
  );
  const offeringTypes = await query<{ organization_slug: string; code: string }>(
    `SELECT o.slug AS organization_slug, ot.code
     FROM "offering_types" ot
     JOIN "organizations" o ON o.id = ot."organizationId"
     ORDER BY o.slug`,
  );
  const batches = await query<{
    organization_slug: string;
    status: string;
    review_version: number;
    expected_total: string;
    recorded_total: string;
  }>(
    `SELECT o.slug AS organization_slug, b.status::text AS status, b."reviewVersion" AS review_version,
            b."expectedTotal"::text AS expected_total, b."recordedTotal"::text AS recorded_total
     FROM "offering_batches" b
     JOIN "organizations" o ON o.id = b."organizationId"`,
  );
  const gifts = await query<{
    payment_method: string;
    total_amount: string;
    deductible_amount: string;
    allocation_sum: string;
    allocation_count: number;
  }>(
    `SELECT d."paymentMethod"::text AS payment_method,
            d."totalAmount"::text AS total_amount,
            d."deductibleAmount"::text AS deductible_amount,
            COALESCE(SUM(a.amount), 0)::text AS allocation_sum,
            COUNT(a.id)::int AS allocation_count
     FROM "donations" d
     LEFT JOIN "donation_allocations" a ON a."donationId" = d.id
     GROUP BY d.id`,
  );
  const audits = await query<{ action: string; entity_type: string; linked: boolean }>(
    `SELECT ae.action, ae."entityType" AS entity_type, (ae."entityId" = d.id) AS linked
     FROM "audit_events" ae
     JOIN "donations" d ON d.id = ae."entityId"`,
  );
  const idempotency = await query<{
    action: string;
    operation_token: string;
    donation_linked: boolean;
    batch_linked: boolean;
  }>(
    `SELECT i.action, i."operationToken" AS operation_token,
            (i."donationId" = d.id) AS donation_linked,
            (i."batchId" = b.id) AS batch_linked
     FROM "ledger_create_idempotency" i
     JOIN "donations" d ON d.id = i."donationId"
     JOIN "offering_batches" b ON b.id = i."batchId"`,
  );

  if (
    organizations.rows.length !== 2 ||
    roles.rows.length !== 5 ||
    memberships.rows.length !== 2 ||
    donors.rows.length !== 1 ||
    householdMemberships.rows.length !== 2 ||
    offeringTypes.rows.length !== 1 ||
    batches.rows.length !== 1 ||
    gifts.rows.length !== 1 ||
    audits.rows.length !== 1 ||
    idempotency.rows.length !== 1 ||
    indexes.rows.length !== RECOVERY_INDEXES.length ||
    foreignKeys.rows.length !== RECOVERY_FOREIGN_KEYS.length
  ) {
    throw new RecoveryConfigError("Restored fixture row counts do not match the synthetic rehearsal.");
  }

  const donor = donors.rows[0];
  const batch = batches.rows[0];
  const gift = gifts.rows[0];
  const audit = audits.rows[0];
  const token = idempotency.rows[0];
  const offering = offeringTypes.rows[0];
  if (!donor || !batch || !gift || !audit || !token || !offering) {
    throw new RecoveryConfigError("Restored fixture is missing a required row.");
  }

  return {
    migrations: migrations.rows.map((row) => row.migration_name),
    indexes: indexes.rows.map((row) => ({ name: row.name, definition: row.definition })),
    foreignKeys: foreignKeys.rows.map((row) => ({
      name: row.name,
      definition: row.definition,
    })),
    organizations: organizations.rows.map((row) => row.slug),
    roles: roles.rows.map((row) => row.code),
    memberships: memberships.rows.map((row) => ({
      organizationSlug: row.organization_slug,
      roleCode: row.role_code,
      version: Number(row.version),
    })),
    donor: {
      organizationSlug: donor.organization_slug,
      firstName: donor.first_name,
      lastName: donor.last_name,
      linkedAccount: donor.linked_account,
    },
    householdMemberships: householdMemberships.rows.map((row) => ({
      startDate: row.start_date,
      endDate: row.end_date,
    })),
    offeringType: { organizationSlug: offering.organization_slug, code: offering.code },
    batch: {
      organizationSlug: batch.organization_slug,
      status: batch.status,
      reviewVersion: Number(batch.review_version),
      expectedTotal: moneyText(batch.expected_total),
      recordedTotal: moneyText(batch.recorded_total),
    },
    gift: {
      paymentMethod: gift.payment_method,
      totalAmount: moneyText(gift.total_amount),
      deductibleAmount: moneyText(gift.deductible_amount),
      allocationSum: moneyText(gift.allocation_sum),
      allocationCount: Number(gift.allocation_count),
    },
    audit: {
      action: audit.action,
      entityType: audit.entity_type,
      linkedToDonation: audit.linked,
    },
    idempotency: {
      action: token.action,
      operationToken: token.operation_token,
      linkedToDonation: token.donation_linked,
      linkedToBatch: token.batch_linked,
    },
  };
}

export function compareRecoveryEvidence(source: RecoveryEvidence, restored: RecoveryEvidence) {
  return JSON.stringify(source) === JSON.stringify(restored);
}

export function recoveryConstraintProbes(ids: {
  organizationId: string;
  donorId: string;
  householdId: string;
  actorUserAccountId: string;
  batchId: string;
}) {
  const amounts = recoveryFixtureAmounts();
  return [
    {
      name: "second open household membership",
      expectedSqlState: "23505",
      sql: `INSERT INTO "household_memberships"
        ("id", "organizationId", "householdId", "donorId", "startDate", "updatedAt")
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date, $6::timestamptz)`,
      params: [
        crypto.randomUUID(),
        ids.organizationId,
        ids.householdId,
        ids.donorId,
        "2026-02-01",
        FIXTURE_AT,
      ],
    },
    {
      name: "duplicate gift idempotency token",
      expectedSqlState: "23505",
      sql: `INSERT INTO "ledger_create_idempotency"
        ("id", "organizationId", "action", "operationToken", "actorUserAccountId", "batchId", "payloadFingerprint")
        VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7)`,
      params: [
        crypto.randomUUID(),
        ids.organizationId,
        amounts.idempotencyAction,
        amounts.operationToken,
        ids.actorUserAccountId,
        ids.batchId,
        "duplicate",
      ],
    },
    {
      name: "allocation without an offering type",
      expectedSqlState: "23503",
      sql: `INSERT INTO "donation_allocations"
        ("id", "organizationId", "donationId", "offeringTypeId", "amount")
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric)`,
      params: [
        crypto.randomUUID(),
        ids.organizationId,
        crypto.randomUUID(),
        crypto.randomUUID(),
        "1.00",
      ],
    },
  ];
}
