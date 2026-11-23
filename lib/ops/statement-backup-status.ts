import { BackupGuardError, independentBackupBucket } from "./independent-backup-guard";
import { redactBackupError } from "./independent-backup-railway-once";

export const statementBackupScheduleUtc = "15 12 * * *";
export const statementBackupWatchScheduleUtc = "45 12 * * *";
export const statementBackupScheduleMinuteUtc = 12 * 60 + 15;
export const statementBackupWatchMinuteUtc = 12 * 60 + 45;
export const statementStatusMaxBytes = 1024;
export const statementBackupStatusKind = "statement-backup-status";

const statusKeyPattern =
  /^test\/statements\/status\/(\d{4}-\d{2}-\d{2})\/(\d{8})T(\d{6})Z\.json$/;
const statusOutcomes = ["empty", "unchanged", "copied", "failed"] as const;
const statusFields = [
  "version",
  "kind",
  "day",
  "completedAt",
  "outcome",
  "copied",
  "renewed",
  "unchanged",
  "failed",
  "pdfsPresent",
] as const;

export type StatementStatusOutcome = (typeof statusOutcomes)[number];

export type StatementStatusInput = {
  outcome: StatementStatusOutcome;
  copied: number;
  renewed: number;
  unchanged: number;
  failed: number;
  pdfsPresent: number;
};

export type StatementStatusObject = {
  key: string;
  size: number;
  body: string;
};

export type StatementWatchReason = "ok" | "pending" | "missing" | "stale" | "malformed" | "failed";

export type StatementWatchAssessment = {
  bucket: typeof independentBackupBucket;
  prefix: string;
  dueDay: string;
  deadlineUtc: string;
  scheduledUtc: string;
  alert: boolean;
  reason: StatementWatchReason;
  statusKey: string | null;
  outcome: StatementStatusOutcome | null;
  copied: number | null;
  renewed: number | null;
  unchanged: number | null;
  failed: number | null;
  pdfsPresent: number | null;
  emptyRun: boolean;
  proofOfCopy: false;
  deletes: false;
  notificationSent: false;
};

export const missingStatusDrill = "missing-status" as const;
export const missingStatusDrillDay = "1900-01-01";
export const missingStatusDrillNow = "1900-01-01T13:00:00.000Z";
export const missingStatusDrillLabel =
  "Manual missing-status drill. This failure is expected. No statement PDF or church record was changed.";

const privateKeyVariableNames = ["AGE_IDENTITY", "AGE_SECRET_KEY", "BITS_BACKUP_AGE_IDENTITY"];

export type StatementWatchInvocation =
  | { drill: false; now: Date }
  | {
      drill: typeof missingStatusDrill;
      now: Date;
      day: typeof missingStatusDrillDay;
      label: typeof missingStatusDrillLabel;
    };

function assertWatchTime(now: Date) {
  if (Number.isNaN(now.getTime())) {
    throw new BackupGuardError("Statement backup watch time is invalid.");
  }
}

function dayFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function statementStatusStamp(now: Date) {
  assertWatchTime(now);
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function statementStatusKey(now: Date) {
  const day = dayFromDate(now);
  return `test/statements/status/${day}/${statementStatusStamp(now)}.json`;
}

export function assertStatementStatusKey(key: string) {
  if (!statusKeyPattern.test(key)) {
    throw new BackupGuardError("The statement status destination is outside test/statements/status.");
  }
  return key;
}

export function statementStatusBody(input: StatementStatusInput, now: Date) {
  const body = Buffer.from(
    JSON.stringify({
      version: 1,
      kind: statementBackupStatusKind,
      day: dayFromDate(now),
      completedAt: now.toISOString(),
      outcome: input.outcome,
      copied: input.copied,
      renewed: input.renewed,
      unchanged: input.unchanged,
      failed: input.failed,
      pdfsPresent: input.pdfsPresent,
    }),
    "utf8",
  );
  if (body.byteLength > statementStatusMaxBytes) {
    throw new BackupGuardError("The statement status record is too large.");
  }
  return body;
}

export function dueStatementBackup(now: Date) {
  assertWatchTime(now);
  const pendingToday =
    now.getUTCHours() * 60 + now.getUTCMinutes() < statementBackupWatchMinuteUtc;
  const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (pendingToday) due.setUTCDate(due.getUTCDate() - 1);
  const dueDay = dayFromDate(due);
  return {
    dueDay,
    deadlineUtc: `${dueDay}T12:45:00.000Z`,
    scheduledUtc: `${dueDay}T12:15:00.000Z`,
    pendingToday,
  };
}

function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1000;
}

