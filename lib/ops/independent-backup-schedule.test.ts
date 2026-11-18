import { describe, expect, it } from "vitest";

import {
  postgresBackupKey,
  proposedRetentionRules,
  runPreparedBackupStep,
  scheduledBackupKeys,
} from "./independent-backup-schedule";

describe("proposed backup retention", () => {
  it("describes the unused weekly proposal and keeps expirations one day after locks", () => {
    expect(proposedRetentionRules.map((rule) => [rule.prefix, rule.expireSeconds - rule.lockSeconds])).toEqual([
      ["test/postgres/daily/", 86_400],
      ["test/postgres/weekly/", 86_400],
      ["test/statements/", 86_400],
    ]);
    const tuesday = new Date("2026-11-17T11:15:00.000Z");
    const sunday = new Date("2026-11-15T11:15:00.000Z");
    expect(scheduledBackupKeys(tuesday)).toEqual([
      "test/postgres/daily/2026-11-17/bits-test-db.dump.age",
    ]);
    expect(scheduledBackupKeys(sunday)).toEqual([
      "test/postgres/daily/2026-11-15/bits-test-db.dump.age",
      "test/postgres/weekly/2026-11-15/bits-test-db.dump.age",
    ]);
    expect(postgresBackupKey(tuesday, "daily")).not.toBe(postgresBackupKey(sunday, "daily"));
    expect(scheduledBackupKeys(tuesday).some((key) => key.startsWith("test/rehearsal/"))).toBe(false);
  });

  it("runs a prepared step through the existing retry and timeout wrapper", async () => {
    await expect(runPreparedBackupStep(async () => "ready")).resolves.toBe("ready");
  });
});
