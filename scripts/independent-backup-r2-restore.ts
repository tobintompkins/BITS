import { spawn, spawnSync } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  BackupGuardError,
  assertAgeRecipient,
  assertUploadAllowed,
  independentBackupBucket,
  withBackupTimeout,
  withBoundedRetries,
} from "../lib/ops/independent-backup-guard";

const dumpPath = join(
  process.cwd(),
  "e2e/.local/database-recovery/2026111717161546d41ce7/bits-test-db.dump",
);
const expectedDumpSha256 = "9429863446c929ef21d5151c916ed85cfe7cc1a2f8fa3fecdd75749e4fa9e50f";
const expectedMigrationNameSha256 = "dc676b85734b59076d5fe6bb2fce265efdfd92ae40d89bb435083f871cf2caef";
const objectKey = "test/rehearsal/r2-restore-20261117/bits-test-db.dump.age";
const restoreDatabase = "bits_test_r2_restore_202611172052c4e1";
const preservedDatabases = [
  "bits",
  "bits_e2e",
  "bits_e2e_recovery_2026110502432060350d59_source",
  "bits_e2e_recovery_2026110502432060350d59_restored",
  "bits_test_schema_recovery_2026111717161546d41ce7",
  "postgres",
  "template0",
  "template1",
];
const identityPath = join(homedir(), "Library/Application Support/BITS/independent-backup/age-identity.txt");
const ageBin = join(homedir(), ".local/bin/age");
const psql = "/Applications/Postgres.app/Contents/Versions/18/bin/psql";
const pgRestore = "/Applications/Postgres.app/Contents/Versions/18/bin/pg_restore";
const lockedPrefixes = ["test/postgres/daily/", "test/postgres/weekly/", "test/statements/"];
const foreignKeys = [
  "donation_allocations_donationId_fkey",
  "donation_allocations_offeringTypeId_fkey",
  "donations_donorId_fkey",
  "household_memberships_donorId_fkey",
  "ledger_create_idempotency_donationId_fkey",
  "offering_batches_organizationId_fkey",
];
const indexes = [
  "household_memberships_one_open_per_donor",
  "ledger_create_idempotency_org_action_token_key",
];

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameBytes(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function publicError(error: unknown) {
  if (error instanceof BackupGuardError) return error.message;
  if (error && typeof error === "object" && "name" in error) {
    const name = String((error as { name?: unknown }).name ?? "Error");
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    return status ? `${name} HTTP ${status}` : name;
  }
  return "R2 restore rehearsal failed.";
}

function assertApprovedScope() {
  if (preservedDatabases.includes(restoreDatabase)) {
    throw new BackupGuardError("Refusing to restore over an existing database.");
  }
  if (lockedPrefixes.some((prefix) => objectKey.startsWith(prefix))) {
    throw new BackupGuardError("Refusing to upload a disposable restore under a retention lock.");
  }
  if (objectKey !== "test/rehearsal/r2-restore-20261117/bits-test-db.dump.age") {
    throw new BackupGuardError("Refusing to use an unapproved object key.");
  }
}

function readPublicRecipient() {
  const recipient = readFileSync(identityPath, "utf8")
    .split("\n")
    .find((line) => line.startsWith("# public key:"))
    ?.replace("# public key:", "")
    .trim();
  return assertAgeRecipient(recipient);
}

function loadUploadCredential() {
  const result = spawnSync(
    "security",
    ["find-generic-password", "-s", "bits-independent-backups-upload", "-a", "r2-object-read-write", "-w"],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new BackupGuardError("Upload credential was not readable from the keychain.");
  }
  const parsed = JSON.parse(result.stdout.trim()) as {
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    bucket?: string;
  };
  if (parsed.bucket !== independentBackupBucket) {
    throw new BackupGuardError("Keychain credential is not scoped to the approved bucket.");
  }
  if (!parsed.accessKeyId || !parsed.secretAccessKey || !parsed.endpoint?.startsWith("https://")) {
    throw new BackupGuardError("Keychain credential is incomplete.");
  }
  return parsed;
}

function runAge(args: string[], signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ageBin, args, { stdio: "ignore" });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => {
      if (!child.killed) child.kill("SIGKILL");
      finish(new BackupGuardError("Backup timed out after 120000ms."));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (signal.aborted) return;
      if (code === 0) finish();
      else finish(new BackupGuardError(`age exited ${code ?? "unknown"}.`));
    });
  });
}

async function guarded<T>(operation: (signal: AbortSignal) => Promise<T>) {
  return withBoundedRetries(() => withBackupTimeout(operation));
}

