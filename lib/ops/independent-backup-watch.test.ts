import { describe, expect, it } from "vitest";

import { BackupGuardError } from "./independent-backup-guard";
import { protectedBackupObjectKey } from "./independent-backup-railway-once";
import {
  assessDailyBackup,
  assessWatch,
  assertWatchCredentials,
  backupRunsFromArgument,
  dueDailyBackup,
  missingArchiveDrillDay,
  missingArchiveDrillLabel,
  redactWatchError,
  resolveWatchInvocation,
} from "./independent-backup-watch";

const checksum = "a".repeat(64);
const november18 = {
  key: "test/postgres/daily/2026-11-18/bits-test-db-20261118T162250Z.dump.age",
  size: 385_186,
  sha256: checksum,
};

describe("daily backup watch", () => {
  it("waits until 11:45 UTC and then checks that same day", () => {
    expect(dueDailyBackup(new Date("2026-11-18T11:44:00.000Z")).dueDay).toBe("2026-11-17");
    expect(dueDailyBackup(new Date("2026-11-18T11:45:00.000Z"))).toMatchObject({
      dueDay: "2026-11-18",
      deadlineUtc: "2026-11-18T11:45:00.000Z",
    });
    expect(dueDailyBackup(new Date("2026-11-20T00:30:00.000Z")).dueDay).toBe("2026-11-19");
  });

  it("accepts a completed daily archive and ignores another day, an empty object, and a weekly key", () => {
    const afterDeadline = new Date("2026-11-18T11:45:00.000Z");
    const result = assessDailyBackup({
      now: afterDeadline,
      objects: [
        november18,
        { key: protectedBackupObjectKey, size: 385_186, sha256: checksum },
        { key: november18.key, size: 0, sha256: checksum },
        {
          key: "test/postgres/weekly/2026-11-18/bits-test-db-20261118T111500Z.dump.age",
          size: 385_186,
          sha256: checksum,
        },
      ],
    });
    expect(result).toMatchObject({
      alert: false,
      reason: "ok",
      dueDay: "2026-11-18",
      matchingKeys: [november18.key],
      deletes: false,
      notificationSent: false,
    });
  });

  it("detects a failed backup that stored no archive", () => {
    const result = assessDailyBackup({
      now: new Date("2026-11-18T11:46:00.000Z"),
      objects: [{ key: protectedBackupObjectKey, size: 385_186, sha256: checksum }],
      runs: [{ status: "failed" }],
    });
    expect(result.alert).toBe(true);
    expect(result.reason).toBe("failed");
    expect(result.matchingKeys).toEqual([]);
  });

  it("detects a backup that never starts", () => {
    const result = assessDailyBackup({
      now: new Date("2026-11-18T12:00:00.000Z"),
      objects: [{ key: protectedBackupObjectKey, size: 385_186, sha256: checksum }],
      runs: [],
    });
    expect(result.alert).toBe(true);
    expect(result.reason).toBe("never-started");
  });

  it("treats a skipped run as not started and a missing checksum as no archive", () => {
    const skipped = assessDailyBackup({
      now: new Date("2026-11-18T12:00:00.000Z"),
      objects: [],
      runs: [{ status: "skipped" }],
    });
    const noChecksum = assessDailyBackup({
      now: new Date("2026-11-18T12:00:00.000Z"),
      objects: [{ key: november18.key, size: 385_186 }],
      runs: [{ status: "succeeded" }],
    });
    expect(skipped.reason).toBe("never-started");
    expect(noChecksum.reason).toBe("failed");
  });

  it("does not alert before the deadline unless a run has already failed", () => {
    const waiting = assessDailyBackup({
      now: new Date("2026-11-18T11:20:00.000Z"),
      day: "2026-11-18",
      objects: [],
    });
    const failedEarly = assessDailyBackup({
      now: new Date("2026-11-18T11:20:00.000Z"),
      day: "2026-11-18",
      objects: [],
      runs: [{ status: "failed" }],
    });
    expect(waiting).toMatchObject({ alert: false, reason: "pending" });
    expect(failedEarly).toMatchObject({ alert: true, reason: "failed" });
  });

  it("keeps a normal check successful when today's archive is present", () => {
    const invocation = resolveWatchInvocation([], { now: new Date("2026-11-18T12:00:00.000Z") });
    const report = assessWatch({ invocation, objects: [november18] });
    expect(report).toMatchObject({
      alert: false,
      reason: "ok",
      dueDay: "2026-11-18",
      drill: false,
      injectedEmpty: false,
      notificationSent: false,
    });
  });

  it("alerts when the due archive is absent", () => {
    const invocation = resolveWatchInvocation(["--now=2026-11-18T12:00:00.000Z"]);
    const report = assessWatch({
      invocation,
      objects: [{ key: protectedBackupObjectKey, size: 385_186, sha256: checksum }],
    });
    expect(report).toMatchObject({
      alert: true,
      reason: "missing",
      dueDay: "2026-11-18",
      matchingKeys: [],
      drill: false,
    });
  });

  it("uses an empty result for the manual drill even when real archives exist", () => {
    const invocation = resolveWatchInvocation(["--drill=missing-archive"], {
      eventName: "workflow_dispatch",
    });
    const report = assessWatch({ invocation, objects: [november18] });
    expect(invocation).toMatchObject({ drill: "missing-archive", day: missingArchiveDrillDay });
    expect(report).toMatchObject({
      alert: true,
      reason: "missing",
      dueDay: missingArchiveDrillDay,
      matchingKeys: [],
      drill: "missing-archive",
      injectedEmpty: true,
      label: missingArchiveDrillLabel,
      deletes: false,
      notificationSent: false,
    });
  });

  it("rejects a drill from the schedule, a bad drill, and a drill aimed at another date", () => {
    expect(() =>
      resolveWatchInvocation(["--drill=missing-archive"], { eventName: "schedule" }),
    ).toThrow(BackupGuardError);
    expect(() => resolveWatchInvocation(["--drill=today"])).toThrow(
      "The drill argument must be missing-archive.",
    );
    expect(() =>
      resolveWatchInvocation(["--drill=missing-archive", "--now=2026-11-18T12:00:00.000Z"]),
    ).toThrow("does not accept another date");
    expect(() => backupRunsFromArgument("deleted")).toThrow(BackupGuardError);
  });

  it("fails closed on bad configuration and redacts credential text", () => {
    const endpoint = "https://example.r2.cloudflarestorage.com";
    const accessKeyId = "EXAMPLEACCESSKEY";
    const secretAccessKey = "EXAMPLESECRETKEY";
    expect(() =>
      assertWatchCredentials({
        BITS_BACKUP_R2_BUCKET: "bits-independent-backups",
        BITS_BACKUP_R2_ENDPOINT: endpoint,
        BITS_BACKUP_R2_ACCESS_KEY_ID: accessKeyId,
      }),
    ).toThrow("The object read credential is incomplete.");
    expect(() =>
      assertWatchCredentials({
        BITS_BACKUP_R2_BUCKET: "bits-independent-backups",
        BITS_BACKUP_R2_ENDPOINT: endpoint,
        BITS_BACKUP_R2_ACCESS_KEY_ID: accessKeyId,
        BITS_BACKUP_R2_SECRET_ACCESS_KEY: secretAccessKey,
        AGE_SECRET_KEY: "present",
      }),
    ).toThrow("age private-key");
    const redacted = redactWatchError(
      new Error(`AccessDenied for ${accessKeyId} ${secretAccessKey} at ${endpoint}`),
      [accessKeyId, secretAccessKey, endpoint],
    );
    expect(redacted).not.toContain(accessKeyId);
    expect(redacted).not.toContain(secretAccessKey);
    expect(redacted).not.toContain(endpoint);
    expect(redacted).toContain("[redacted]");
  });
});
