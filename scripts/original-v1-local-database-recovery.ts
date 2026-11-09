import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

import {
  RecoveryConfigError,
  RECOVERY_DIRECTORY_MODE,
  RECOVERY_FILE_MODE,
  assertRecoveryArguments,
  assertRecoveryConfiguration,
  buildPgDumpArgs,
  buildPgRestoreArgs,
  checkedInMigrationNames,
  compareRecoveryEvidence,
  createRecoveryRunId,
  isRecoveryLoopbackAddress,
  insertRecoveryFixture,
  quoteRecoveryIdentifier,
  readRecoveryEvidence,
  recoveryConstraintProbes,
  recoveryDatabaseUrl,
  recoveryProcessEnv,
  redactRecoveryOutput,
  type RecoveryConfiguration,
  type RecoveryQuery,
} from "@/lib/ops/local-database-recovery";

const DEFAULT_PG_BIN = "/Applications/Postgres.app/Contents/Versions/18/bin";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function readFlag(argv: string[], name: string) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new RecoveryConfigError(`${name} requires a value.`);
  }
  return value;
}

function parseCli(argv: string[]) {
  assertRecoveryArguments(argv);
  const known = new Set([
    "--apply",
    "--host",
    "--port",
    "--username",
    "--maintenance-database",
    "--pg-bin",
    "--run-id",
  ]);
  for (const arg of argv) {
    if (arg.startsWith("--") && !known.has(arg)) {
      throw new RecoveryConfigError(`Unknown argument ${arg}.`);
    }
  }
  const host = readFlag(argv, "--host");
  const port = readFlag(argv, "--port");
  const username = readFlag(argv, "--username");
  const maintenanceDatabase = readFlag(argv, "--maintenance-database");
  if (!host || !port || !username || !maintenanceDatabase) {
    throw new RecoveryConfigError(
      "Required flags: --host, --port, --username, --maintenance-database.",
    );
  }
  return {
    apply: argv.includes("--apply"),
    pgBin: readFlag(argv, "--pg-bin") ?? DEFAULT_PG_BIN,
    config: assertRecoveryConfiguration({
      host,
      port,
      username,
      maintenanceDatabase,
      runId: readFlag(argv, "--run-id") ?? createRecoveryRunId(),
      env: process.env,
    }),
  };
}

function requireBinary(directory: string, name: string) {
  const full = path.join(directory, name);
  if (!existsSync(full)) {
    throw new RecoveryConfigError(
      `Missing ${name} under ${directory}. No PostgreSQL install was attempted.`,
    );
  }
  return full;
}

function binaryVersion(binary: string) {
  return execFileSync(binary, ["--version"], {
    encoding: "utf8",
    env: { NODE_ENV: process.env.NODE_ENV ?? "production", PATH: "/usr/bin:/bin", LC_ALL: "C" },
  }).trim();
}

function queryable(client: Client): RecoveryQuery {
  return (async (sql, params) => {
    const result = await client.query(sql, params ? [...params] : undefined);
    return { rows: result.rows };
  }) as RecoveryQuery;
}

async function withClient<T>(
  config: RecoveryConfiguration,
  database: string,
  password: string | undefined,
  run: (query: RecoveryQuery, client: Client) => Promise<T>,
) {
  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    database,
    password,
    ssl: false,
    application_name: "bits-local-recovery",
  });
  await client.connect();
  try {
    return await run(queryable(client), client);
  } finally {
    await client.end();
  }
}

function assertLoopbackSession(row: {
  database: string;
  address: string | null;
  port: number | string | null;
  version: string;
}, config: RecoveryConfiguration, expectedDatabase: string) {
  if (row.database !== expectedDatabase) {
    throw new RecoveryConfigError(
      `Connected to ${row.database}, not the requested database ${expectedDatabase}.`,
    );
  }
  if (Number(row.port) !== config.port) {
    throw new RecoveryConfigError("Connected port does not match the explicit port.");
  }
  if (!isRecoveryLoopbackAddress(row.address)) {
    throw new RecoveryConfigError(
      "Server address is not loopback. Refusing the rehearsal before any database is created.",
    );
  }
  return row.version;
}

function protect(file: string, mode: number) {
  chmodSync(file, mode);
  const actual = statSync(file).mode & 0o777;
  if (actual !== mode) {
    throw new RecoveryConfigError(`Could not set ${file} to mode ${mode.toString(8)}.`);
  }
}

