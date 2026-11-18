import { HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { BackupGuardError, independentBackupBucket } from "../lib/ops/independent-backup-guard";
import { redactBackupError } from "../lib/ops/independent-backup-railway-once";
import { assessDailyBackup, type BackupRunRecord } from "../lib/ops/independent-backup-watch";

const privateKeyVariableNames = ["AGE_IDENTITY", "AGE_SECRET_KEY", "BITS_BACKUP_AGE_IDENTITY"];

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length);
}

function watchEnvironment(env: Record<string, string | undefined>) {
  for (const name of privateKeyVariableNames) {
    if (env[name]) {
      throw new BackupGuardError("Refusing to watch with an age private-key variable set.");
    }
  }
  for (const value of Object.values(env)) {
    if (value?.includes("AGE-SECRET-KEY-")) {
      throw new BackupGuardError("Refusing to watch with an age private key in the environment.");
    }
  }
  if (env.BITS_BACKUP_R2_BUCKET !== independentBackupBucket) {
    throw new BackupGuardError("The watch bucket is not bits-independent-backups.");
  }
  const endpoint = env.BITS_BACKUP_R2_ENDPOINT?.trim() ?? "";
  if (!endpoint.startsWith("https://") || !endpoint.endsWith(".r2.cloudflarestorage.com")) {
    throw new BackupGuardError("The R2 endpoint is not the approved Cloudflare endpoint.");
  }
  const accessKeyId = env.BITS_BACKUP_R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = env.BITS_BACKUP_R2_SECRET_ACCESS_KEY?.trim() ?? "";
  if (!accessKeyId || !secretAccessKey) {
    throw new BackupGuardError("The object read credential is incomplete.");
  }
  return { endpoint, accessKeyId, secretAccessKey };
}

function runsFromArgument(value: string | undefined): BackupRunRecord[] | undefined {
  if (value === undefined) return undefined;
  if (value === "none") return [];
  if (value === "failed" || value === "skipped" || value === "succeeded" || value === "running") {
    return [{ status: value }];
  }
  throw new BackupGuardError("The runs argument must be none, failed, skipped, succeeded, or running.");
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
  if (process.argv.includes("--apply") || process.argv.includes("--delete")) {
    throw new BackupGuardError("The backup watch is read-only.");
  }
  const env = watchEnvironment(process.env);
  const nowValue = argumentValue("now");
  const now = nowValue ? new Date(nowValue) : new Date();
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
    const assessment = assessDailyBackup({
      now,
      objects,
      runs: runsFromArgument(argumentValue("runs")),
    });
    process.stdout.write(`${JSON.stringify(assessment)}\n`);
    if (assessment.alert) process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  process.stderr.write(`${redactBackupError(error)}\n`);
  process.exit(1);
});
