import { describe, expect, it } from "vitest";

import { protectedBackupObjectKey } from "./independent-backup-railway-once";
import { assessDailyBackup, dueDailyBackup } from "./independent-backup-watch";

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
});
