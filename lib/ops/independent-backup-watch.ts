import { BackupGuardError, backupLimits, independentBackupBucket } from "./independent-backup-guard";

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