function classifyStatus(object: StatementStatusObject, dueDay: string, scheduledMs: number) {
  const match = statusKeyPattern.exec(object.key);
  if (!match || match[1] !== dueDay) return { reason: "malformed" as const };
  if (!Number.isSafeInteger(object.size) || object.size <= 0 || object.size > statementStatusMaxBytes) {
    return { reason: "malformed" as const };
  }
  if (object.body.length === 0 || Buffer.byteLength(object.body) !== object.size) {
    return { reason: "malformed" as const };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(object.body);
  } catch {
    return { reason: "malformed" as const };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { reason: "malformed" as const };
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some((key) => !statusFields.includes(key as (typeof statusFields)[number]))) {
    return { reason: "malformed" as const };
  }
  if (record.version !== 1 || record.kind !== statementBackupStatusKind || record.day !== dueDay) {
    return { reason: "malformed" as const };
  }
  if (typeof record.completedAt !== "string") return { reason: "malformed" as const };
  const completedAt = new Date(record.completedAt);
  if (Number.isNaN(completedAt.getTime()) || statementStatusStamp(completedAt) !== `${match[2]}T${match[3]}Z`) {
    return { reason: "malformed" as const };
  }
  if (
    !statusOutcomes.includes(record.outcome as StatementStatusOutcome) ||
    !count(record.copied) ||
    !count(record.renewed) ||
    !count(record.unchanged) ||
    !count(record.failed) ||
    !count(record.pdfsPresent)
  ) {
    return { reason: "malformed" as const };
  }
  const counts = {
    outcome: record.outcome as StatementStatusOutcome,
    copied: record.copied as number,
    renewed: record.renewed as number,
    unchanged: record.unchanged as number,
    failed: record.failed as number,
    pdfsPresent: record.pdfsPresent as number,
  };
  if (completedAt.getTime() < scheduledMs) return { reason: "stale" as const, counts };
  if (counts.outcome === "failed" || counts.failed > 0) {
    if (counts.outcome !== "failed" || counts.failed < 1) return { reason: "malformed" as const };
    return { reason: "failed" as const, counts };
  }
  if (counts.outcome === "empty" && (counts.copied !== 0 || counts.renewed !== 0 || counts.unchanged !== 0 || counts.pdfsPresent !== 0)) {
    return { reason: "malformed" as const };
  }
  if (counts.outcome === "copied" && counts.copied < 1) return { reason: "malformed" as const };
  if (counts.outcome !== "empty" && counts.outcome !== "unchanged" && counts.outcome !== "copied") {
    return { reason: "malformed" as const };
  }
  return { reason: "ok" as const, counts };
}

