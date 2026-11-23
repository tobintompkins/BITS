import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

import { BackupGuardError } from "../lib/ops/independent-backup-guard";
import { runAbortableCommand } from "../lib/ops/independent-backup-railway-once";
import {
  assertStatementCopyEnvironment,
  assertStatementDestinationKey,
  assertStatementInvocation,
  assertStatementRehearsalRunId,
  executeStatementCopy,
  redactStatementCopyError,
  statementCopyExitCode,
  statementRehearsalProposal,
  statementRehearsalRestoreKey,
  type StatementSourceObject,
  type StoredStatementCopy,
} from "../lib/ops/independent-statement-copy";
import { executeStatementRecovery } from "../lib/ops/independent-statement-recovery";

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length);
}

async function readBody(body: unknown) {
  if (!body || typeof body !== "object" || !(Symbol.asyncIterator in body)) {
    throw new BackupGuardError("A statement download was empty.");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function listPages(
  client: S3Client,
  bucket: string,
  prefix: string | undefined,
  signal: AbortSignal,
) {
  const objects: { key: string; size: number }[] = [];
  let token: string | undefined;
  for (let page = 1; page <= 20; page += 1) {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      { abortSignal: signal },
    );
    for (const object of listed.Contents ?? []) {
      if (!object.Key || object.Size === undefined) continue;
      objects.push({ key: object.Key, size: object.Size });
    }
    if (!listed.IsTruncated) return objects;
    token = listed.NextContinuationToken;
    if (!token) throw new BackupGuardError("The statement listing was incomplete.");
  }
  throw new BackupGuardError("The statement listing was incomplete.");
}

function sourceClient(config: ReturnType<typeof assertStatementCopyEnvironment>) {
  return new S3Client({
    region: "auto",
    endpoint: config.sourceEndpoint,
    forcePathStyle: false,
    credentials: { accessKeyId: config.sourceAccessKeyId, secretAccessKey: config.sourceSecret },
    maxAttempts: 1,
  });
}

function destinationClient(config: ReturnType<typeof assertStatementCopyEnvironment>) {
  return new S3Client({
    region: "auto",
    endpoint: config.destinationEndpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.destinationAccessKeyId,
      secretAccessKey: config.destinationSecret,
    },
    maxAttempts: 1,
  });
}

function absentBackup(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  const status = error && typeof error === "object" && "$metadata" in error
    ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    : undefined;
  return status === 404 || name === "NotFound" || name === "NoSuchKey";
}

