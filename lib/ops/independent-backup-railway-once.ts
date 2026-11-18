import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  BackupGuardError,
  assertAgeRecipient,
  assertUploadAllowed,
  independentBackupBucket,
  backupLimits,
  withBackupTimeout,
  withBoundedRetries,
} from "./independent-backup-guard";

export const protectedBackupObjectKey =
  "test/postgres/daily/2026-11-17/bits-test-db-20261117T210100Z.dump.age";
export const approvedAgeRecipient =
  "age1x3n3tp6nryyhtavnr3eppkav0pc47vfeps9qqf30afkc7w9yc9dq8265jm";

const privateKeyVariableNames = new Set([
  "AGE_IDENTITY",
  "AGE_SECRET_KEY",
  "BITS_BACKUP_AGE_IDENTITY",
]);

export type RailwayBackupEnvironment = {
  recipient: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  databaseUrl: string;
};

export function redactBackupError(error: unknown) {
  const message = error instanceof Error && error.message ? error.message : "Backup failed.";
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "postgres://redacted")
    .replace(/AGE-SECRET-KEY-[A-Z0-9-]+/g, "AGE-SECRET-KEY-redacted");
}

export function dailyBackupObjectKey(now: Date) {
  if (Number.isNaN(now.getTime())) {
    throw new BackupGuardError("Backup date is invalid.");
  }
  const day = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return assertDailyBackupKey(`test/postgres/daily/${day}/bits-test-db-${stamp}.dump.age`);
}

export function assertDailyBackupKey(key: string) {
  if (!/^test\/postgres\/daily\/\d{4}-\d{2}-\d{2}\/bits-test-db-\d{8}T\d{6}Z\.dump\.age$/.test(key)) {
    throw new BackupGuardError("The backup key is outside the daily TEST prefix.");
  }
  if (key === protectedBackupObjectKey) {
    throw new BackupGuardError("Refusing to overwrite the protected backup.");
  }
  return key;
}

export function assertCanUpload(input: {
  key: string;
  existingKeys: readonly string[];
  archiveBytes: number;
  existingBytes: number;
  incomingBytes: number;
}) {
  const key = assertDailyBackupKey(input.key);
  if (input.existingKeys.includes(key)) {
    throw new BackupGuardError("Refusing to overwrite an existing backup.");
  }
  assertUploadAllowed({
    kind: "postgres",
    archiveBytes: input.archiveBytes,
    existingBucketBytes: input.existingBytes,
    incomingBytes: input.incomingBytes,
  });
  return key;
}

export function assertRailwayBackupEnvironment(
  env: Record<string, string | undefined>,
  now = new Date(),
): RailwayBackupEnvironment {
  for (const [name, value] of Object.entries(env)) {
    if (privateKeyVariableNames.has(name)) {
      throw new BackupGuardError("Refusing to run with an age private-key variable set.");
    }
    if (value?.includes("AGE-SECRET-KEY-")) {
      throw new BackupGuardError("Refusing to run with an age private key in the environment.");
    }
  }
  const recipient = assertAgeRecipient(env.BITS_BACKUP_AGE_RECIPIENT);
  if (recipient !== approvedAgeRecipient) {
    throw new BackupGuardError("The age recipient does not match the approved public recipient.");
  }
  if (env.BITS_BACKUP_R2_BUCKET !== independentBackupBucket) {
    throw new BackupGuardError("The upload bucket is not bits-independent-backups.");
  }
  const endpoint = env.BITS_BACKUP_R2_ENDPOINT?.trim() ?? "";
  if (!endpoint.startsWith("https://") || !endpoint.endsWith(".r2.cloudflarestorage.com")) {
    throw new BackupGuardError("The R2 endpoint is not the approved Cloudflare endpoint.");
  }
  const accessKeyId = env.BITS_BACKUP_R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = env.BITS_BACKUP_R2_SECRET_ACCESS_KEY?.trim() ?? "";
  if (!accessKeyId || !secretAccessKey) {
    throw new BackupGuardError("The object upload credential is incomplete.");
  }
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  let databaseName = "";
  try {
    const parsed = new URL(databaseUrl);
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    throw new BackupGuardError("DATABASE_URL must refer to bits-test-db.");
  }
  if (databaseName !== "railway") {
    throw new BackupGuardError("DATABASE_URL must refer to bits-test-db.");
  }
  return {
    recipient,
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket: independentBackupBucket,
    key: dailyBackupObjectKey(now),
    databaseUrl,
  };
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function guarded<T>(
  signal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<T>,
  sleep?: (delayMs: number) => Promise<void>,
) {
  return withBoundedRetries(() => withBackupTimeout(operation, { signal }), { signal, sleep });
}

export function stopChildOnAbort(child: ChildProcess, signal: AbortSignal) {
  const stop = () => {
    if (child.pid && process.platform !== "win32") {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // The process group is already gone.
      }
    }
    if (!child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        // The process is already gone.
      }
    }
  };
  if (signal.aborted) stop();
  else signal.addEventListener("abort", stop, { once: true });
}

