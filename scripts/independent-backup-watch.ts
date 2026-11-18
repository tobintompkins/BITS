import { HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { BackupGuardError, independentBackupBucket } from "../lib/ops/independent-backup-guard";
import {
  assertWatchCredentials,
  assessWatch,
  backupRunsFromArgument,
  redactWatchError,
  resolveWatchInvocation,
} from "../lib/ops/independent-backup-watch";

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length);
}

async function listDailyObjects(client: S3Client) {
  const objects: { key: string; size: number; sha256?: string }[] = [];
  let token: string | undefined;
  for (let page = 1; page <= 20; page += 1) {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: independentBackupBucket,
        Prefix: "test/postgres/daily/",
        ContinuationToken: token,
      }),
    );
    for (const object of listed.Contents ?? []) {
      if (!object.Key || object.Size === undefined) continue;
      objects.push({ key: object.Key, size: object.Size });
    }
    if (!listed.IsTruncated) return objects;
    token = listed.NextContinuationToken;
    if (!token) throw new BackupGuardError("The daily backup listing was incomplete.");
  }
  throw new BackupGuardError("The daily backup listing was incomplete.");
}

async function main() {
  const invocation = resolveWatchInvocation(process.argv.slice(2), {
    eventName: process.env.GITHUB_EVENT_NAME,
  });
  const env = assertWatchCredentials(process.env);
  const client = new S3Client({
    region: "auto",
    endpoint: env.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    maxAttempts: 1,
  });
  try {
    const listed = await listDailyObjects(client);
    const objects = [];
    for (const object of listed) {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: independentBackupBucket, Key: object.key }),
      );
      objects.push({
        key: object.key,
        size: head.ContentLength ?? object.size,
        sha256: head.Metadata?.sha256,
      });
    }
    const report = assessWatch({
      invocation,
      objects,
      runs: invocation.drill ? undefined : backupRunsFromArgument(argumentValue("runs")),
    });
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
  process.stderr.write(`${redactWatchError(error, secrets)}\n`);
  process.exit(1);
});
