import { BackupGuardError, withBackupTimeout, withBoundedRetries } from "./independent-backup-guard";

export type RetentionRule = {
  id: string;
  prefix: string;
  lockSeconds: number;
  expireSeconds: number;
};

const daySeconds = 24 * 60 * 60;

export const proposedRetentionRules: readonly RetentionRule[] = [
  {
    id: "lock-test-postgres-daily",
    prefix: "test/postgres/daily/",
    lockSeconds: 14 * daySeconds,
    expireSeconds: 15 * daySeconds,
  },
  {
    id: "lock-test-postgres-weekly",
    prefix: "test/postgres/weekly/",
    lockSeconds: 56 * daySeconds,
    expireSeconds: 57 * daySeconds,
  },
  {
    id: "lock-test-statements",
    prefix: "test/statements/",
    lockSeconds: 90 * daySeconds,
    expireSeconds: 91 * daySeconds,
  },
];

export const preservedMultipartAbortSeconds = 7 * daySeconds;

export function assertProposedRetentionRules(rules: readonly RetentionRule[] = proposedRetentionRules) {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.prefix)) {
      throw new BackupGuardError(`Retention prefix ${rule.prefix} is duplicated.`);
    }
    seen.add(rule.prefix);
    if (!rule.prefix.startsWith("test/") || !rule.prefix.endsWith("/")) {
      throw new BackupGuardError(`Retention prefix ${rule.prefix} is outside the TEST backup prefixes.`);
    }
    if (!Number.isSafeInteger(rule.lockSeconds) || rule.lockSeconds < daySeconds) {
      throw new BackupGuardError(`Lock for ${rule.id} must be at least one day.`);
    }
    if (rule.expireSeconds !== rule.lockSeconds + daySeconds) {
      throw new BackupGuardError(`Expiration for ${rule.id} must be one day after its lock.`);
    }
  }
  for (const left of rules) {
    for (const right of rules) {
      if (left === right) continue;
      if (right.prefix.startsWith(left.prefix) && left.lockSeconds > right.lockSeconds) {
        throw new BackupGuardError(`Prefix ${left.prefix} would lengthen the lock for ${right.prefix}.`);
      }
    }
  }
  return rules;
}

export function postgresBackupKey(date: Date, cadence: "daily" | "weekly") {
  if (Number.isNaN(date.getTime())) {
    throw new BackupGuardError("Backup date is invalid.");
  }
  const day = date.toISOString().slice(0, 10);
  return `test/postgres/${cadence}/${day}/bits-test-db.dump.age`;
}

export function scheduledBackupKeys(date: Date) {
  assertProposedRetentionRules();
  const keys = [postgresBackupKey(date, "daily")];
  if (date.getUTCDay() === 0) keys.push(postgresBackupKey(date, "weekly"));
  return keys;
}

export function runPreparedBackupStep<T>(operation: (signal: AbortSignal) => Promise<T>) {
  return withBoundedRetries(() => withBackupTimeout(operation));
}
