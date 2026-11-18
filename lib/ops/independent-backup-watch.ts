import { BackupGuardError, backupLimits, independentBackupBucket } from "./independent-backup-guard";
import { redactBackupError } from "./independent-backup-railway-once";

export const backupWatchScheduleUtc = "45 11 * * *";
export const backupDeadlineMinuteUtc = 11 * 60 + 45;
const storedObjectAllowanceBytes = 4096;

const dailyObjectKey =
  /^test\/postgres\/daily\/(\d{4}-\d{2}-\d{2})\/bits-test-db-(\d{8})T\d{6}Z\.dump\.age$/;

export type BackupObjectRecord = {
  key: string;
  size: number;
  sha256?: string;
};

export type BackupRunStatus = "succeeded" | "failed" | "running" | "skipped";

export type BackupRunRecord = {
  status: BackupRunStatus;
};

export type BackupWatchReason = "ok" | "pending" | "failed" | "never-started" | "missing";

export type DailyBackupAssessment = {
  bucket: typeof independentBackupBucket;
  dueDay: string;
  deadlineUtc: string;
  alert: boolean;
  reason: BackupWatchReason;
  matchingKeys: string[];
  deletes: false;
  notificationSent: false;
};

export const missingArchiveDrill = "missing-archive" as const;
export const missingArchiveDrillDay = "1900-01-01";
export const missingArchiveDrillNow = "1900-01-01T12:00:00.000Z";
export const missingArchiveDrillLabel =
  "Manual missing-archive drill. This failure is expected. No archive was changed.";

const privateKeyVariableNames = ["AGE_IDENTITY", "AGE_SECRET_KEY", "BITS_BACKUP_AGE_IDENTITY"];

export type WatchInvocation =
  | { drill: false; now: Date }
  | {
      drill: typeof missingArchiveDrill;
      now: Date;
      day: typeof missingArchiveDrillDay;
      label: typeof missingArchiveDrillLabel;
    };

function assertWatchTime(now: Date) {
  if (Number.isNaN(now.getTime())) {
    throw new BackupGuardError("Backup watch time is invalid.");
  }
}

function dayFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function dueDailyBackup(now: Date) {
  assertWatchTime(now);
  const pendingToday =
    now.getUTCHours() * 60 + now.getUTCMinutes() < backupDeadlineMinuteUtc;
  const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (pendingToday) due.setUTCDate(due.getUTCDate() - 1);
  const dueDay = dayFromDate(due);
  return {
    dueDay,
    deadlineUtc: `${dueDay}T11:45:00.000Z`,
    pendingToday,
  };
}

function isCompleteDailyObject(object: BackupObjectRecord, dueDay: string) {
  const match = dailyObjectKey.exec(object.key);
  if (!match || match[1] !== dueDay) return false;
  const stampDay = `${match[2].slice(0, 4)}-${match[2].slice(4, 6)}-${match[2].slice(6, 8)}`;
  if (stampDay !== dueDay) return false;
  if (!Number.isSafeInteger(object.size) || object.size <= 0) return false;
  if (object.size > backupLimits.maxPostgresArchiveBytes + storedObjectAllowanceBytes) return false;
  return /^[a-f0-9]{64}$/.test(object.sha256 ?? "");
}

function missingReason(runs: readonly BackupRunRecord[] | undefined): Exclude<BackupWatchReason, "ok" | "pending"> {
  if (runs === undefined) return "missing";
  if (runs.some((run) => run.status === "failed" || run.status === "running" || run.status === "succeeded")) {
    return "failed";
  }
  return "never-started";
}

