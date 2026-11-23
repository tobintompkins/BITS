import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { BackupGuardError, independentBackupBucket } from "../lib/ops/independent-backup-guard";
import {
  assertStatementWatchCredentials,
  assessStatementWatch,
  dueStatementBackup,
  redactStatementWatchError,
  resolveStatementWatchInvocation,
  statementStatusMaxBytes,
  type StatementStatusObject,
} from "../lib/ops/statement-backup-status";

async function readBody(body: unknown) {
  if (!body || typeof body !== "object" || !(Symbol.asyncIterator in body)) {
    throw new BackupGuardError("A statement status download was empty.");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function listStatusObjects(client: S3Client, prefix: string) {
  const objects: { key: string; size: number }[] = [];
  let token: string | undefined;
  for (let page = 1; page <= 20; page += 1) {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: independentBackupBucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const object of listed.Contents ?? []) {
      if (!object.Key || object.Size === undefined) continue;
      objects.push({ key: object.Key, size: object.Size });
    }
    if (!listed.IsTruncated) return objects;
    token = listed.NextContinuationToken;
    if (!token) throw new BackupGuardError("The statement status listing was incomplete.");
  }
  throw new BackupGuardError("The statement status listing was incomplete.");
}

async function main() {
  const invocation = resolveStatementWatchInvocation(process.argv.slice(2), {
    eventName: process.env.GITHUB_EVENT_NAME,
  });
  if (invocation.drill) {
    const report = assessStatementWatch({ invocation, statuses: [] });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exitCode = 1;
    return;
  }
  const env = assertStatementWatchCredentials(process.env);
  const due = dueStatementBackup(invocation.now);
  const client = new S3Client({
    region: "auto",
    endpoint: env.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
    maxAttempts: 1,
  });
  try {
    const listed = await listStatusObjects(client, `test/statements/status/${due.dueDay}/`);
    const statuses: StatementStatusObject[] = [];
    for (const object of listed) {
      if (object.size <= 0 || object.size > statementStatusMaxBytes) {
        statuses.push({ key: object.key, size: object.size, body: "" });
        continue;
      }
      const response = await client.send(
        new GetObjectCommand({ Bucket: independentBackupBucket, Key: object.key }),
      );
      const body = await readBody(response.Body);
      statuses.push({ key: object.key, size: body.byteLength, body: body.toString("utf8") });
    }
    const report = assessStatementWatch({ invocation, statuses });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (report.alert) process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  const secrets = [
    process.env.BITS_BACKUP_R2_ACCESS_KEY_ID,
    process.env.BITS_BACKUP_R2_SECRET_ACCESS_KEY,
    process.env.BITS_BACKUP_R2_ENDPOINT,
  ].filter((value): value is string => Boolean(value));
  process.stderr.write(`${redactStatementWatchError(error, secrets)}\n`);
  process.exit(1);
});