function psqlQuery(database: string, sql: string) {
  if (!/^[a-z0-9_]+$/.test(database)) {
    throw new BackupGuardError("Database name is not a local identifier.");
  }
  const result = spawnSync(psql, ["-h", "127.0.0.1", "-p", "5432", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new BackupGuardError(`Local query failed for ${database}.`);
  }
  return result.stdout.trim();
}

function databaseExists(name: string) {
  const listed = psqlQuery("postgres", "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1;");
  return listed.split("\n").includes(name);
}

function workingChurchFingerprint() {
  return psqlQuery(
    "bits",
    `SELECT (SELECT count(*) FROM organizations) || '|' ||
            (SELECT count(*) FROM organization_memberships) || '|' ||
            (SELECT count(*) FROM donations) || '|' ||
            (SELECT coalesce(sum("totalAmount"), 0) FROM donations) || '|' ||
            (SELECT count(*) FROM offering_batches) || '|' ||
            (SELECT count(*) FROM audit_events);`,
  );
}

function migrationFiles() {
  const root = join(process.cwd(), "prisma/migrations");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      checksum: sha256(readFileSync(join(root, name, "migration.sql"))),
    }));
}

function restoredSchema(database: string) {
  const migrations = psqlQuery(
    database,
    `SELECT migration_name || '|' || checksum || '|' || (finished_at IS NOT NULL)::text || '|' || (rolled_back_at IS NOT NULL)::text
     FROM _prisma_migrations ORDER BY migration_name;`,
  );
  const names = migrations
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("|")[0]);
  const tables = psqlQuery(database, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;")
    .split("\n")
    .filter(Boolean);
  const foundIndexes = psqlQuery(
    database,
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (${indexes.map((name) => `'${name}'`).join(",")}) ORDER BY 1;`,
  )
    .split("\n")
    .filter(Boolean);
  const foundKeys = psqlQuery(
    database,
    `SELECT conname FROM pg_constraint WHERE contype = 'f' AND conname IN (${foreignKeys.map((name) => `'${name}'`).join(",")}) ORDER BY 1;`,
  )
    .split("\n")
    .filter(Boolean);
  const counts = psqlQuery(
    database,
    `SELECT (SELECT count(*) FROM organizations) || '|' ||
            (SELECT count(*) FROM organization_memberships) || '|' ||
            (SELECT count(*) FROM donors) || '|' ||
            (SELECT count(*) FROM donations) || '|' ||
            (SELECT count(*) FROM offering_batches) || '|' ||
            (SELECT count(*) FROM audit_events) || '|' ||
            (SELECT count(*) FROM staff_invitations) || '|' ||
            (SELECT count(*) FROM role_types);`,
  );
  return { migrations, names, tables, foundIndexes, foundKeys, counts };
}

async function listBucket(client: S3Client, signal: AbortSignal) {
  const keys: string[] = [];
  let bytes = 0;
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: independentBackupBucket, ContinuationToken: token }),
      { abortSignal: signal },
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
      bytes += object.Size ?? 0;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { keys, bytes };
}

async function main() {
  if (!process.argv.includes("--apply")) {
    throw new BackupGuardError("Refusing to upload or restore without --apply.");
  }
  assertApprovedScope();
  if (databaseExists(restoreDatabase)) {
    throw new BackupGuardError("The approved restore database already exists.");
  }
  const beforeChurch = workingChurchFingerprint();
  if (beforeChurch !== "3|3|4|187.00|0|338") {
    throw new BackupGuardError("Working church data does not match the recorded fingerprint.");
  }
  const dump = readFileSync(dumpPath);
  if (sha256(dump) !== expectedDumpSha256) {
    throw new BackupGuardError("The existing TEST dump checksum does not match.");
  }
  const files = migrationFiles();
  if (sha256(Buffer.from(files.map((file) => file.name).join("\n"))) !== expectedMigrationNameSha256) {
    throw new BackupGuardError("Local migration names do not match the recorded checksum.");
  }
  const recipient = readPublicRecipient();
  const credential = loadUploadCredential();
  const work = mkdtempSync(join(tmpdir(), "bits-r2-restore-"));
  const client = new S3Client({
    region: "auto",
    endpoint: credential.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: credential.accessKeyId!, secretAccessKey: credential.secretAccessKey! },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  let uploaded = false;
  let verified = false;
  try {
    const encryptedPath = join(work, "dump.age");
    await guarded((signal) => runAge(["-r", recipient, "-o", encryptedPath, dumpPath], signal));
    const encrypted = readFileSync(encryptedPath);
    const existing = await guarded((signal) => listBucket(client, signal));
    if (existing.keys.length > 0) {
      throw new BackupGuardError("The backup bucket was not empty. Nothing was uploaded.");
    }
    assertUploadAllowed({
      kind: "postgres",
      archiveBytes: dump.length,
      existingBucketBytes: existing.bytes,
      incomingBytes: encrypted.length,
    });
    await guarded((signal) =>
      client.send(
        new PutObjectCommand({
          Bucket: independentBackupBucket,
          Key: objectKey,
          Body: encrypted,
          ContentLength: encrypted.length,
          ContentType: "application/octet-stream",
        }),
        { abortSignal: signal },
      ),
    );
    uploaded = true;
    const downloaded = await guarded(async (signal) => {
      const response = await client.send(
        new GetObjectCommand({ Bucket: independentBackupBucket, Key: objectKey }),
        { abortSignal: signal },
      );
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) throw new BackupGuardError("Downloaded object was empty.");
      return Buffer.from(bytes);
    });
    if (!sameBytes(downloaded, encrypted)) {
      throw new BackupGuardError("Downloaded ciphertext does not match the uploaded ciphertext.");
    }
    const decryptedPath = join(work, "dump.out");
    writeFileSync(join(work, "downloaded.age"), downloaded);
    await guarded((signal) =>
      runAge(["-d", "-i", identityPath, "-o", decryptedPath, join(work, "downloaded.age")], signal),
    );
    const decrypted = readFileSync(decryptedPath);
    if (!sameBytes(decrypted, dump) || sha256(decrypted) !== expectedDumpSha256) {
      throw new BackupGuardError("Decrypted dump does not match the existing TEST dump.");
    }
    const created = spawnSync(
      psql,
      ["-h", "127.0.0.1", "-p", "5432", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${restoreDatabase} TEMPLATE template0`],
      { encoding: "utf8" },
    );
    if (created.status !== 0) {
      throw new BackupGuardError("The new restore database was not created.");
    }
    const restored = spawnSync(
      pgRestore,
      ["--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", "--dbname", restoreDatabase, decryptedPath],
      { encoding: "utf8", env: { ...process.env, PGHOST: "127.0.0.1", PGPORT: "5432" } },
    );
    if (restored.status !== 0) {
      throw new BackupGuardError("pg_restore failed and was rolled back.");
    }
    const schema = restoredSchema(restoreDatabase);
    const fileLines = files.map((file) => `${file.name}|${file.checksum}|true|false`);
    const finished = schema.migrations.split("\n").filter((line) => line.endsWith("|true|false"));
    if (
      schema.names.length !== 52 ||
      finished.length !== 52 ||
      sha256(Buffer.from(schema.names.join("\n"))) !== expectedMigrationNameSha256 ||
      schema.migrations !== fileLines.join("\n") ||
      schema.tables.length !== 75 ||
      schema.foundIndexes.join("|") !== indexes.join("|") ||
      schema.foundKeys.join("|") !== foreignKeys.join("|") ||
      schema.counts !== "0|0|0|0|0|0|0|0"
    ) {
      throw new BackupGuardError("Restored schema did not match the empty TEST dump.");
    }
    const afterChurch = workingChurchFingerprint();
    if (afterChurch !== beforeChurch) {
      throw new BackupGuardError("Working church data changed during the restore.");
    }
    const preservedStillThere = preservedDatabases.filter((name) => name !== "template0" && name !== "template1").every((name) => databaseExists(name));
    if (!preservedStillThere) {
      throw new BackupGuardError("An existing database is missing after the restore.");
    }
    verified = true;
    await guarded((signal) =>
      client.send(new DeleteObjectCommand({ Bucket: independentBackupBucket, Key: objectKey }), { abortSignal: signal }),
    );
    await guarded(async (signal) => {
      try {
        await client.send(new HeadObjectCommand({ Bucket: independentBackupBucket, Key: objectKey }), { abortSignal: signal });
      } catch (error) {
        const name = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (name === "NotFound" || name === "NoSuchKey" || status === 404) return;
        throw error;
      }
      throw new BackupGuardError("The rehearsal object was still present after deletion.");
    });
    const after = await guarded((signal) => listBucket(client, signal));
    if (after.keys.includes(objectKey) || after.keys.length !== 0) {
      throw new BackupGuardError("The bucket was not empty after deleting the rehearsal object.");
    }
    const manifestDir = join(process.cwd(), "e2e/.local/database-recovery/202611172052c4e1");
    mkdirSync(manifestDir, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(manifestDir, "manifest.json"),
      `${JSON.stringify({
        kind: "empty-database-schema-recovery-from-r2",
        churchDataRecovered: false,
        objectKey,
        retention: "no lock and no completed-object expiration; 7-day unfinished multipart abort only",
        restoreDatabase,
        dumpSha256: expectedDumpSha256,
        migrationNameSha256: expectedMigrationNameSha256,
        publicTables: schema.tables.length,
        finishedMigrations: finished.length,
        indexes,
        foreignKeys,
        restoredCounts: schema.counts,
        workingChurchUnchanged: afterChurch,
        bucketObjectCountAfter: after.keys.length,
        deletedKey: objectKey,
      }, null, 2)}\n`,
      { mode: 0o600 },
    );
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        kind: "empty-schema-recovery",
        churchDataRecovered: false,
        recurring: false,
        failureEmail: "pending",
        offlineRecoveryKey: "incomplete",
        objectKey,
        retentionLockDays: null,
        restoreDatabase,
        dumpSha256: expectedDumpSha256,
        decryptedSha256: sha256(decrypted),
        finishedMigrations: 52,
        publicTables: 75,
        indexes,
        foreignKeys,
        restoredCounts: "0|0|0|0|0|0|0|0",
        workingChurch: afterChurch,
        bucketObjectCountAfter: 0,
      })}\n`,
    );
  } catch (error) {
    if (uploaded && !verified) {
      process.stderr.write("Restore verification did not pass, so the uploaded object was not deleted.\n");
    }
    throw error;
  } finally {
    client.destroy();
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${publicError(error)}\n`);
  process.exit(1);
});