function pgConnectionEnv(databaseUrl: string): Record<string, string | undefined> {
  const parsed = new URL(databaseUrl);
  const sslmode = parsed.searchParams.get("sslmode");
  return {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    ...(sslmode ? { PGSSLMODE: sslmode } : {}),
  };
}

export function runAbortableCommand(
  command: string,
  args: string[],
  signal: AbortSignal,
  env?: Record<string, string | undefined>,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    stopChildOnAbort(child, signal);
    if (!child.stdout || !child.stderr) {
      child.kill("SIGKILL");
      reject(new BackupGuardError("The backup command did not provide output pipes."));
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value ?? "");
    };
    const onAbort = () => {
      finish(new BackupGuardError(`Backup timed out after ${backupLimits.timeoutMs}ms.`));
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (signal.aborted) return;
      if (code === 0) finish(undefined, stdout.trim());
      else finish(new BackupGuardError(redactBackupError(new Error(stderr.trim() || `${command} exited ${code ?? "unknown"}.`))));
    });
  });
}

function createClient(config: RailwayBackupEnvironment) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

async function listBucket(client: S3Client, bucket: string, signal: AbortSignal) {
  const keys: string[] = [];
  let bytes = 0;
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
      }),
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

async function headObject(client: S3Client, bucket: string, key: string, signal: AbortSignal) {
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
}

export async function runApprovedRailwayBackup(
  env: Record<string, string | undefined> = process.env,
  options: {
    now?: Date;
    runCommand?: typeof runAbortableCommand;
    sleep?: (delayMs: number) => Promise<void>;
  } = {},
) {
  const config = assertRailwayBackupEnvironment(env, options.now ?? new Date());
  const runCommand = options.runCommand ?? runAbortableCommand;
  const work = mkdtempSync(join(tmpdir(), "bits-test-backup-"));
  const dumpPath = join(work, "bits-test-db.dump");
  const encryptedPath = join(work, "bits-test-db.dump.age");
  const client = createClient(config);
  try {
    return await withBackupTimeout(
      (signal) =>
        executeBackup({ config, runCommand, dumpPath, encryptedPath, client, signal, sleep: options.sleep }),
      { timeoutMs: backupLimits.timeoutMs },
    );
  } finally {
    client.destroy();
    rmSync(work, { recursive: true, force: true });
  }
}

async function executeBackup(input: {
  config: RailwayBackupEnvironment;
  runCommand: typeof runAbortableCommand;
  dumpPath: string;
  encryptedPath: string;
  client: S3Client;
  signal: AbortSignal;
  sleep?: (delayMs: number) => Promise<void>;
}) {
  const { config, runCommand, dumpPath, encryptedPath, client, signal, sleep } = input;
  const dumpVersion = await guarded(signal, (childSignal) => runCommand("pg_dump", ["--version"], childSignal), sleep);
  if (!/PostgreSQL\)\s+18\./.test(dumpVersion)) {
    throw new BackupGuardError("pg_dump 18 is required for bits-test-db.");
  }
  await guarded(signal, (childSignal) => runCommand("age", ["--version"], childSignal), sleep);
  await guarded(signal, (childSignal) =>
    runCommand(
      "pg_dump",
      ["--format=custom", "--no-password", "--file", dumpPath],
      childSignal,
      pgConnectionEnv(config.databaseUrl),
    ),
    sleep,
  );
  await guarded(signal, (childSignal) =>
    runCommand("age", ["-r", config.recipient, "-o", encryptedPath, dumpPath], childSignal),
    sleep,
  );
  const archive = readFileSync(dumpPath);
  const encrypted = readFileSync(encryptedPath);
  const archiveSha256 = sha256(archive);
  const ciphertextSha256 = sha256(encrypted);
  const existing = await guarded(signal, (childSignal) => listBucket(client, config.bucket, childSignal), sleep);
  assertCanUpload({
    key: config.key,
    existingKeys: existing.keys,
    archiveBytes: archive.length,
    existingBytes: existing.bytes,
    incomingBytes: encrypted.length,
  });
  await guarded(signal, async (childSignal) => {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: config.key,
          Body: encrypted,
          ContentLength: encrypted.length,
          ContentType: "application/octet-stream",
          Metadata: { sha256: ciphertextSha256 },
        }),
        { abortSignal: childSignal },
      );
    } catch (error) {
      if (childSignal.aborted) throw error;
      const head = await headObject(client, config.bucket, config.key, childSignal).catch(() => null);
      if (head?.ContentLength === encrypted.length && head.Metadata?.sha256 === ciphertextSha256) return;
      throw error;
    }
  }, sleep);
  const head = await guarded(signal, (childSignal) => headObject(client, config.bucket, config.key, childSignal), sleep);
  if (head.ContentLength !== encrypted.length || head.Metadata?.sha256 !== ciphertextSha256) {
    throw new BackupGuardError("The uploaded object did not match the encrypted backup.");
  }
  return {
    ok: true as const,
    bucket: config.bucket,
    key: config.key,
    archiveBytes: archive.length,
    archiveSha256,
    encryptedBytes: encrypted.length,
    ciphertextSha256,
    headBytes: head.ContentLength,
    lockDays: 14,
    expireEligibleDays: 15,
  };
}