export function assessDailyBackup(input: {
  now: Date;
  objects: readonly BackupObjectRecord[];
  runs?: readonly BackupRunRecord[];
  day?: string;
}): DailyBackupAssessment {
  assertWatchTime(input.now);
  const due = input.day
    ? { dueDay: input.day, deadlineUtc: `${input.day}T11:45:00.000Z` }
    : dueDailyBackup(input.now);
  if (input.day && !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) {
    throw new BackupGuardError("Backup watch day is invalid.");
  }
  const matchingKeys = input.objects
    .filter((object) => isCompleteDailyObject(object, due.dueDay))
    .map((object) => object.key);
  const deadlinePassed = Date.parse(due.deadlineUtc) <= input.now.getTime();
  const failedAlready = input.runs?.some((run) => run.status === "failed" || run.status === "running") === true;
  let reason: BackupWatchReason;
  if (matchingKeys.length > 0) reason = "ok";
  else if (!deadlinePassed && !failedAlready) reason = "pending";
  else reason = missingReason(input.runs);
  return {
    bucket: independentBackupBucket,
    dueDay: due.dueDay,
    deadlineUtc: due.deadlineUtc,
    alert: reason !== "ok" && reason !== "pending",
    reason,
    matchingKeys,
    deletes: false,
    notificationSent: false,
  };
}

function argumentValue(argv: readonly string[], name: string) {
  const prefix = `--${name}=`;
  const matches = argv.filter((value) => value === `--${name}` || value.startsWith(prefix));
  if (matches.length > 1) {
    throw new BackupGuardError(`The ${name} argument was repeated.`);
  }
  const argument = matches[0];
  if (argument === `--${name}`) {
    throw new BackupGuardError(`The ${name} argument needs a value.`);
  }
  return argument?.slice(prefix.length);
}

export function assertWatchCredentials(env: Record<string, string | undefined>) {
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

export function redactWatchError(error: unknown, secrets: readonly string[]) {
  return secrets.reduce((message, secret) => {
    if (secret.trim().length < 8) return message;
    return message.split(secret).join("[redacted]");
  }, redactBackupError(error));
}

export function backupRunsFromArgument(value: string | undefined): BackupRunRecord[] | undefined {
  if (value === undefined) return undefined;
  if (value === "none") return [];
  if (value === "failed" || value === "skipped" || value === "succeeded" || value === "running") {
    return [{ status: value }];
  }
  throw new BackupGuardError("The runs argument must be none, failed, skipped, succeeded, or running.");
}

export function resolveWatchInvocation(
  argv: readonly string[],
  options: { eventName?: string; now?: Date } = {},
): WatchInvocation {
  if (argv.includes("--apply") || argv.includes("--delete")) {
    throw new BackupGuardError("The backup watch is read-only.");
  }
  const drill = argumentValue(argv, "drill");
  const nowValue = argumentValue(argv, "now");
  if (drill === undefined) {
    const now = nowValue ? new Date(nowValue) : (options.now ?? new Date());
    assertWatchTime(now);
    return { drill: false, now };
  }
  if (drill !== missingArchiveDrill) {
    throw new BackupGuardError("The drill argument must be missing-archive.");
  }
  if (options.eventName === "schedule") {
    throw new BackupGuardError("The missing-archive drill cannot run from the schedule.");
  }
  if (nowValue !== undefined || argumentValue(argv, "runs") !== undefined) {
    throw new BackupGuardError("The missing-archive drill does not accept another date or run list.");
  }
  return {
    drill: missingArchiveDrill,
    now: new Date(missingArchiveDrillNow),
    day: missingArchiveDrillDay,
    label: missingArchiveDrillLabel,
  };
}

export function assessWatch(input: {
  invocation: WatchInvocation;
  objects: readonly BackupObjectRecord[];
  runs?: readonly BackupRunRecord[];
}) {
  const assessment = input.invocation.drill
    ? assessDailyBackup({
        now: input.invocation.now,
        day: input.invocation.day,
        objects: [],
      })
    : assessDailyBackup({
        now: input.invocation.now,
        objects: input.objects,
        runs: input.runs,
      });
  if (input.invocation.drill) {
    return {
      ...assessment,
      drill: input.invocation.drill,
      injectedEmpty: true as const,
      label: input.invocation.label,
    };
  }
  return {
    ...assessment,
    drill: false as const,
    injectedEmpty: false as const,
  };
}