async function main() {
  const password = process.env.BITS_RECOVERY_PASSWORD;
  const secrets = password ? [password] : [];
  let cli: ReturnType<typeof parseCli>;
  try {
    cli = parseCli(process.argv.slice(2));
  } catch (error) {
    fail(redactRecoveryOutput(error instanceof Error ? error.message : "Invalid recovery configuration.", secrets));
  }

  const pgDump = requireBinary(cli.pgBin, "pg_dump");
  const pgRestore = requireBinary(cli.pgBin, "pg_restore");
  const versions = {
    pgDump: binaryVersion(pgDump),
    pgRestore: binaryVersion(pgRestore),
  };
  const { config } = cli;
  process.stdout.write(
    [
      cli.apply ? "apply" : "dry-run",
      "hostKind loopback",
      `port ${config.port}`,
      `maintenance ${config.maintenanceDatabase}`,
      `source ${config.sourceDatabase}`,
      `restored ${config.restoredDatabase}`,
      versions.pgDump,
      versions.pgRestore,
      "",
    ].join("\n"),
  );
  if (!cli.apply) {
    process.stdout.write("No databases were created.\n");
    return;
  }

  const artifactDir = path.join(
    process.cwd(),
    "e2e/.local/database-recovery",
    config.runId,
  );
  mkdirSync(artifactDir, { recursive: true, mode: RECOVERY_DIRECTORY_MODE });
  protect(path.dirname(artifactDir), RECOVERY_DIRECTORY_MODE);
  protect(artifactDir, RECOVERY_DIRECTORY_MODE);
  const dumpPath = path.join(artifactDir, "source.dump");
  const manifestPath = path.join(artifactDir, "manifest.json");
  const manifest: Record<string, unknown> = {
    runId: config.runId,
    hostKind: "loopback",
    port: config.port,
    maintenanceDatabase: config.maintenanceDatabase,
    sourceDatabase: config.sourceDatabase,
    restoredDatabase: config.restoredDatabase,
    clientVersions: versions,
    cleanup:
      "These two databases are owned by this run. Do not drop any other database and do not drop by name prefix.",
  };

  const writeManifest = () => {
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: RECOVERY_FILE_MODE });
    protect(manifestPath, RECOVERY_FILE_MODE);
  };

  try {
    const server = await withClient(config, config.maintenanceDatabase, password, async (query) => {
      const session = await query<{
        database: string;
        address: string | null;
        port: number | null;
        version: string;
      }>(
        `SELECT current_database() AS database,
                inet_server_addr()::text AS address,
                inet_server_port() AS port,
                current_setting('server_version') AS version`,
      );
      const row = session.rows[0];
      if (!row) throw new RecoveryConfigError("Maintenance session returned no row.");
      const version = assertLoopbackSession(row, config, config.maintenanceDatabase);
      const existing = await query<{ datname: string }>(
        `SELECT datname FROM pg_database WHERE datname = ANY($1::text[])`,
        [[config.sourceDatabase, config.restoredDatabase]],
      );
      if (existing.rows.length) {
        throw new RecoveryConfigError(
          `Refusing to reuse existing database ${existing.rows.map((item) => item.datname).join(", ")}.`,
        );
      }
      await query(`CREATE DATABASE ${quoteRecoveryIdentifier(config.sourceDatabase)} TEMPLATE template0`);
      await query(`CREATE DATABASE ${quoteRecoveryIdentifier(config.restoredDatabase)} TEMPLATE template0`);
      return version;
    });
    manifest.serverVersion = server;
    manifest.databasesCreated = [config.sourceDatabase, config.restoredDatabase];
    writeManifest();

    const prismaBin = path.join(process.cwd(), "node_modules/prisma/build/index.js");
    if (!existsSync(prismaBin)) {
      throw new RecoveryConfigError("Prisma CLI is not installed at node_modules/prisma.");
    }
    const migrate = execFileSync(process.execPath, [prismaBin, "migrate", "deploy"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: "production",
        DATABASE_URL: recoveryDatabaseUrl({
          host: config.host,
          port: config.port,
          username: config.username,
          database: config.sourceDatabase,
          password,
        }),
      },
    });
    manifest.migrateExitStatus = 0;
    manifest.migrateOutput = redactRecoveryOutput(migrate, secrets).slice(-2000);

    const fixture = await withClient(config, config.sourceDatabase, password, async (query) => {
      const inserted = await insertRecoveryFixture(query);
      return inserted;
    });
    const sourceEvidence = await withClient(config, config.sourceDatabase, password, (query) =>
      readRecoveryEvidence(query),
    );
    const checkedIn = checkedInMigrationNames(path.join(process.cwd(), "prisma/migrations"));
    if (JSON.stringify(sourceEvidence.migrations) !== JSON.stringify(checkedIn)) {
      throw new RecoveryConfigError(
        "Source migration history does not match the checked-in prisma/migrations directories.",
      );
    }

    execFileSync(
      pgDump,
      buildPgDumpArgs({
        host: config.host,
        port: config.port,
        username: config.username,
        database: config.sourceDatabase,
        dumpPath,
      }),
      {
        env: recoveryProcessEnv({
          host: config.host,
          port: config.port,
          username: config.username,
          database: config.sourceDatabase,
          password,
        }),
      },
    );
    protect(dumpPath, RECOVERY_FILE_MODE);
    const dumpBytes = readFileSync(dumpPath);
    manifest.dump = {
      bytes: dumpBytes.length,
      sha256: createHash("sha256").update(dumpBytes).digest("hex"),
    };
    writeManifest();

    execFileSync(
      pgRestore,
      buildPgRestoreArgs({
        host: config.host,
        port: config.port,
        username: config.username,
        database: config.restoredDatabase,
        dumpPath,
      }),
      {
        env: recoveryProcessEnv({
          host: config.host,
          port: config.port,
          username: config.username,
          database: config.restoredDatabase,
          password,
        }),
      },
    );
    manifest.restoreExitStatus = 0;

    const restoredEvidence = await withClient(
      config,
      config.restoredDatabase,
      password,
      (query) => readRecoveryEvidence(query),
    );
    const matched = compareRecoveryEvidence(sourceEvidence, restoredEvidence);
    manifest.snapshotMatch = matched;
    if (!matched) {
      writeManifest();
      throw new RecoveryConfigError("Restored snapshot does not match the synthetic source.");
    }

    const probes = await withClient(config, config.restoredDatabase, password, async (query) => {
      const results = [];
      for (const probe of recoveryConstraintProbes(fixture)) {
        await query("BEGIN");
        let sqlState = "";
        try {
          await query(probe.sql, probe.params);
          sqlState = "committed";
        } catch (error) {
          sqlState = typeof error === "object" && error && "code" in error ? String(error.code) : "unknown";
        }
        await query("ROLLBACK");
        results.push({
          name: probe.name,
          rejected: sqlState === probe.expectedSqlState,
          sqlState,
        });
        if (sqlState !== probe.expectedSqlState) {
          throw new RecoveryConfigError(
            `${probe.name} returned ${sqlState} instead of ${probe.expectedSqlState}.`,
          );
        }
      }
      const counts = await query<{ donations: number }>(
        `SELECT COUNT(*)::int AS donations FROM "donations"`,
      );
      if (counts.rows[0]?.donations !== 1) {
        throw new RecoveryConfigError("Constraint probes left a donation row behind.");
      }
      return results;
    });
    manifest.constraintChecks = probes;
    writeManifest();
    process.stdout.write(
      `dump bytes ${manifest.dump && typeof manifest.dump === "object" && "bytes" in manifest.dump ? String(manifest.dump.bytes) : ""}\n`,
    );
    process.stdout.write(
      `dump sha256 ${manifest.dump && typeof manifest.dump === "object" && "sha256" in manifest.dump ? String(manifest.dump.sha256) : ""}\n`,
    );
    process.stdout.write("restore exit 0\nsnapshot match true\n");
    process.stdout.write(`manifest ${manifestPath}\n`);
    process.stdout.write(
      `databases left for review: ${config.sourceDatabase}, ${config.restoredDatabase}\n`,
    );
  } catch (error) {
    manifest.failure = redactRecoveryOutput(
      error instanceof Error ? error.message : "Recovery rehearsal failed.",
      secrets,
    );
    try {
      writeManifest();
    } catch {
      process.stderr.write("Could not write the recovery manifest.\n");
    }
    fail(String(manifest.failure));
  }
}

main().catch((error) => {
  const password = process.env.BITS_RECOVERY_PASSWORD;
  fail(
    redactRecoveryOutput(
      error instanceof Error ? error.message : "Recovery rehearsal failed.",
      password ? [password] : [],
    ),
  );
});