export function assessStatementBackup(input: {
  now: Date;
  statuses: readonly StatementStatusObject[];
  day?: string;
}): StatementWatchAssessment {
  assertWatchTime(input.now);
  const due = input.day
    ? {
        dueDay: input.day,
        deadlineUtc: `${input.day}T12:45:00.000Z`,
        scheduledUtc: `${input.day}T12:15:00.000Z`,
      }
    : dueStatementBackup(input.now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due.dueDay)) {
    throw new BackupGuardError("Statement backup watch day is invalid.");
  }
  const prefix = `test/statements/status/${due.dueDay}/`;
  const newest = [...input.statuses].sort((left, right) => left.key.localeCompare(right.key)).at(-1);
  const deadlinePassed = Date.parse(due.deadlineUtc) <= input.now.getTime();
  let reason: StatementWatchReason = "missing";
  let counts: StatementStatusInput | undefined;
  if (!newest) reason = deadlinePassed ? "missing" : "pending";
  else {
    const classified = classifyStatus(newest, due.dueDay, Date.parse(due.scheduledUtc));
    reason = classified.reason;
    counts = "counts" in classified ? classified.counts : undefined;
  }
  return {
    bucket: independentBackupBucket,
    prefix,
    dueDay: due.dueDay,
    deadlineUtc: due.deadlineUtc,
    scheduledUtc: due.scheduledUtc,
    alert: reason !== "ok" && reason !== "pending",
    reason,
    statusKey: newest?.key ?? null,
    outcome: counts?.outcome ?? null,
    copied: counts?.copied ?? null,
    renewed: counts?.renewed ?? null,
    unchanged: counts?.unchanged ?? null,
    failed: counts?.failed ?? null,
    pdfsPresent: counts?.pdfsPresent ?? null,
    emptyRun: counts?.outcome === "empty",
    proofOfCopy: false,
    deletes: false,
    notificationSent: false,
  };
}

function argumentValue(argv: readonly string[], name: string) {
  const prefix = `--${name}=`;
  const matches = argv.filter((value) => value === `--${name}` || value.startsWith(prefix));
  if (matches.length > 1) throw new BackupGuardError(`The ${name} argument was repeated.`);
  const argument = matches[0];
  if (argument === `--${name}`) throw new BackupGuardError(`The ${name} argument needs a value.`);
  return argument?.slice(prefix.length);
}

export function assertStatementWatchCredentials(env: Record<string, string | undefined>) {
  for (const name of privateKeyVariableNames) {
    if (env[name]) throw new BackupGuardError("Refusing to watch with an age private-key variable set.");
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
  if (!accessKeyId || !secretAccessKey) throw new BackupGuardError("The object read credential is incomplete.");
  return { endpoint, accessKeyId, secretAccessKey };
}

export function redactStatementWatchError(error: unknown, secrets: readonly string[]) {
  return secrets.reduce((message, secret) => {
    if (secret.trim().length < 8) return message;
    return message.split(secret).join("[redacted]");
  }, redactBackupError(error));
}

export function resolveStatementWatchInvocation(
  argv: readonly string[],
  options: { eventName?: string; now?: Date } = {},
): StatementWatchInvocation {
  if (argv.includes("--apply") || argv.includes("--delete")) {
    throw new BackupGuardError("The statement backup watch is read-only.");
  }
  const drill = argumentValue(argv, "drill");
  const nowValue = argumentValue(argv, "now");
  if (drill === undefined) {
    const now = nowValue ? new Date(nowValue) : (options.now ?? new Date());
    assertWatchTime(now);
    return { drill: false, now };
  }
  if (drill !== missingStatusDrill) {
    throw new BackupGuardError("The drill argument must be missing-status.");
  }
  if (options.eventName === "schedule") {
    throw new BackupGuardError("The missing-status drill cannot run from the schedule.");
  }
  if (nowValue !== undefined) {
    throw new BackupGuardError("The missing-status drill does not accept another date.");
  }
  return {
    drill: missingStatusDrill,
    now: new Date(missingStatusDrillNow),
    day: missingStatusDrillDay,
    label: missingStatusDrillLabel,
  };
}

export function assessStatementWatch(input: {
  invocation: StatementWatchInvocation;
  statuses: readonly StatementStatusObject[];
}) {
  const assessment = input.invocation.drill
    ? assessStatementBackup({ now: input.invocation.now, day: input.invocation.day, statuses: [] })
    : assessStatementBackup({ now: input.invocation.now, statuses: input.statuses });
  if (input.invocation.drill) {
    return {
      ...assessment,
      drill: input.invocation.drill,
      injectedEmpty: true as const,
      label: input.invocation.label,
    };
  }
  return { ...assessment, drill: false as const, injectedEmpty: false as const };
}