async function recoverStatementBackup() {
  const apply = process.argv.includes("--apply");
  const runId = argumentValue("run-id");
  const manifestKey = argumentValue("manifest");
  if (!runId || !manifestKey) {
    throw new BackupGuardError("Statement recovery requires --run-id and --manifest.");
  }
  assertStatementRehearsalRunId(runId);
  const restoreKey = statementRehearsalRestoreKey(runId);
  let config: ReturnType<typeof assertStatementCopyEnvironment>;
  try {
    config = assertStatementCopyEnvironment(process.env);
  } catch (error) {
    if (apply) throw error;
    process.stdout.write(
      `${JSON.stringify({
        outcome: "unconfigured",
        runId,
        manifestKey,
        restoreKey,
        upload: false,
        deletes: false,
        scheduleEnabled: false,
        recoveryProof: false,
        usedApplicationOriginal: false,
        message: error instanceof Error ? error.message : "Statement recovery is not configured.",
      })}\n`,
    );
    process.exitCode = 2;
    return;
  }
  const source = sourceClient(config);
  const destination = destinationClient(config);
  const identityPath = join(homedir(), "Library/Application Support/BITS/independent-backup/age-identity.txt");
  try {
    const report = await executeStatementRecovery({
      sourceBucket: config.sourceBucket,
      runId,
      manifestKey,
      apply,
      clients: {
        async downloadEncrypted(key, signal) {
          try {
            const response = await destination.send(
              new GetObjectCommand({ Bucket: config.destinationBucket, Key: key }),
              { abortSignal: signal },
            );
            return await readBody(response.Body);
          } catch (error) {
            if (absentBackup(error)) return null;
            throw error;
          }
        },
        async decrypt(bytes, signal) {
          const work = mkdtempSync(join(tmpdir(), "bits-statement-recovery-"));
          try {
            const encrypted = join(work, "backup.age");
            const plain = join(work, "backup");
            writeFileSync(encrypted, bytes);
            await runAbortableCommand("age", ["-d", "-i", identityPath, "-o", plain, encrypted], signal);
            return readFileSync(plain);
          } finally {
            rmSync(work, { recursive: true, force: true });
          }
        },
        async restoreExists(key, signal) {
          if (key !== restoreKey) {
            throw new BackupGuardError("Statement recovery destination is not this run's restored PDF.");
          }
          try {
            await source.send(
              new HeadObjectCommand({ Bucket: config.sourceBucket, Key: key }),
              { abortSignal: signal },
            );
            return true;
          } catch (error) {
            if (absentBackup(error)) return false;
            throw error;
          }
        },
        async putRestore(key, body, signal) {
          if (key !== restoreKey) {
            throw new BackupGuardError("Statement recovery destination is not this run's restored PDF.");
          }
          await source.send(
            new PutObjectCommand({
              Bucket: config.sourceBucket,
              Key: key,
              Body: body,
              ContentLength: body.byteLength,
              ContentType: "application/pdf",
              IfNoneMatch: "*",
            }),
            { abortSignal: signal },
          );
        },
      },
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    source.destroy();
    destination.destroy();
  }
}

async function main() {
  const rehearsal = process.argv.includes("--rehearsal");
  const scheduled = process.argv.includes("--scheduled");
  const recover = process.argv.includes("--recover");
  assertStatementInvocation({
    rehearsal,
    scheduled,
    recover,
    delete: process.argv.includes("--delete"),
    schedule: process.argv.includes("--schedule"),
  });
  if (recover) {
    if (rehearsal) {
      throw new BackupGuardError("Statement recovery does not copy the application original.");
    }
    await recoverStatementBackup();
    return;
  }
  const apply = process.argv.includes("--apply");
  if (apply && !rehearsal && !scheduled) {
    throw new BackupGuardError("Applying a statement copy requires the reviewed synthetic rehearsal or the scheduled statement backup.");
  }
  const nowValue = argumentValue("now");
  const now = nowValue ? new Date(nowValue) : new Date();
  const runId = argumentValue("run-id");
  if (runId) assertStatementRehearsalRunId(runId);
  let config: ReturnType<typeof assertStatementCopyEnvironment>;
  try {
    config = assertStatementCopyEnvironment(process.env);
  } catch (error) {
    if (apply) throw error;
    process.stdout.write(
      `${JSON.stringify({
        ...statementRehearsalProposal(),
        outcome: "unconfigured",
        upload: false,
        recoveryProof: false,
        message: error instanceof Error ? error.message : "Statement copy is not configured.",
      })}\n`,
    );
    process.exitCode = 2;
    return;
  }
  const source = sourceClient(config);
  const destination = destinationClient(config);
  try {
    const report = await executeStatementCopy({
      sourceBucket: config.sourceBucket,
      now,
      apply,
      rehearsal,
      scheduled,
      runId,
      clients: {
        async listSource(signal) {
          const listed = await listPages(source, config.sourceBucket, "private/statements/", signal);
          const objects: StatementSourceObject[] = [];
          for (const object of listed) {
            const response = await source.send(
              new GetObjectCommand({ Bucket: config.sourceBucket, Key: object.key }),
              { abortSignal: signal },
            );
            objects.push({ key: object.key, bytes: await readBody(response.Body) });
          }
          return objects;
        },
        async listDestination(signal) {
          const listed = await listPages(destination, config.destinationBucket, "test/statements/objects/", signal);
          const objects: StoredStatementCopy[] = [];
          for (const object of listed) {
            const head = await destination.send(
              new HeadObjectCommand({ Bucket: config.destinationBucket, Key: object.key }),
              { abortSignal: signal },
            );
            objects.push({
              key: object.key,
              size: head.ContentLength ?? object.size,
              sourceKeySha256: head.Metadata?.["source-key-sha256"],
              sourceSha256: head.Metadata?.["source-sha256"],
              ciphertextSha256: head.Metadata?.["ciphertext-sha256"],
            });
          }
          const all = await listPages(destination, config.destinationBucket, undefined, signal);
          return { objects, totalBytes: all.reduce((total, object) => total + object.size, 0) };
        },
        async putDestination(object, signal) {
          await destination.send(
            new PutObjectCommand({
              Bucket: config.destinationBucket,
              Key: object.key,
              Body: object.body,
              ContentLength: object.body.byteLength,
              ContentType: "application/octet-stream",
              IfNoneMatch: "*",
              Metadata: object.metadata,
            }),
            { abortSignal: signal },
          );
        },
        async confirmStored(key, signal) {
          assertStatementDestinationKey(key);
          try {
            const head = await destination.send(
              new HeadObjectCommand({ Bucket: config.destinationBucket, Key: key }),
              { abortSignal: signal },
            );
            return {
              sourceKeySha256: head.Metadata?.["source-key-sha256"],
              sourceSha256: head.Metadata?.["source-sha256"],
              ciphertextSha256: head.Metadata?.["ciphertext-sha256"],
            };
          } catch (error) {
            if (absentBackup(error)) return null;
            throw error;
          }
        },
        async encrypt(bytes, signal) {
          const { mkdtempSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
          const { tmpdir } = await import("node:os");
          const { join } = await import("node:path");
          const work = mkdtempSync(join(tmpdir(), "bits-statement-copy-"));
          try {
            const plain = join(work, "plain");
            const encrypted = join(work, "plain.age");
            writeFileSync(plain, bytes);
            await runAbortableCommand("age", ["-r", config.recipient, "-o", encrypted, plain], signal);
            return readFileSync(encrypted);
          } finally {
            rmSync(work, { recursive: true, force: true });
          }
        },
      },
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exitCode = statementCopyExitCode(report);
  } finally {
    source.destroy();
    destination.destroy();
  }
}

main().catch((error) => {
  const secrets = [
    process.env.BITS_BACKUP_STATEMENT_SOURCE_ACCESS_KEY_ID,
    process.env.BITS_BACKUP_STATEMENT_SOURCE_SECRET_ACCESS_KEY,
    process.env.BITS_BACKUP_R2_ACCESS_KEY_ID,
    process.env.BITS_BACKUP_R2_SECRET_ACCESS_KEY,
  ].filter((value): value is string => Boolean(value));
  process.stderr.write(`${redactStatementCopyError(error, secrets)}\n`);
  process.exit(1);
});
