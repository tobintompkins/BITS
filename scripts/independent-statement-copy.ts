import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

import { BackupGuardError } from "../lib/ops/independent-backup-guard";
import { runAbortableCommand } from "../lib/ops/independent-backup-railway-once";
import {
  assertStatementCopyEnvironment,
  executeStatementCopy,
  redactStatementCopyError,
  statementRehearsalProposal,
  type StatementSourceObject,
  type StoredStatementCopy,
} from "../lib/ops/independent-statement-copy";

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

async function main() {
  if (process.argv.includes("--delete") || process.argv.includes("--schedule")) {
    throw new BackupGuardError("The statement copy does not delete objects or enable a schedule.");
  }
  const apply = process.argv.includes("--apply");
  const rehearsal = process.argv.includes("--rehearsal");
  if (apply && !rehearsal) {
    throw new BackupGuardError("Applying a statement copy requires the reviewed synthetic rehearsal.");
  }
  const nowValue = argumentValue("now");
  const now = nowValue ? new Date(nowValue) : new Date();
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
    if (report.outcome === "missing-rehearsal-pdf" || report.outcome === "unconfigured") process.exitCode = 2;
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
